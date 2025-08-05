# backend/modules/traffic.py

from datetime import datetime
import os
from backend.utils.snmp_client import snmp_get, snmp_walk
from backend.utils.db import get_db_connection
from backend.utils.traffic_utils import compute_kbps_delta

# Environment
SNMP_HOST      = os.getenv("SNMP_HOST", "snmpsim")
SNMP_PORT      = int(os.getenv("SNMP_PORT", 1161))
SNMP_COMMUNITY = os.getenv("SNMP_COMMUNITY", "public")

import logging
logger = logging.getLogger(__name__)

# base OIDs for ifInOctets / ifOutOctets
OID_IN   = "1.3.6.1.2.1.2.2.1.10"
OID_OUT  = "1.3.6.1.2.1.2.2.1.16"
# new SNMP OIDs
OID_IF_DESCR   = "1.3.6.1.2.1.2.2.1.2"   # interface names
OID_IF_IN_ERR  = "1.3.6.1.2.1.2.2.1.14"  # inErrors
OID_IF_OUT_ERR = "1.3.6.1.2.1.2.2.1.20"  # outErrors

# maximum counter before wrap (assuming 32-bit)
COUNTER_MAX = 2**32

def get_traffic_stats():
    """
    Walk raw SNMP counters + names, compute kbps deltas vs. last seen,
    upsert raw counters into traffic_counters_last, insert traffic_metrics.
    """
    now = datetime.utcnow()
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    # 1) load last-seen into map
    cur.execute("""
        SELECT device_ip, interface_index,
               last_in_octets, last_out_octets,
               last_in_errors, last_out_errors,
               last_seen
        FROM traffic_counters_last
    """)
    last_seen_map = {
        (r["device_ip"], r["interface_index"]): r
        for r in cur.fetchall()
    }

    snapshot = []

    # 2) for each device
    cur.execute("SELECT ip FROM devices")
    for (ip,) in cur.fetchall():
        logger.info(f"→ Processing device {ip!r}")

        # 2a) fetch interface count
        try:
            num_ifs = int(snmp_get(SNMP_HOST, SNMP_COMMUNITY,
                                   "1.3.6.1.2.1.2.1.0",
                                   port=SNMP_PORT))
        except Exception as e:
            logger.error(f"Failed to fetch ifNumber for {ip}: {e}")
            continue

        # 2b) walk interface names
        descr_map = {}
        try:
            for oid_str, val in snmp_walk(SNMP_HOST, SNMP_COMMUNITY,
                                          OID_IF_DESCR,
                                          port=SNMP_PORT):
                idx = int(oid_str.rsplit(".", 1)[1])
                descr_map[idx] = val
        except Exception as e:
            logger.warning(f"Could not walk ifDescr for {ip}: {e}")

        # 2c) GET counters & errors per index
        in_map, out_map = {}, {}
        in_err_map, out_err_map = {}, {}

        for idx in range(1, num_ifs + 1):
            try:
                in_map[idx]      = int(snmp_get(SNMP_HOST, SNMP_COMMUNITY,
                                                 f"{OID_IN}.{idx}",
                                                 port=SNMP_PORT))
                out_map[idx]     = int(snmp_get(SNMP_HOST, SNMP_COMMUNITY,
                                                 f"{OID_OUT}.{idx}",
                                                 port=SNMP_PORT))
                in_err_map[idx]  = int(snmp_get(SNMP_HOST, SNMP_COMMUNITY,
                                                 f"{OID_IF_IN_ERR}.{idx}",
                                                 port=SNMP_PORT))
                out_err_map[idx] = int(snmp_get(SNMP_HOST, SNMP_COMMUNITY,
                                                 f"{OID_IF_OUT_ERR}.{idx}",
                                                 port=SNMP_PORT))
            except Exception as e:
                logger.warning(f"SNMP GET failed idx={idx} on {ip}: {e}")
        logger.info(f"   num_ifs={num_ifs}, in_map={in_map}, out_map={out_map}")

        if not in_map:
            logger.warning(f"No counters for {ip!r}, skipping")
            continue

        # 3) compute deltas & write
        for idx, in_raw in in_map.items():
            out_raw    = out_map.get(idx, 0)
            in_err_raw = in_err_map.get(idx, 0)
            out_err_raw= out_err_map.get(idx, 0)
            key        = (ip, idx)
            last       = last_seen_map.get(key)

            if last:
                delta_s          = (now - last["last_seen"]).total_seconds() or 1
                inbound_kbps     = compute_kbps_delta(in_raw,
                                                      last["last_in_octets"],
                                                      delta_s)
                outbound_kbps    = compute_kbps_delta(out_raw,
                                                      last["last_out_octets"],
                                                      delta_s)
                # error wrap logic
                in_err_delta     = in_err_raw - last["last_in_errors"]
                out_err_delta    = out_err_raw - last["last_out_errors"]
                if in_err_delta  < 0: in_err_delta  += COUNTER_MAX
                if out_err_delta < 0: out_err_delta += COUNTER_MAX
                in_errors        = in_err_delta
                out_errors       = out_err_delta
                errors           = in_errors + out_errors
            else:
                inbound_kbps = outbound_kbps = 0.0
                in_errors = out_errors = errors = 0

            name = descr_map.get(idx, "")

            # 3a) upsert raw counters
            cur.execute("""
                INSERT INTO traffic_counters_last
                  (device_ip, interface_index, iface_name,
                   last_in_octets, last_out_octets,
                   last_in_errors, last_out_errors,
                   last_seen)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                  iface_name      = VALUES(iface_name),
                  last_in_octets  = VALUES(last_in_octets),
                  last_out_octets = VALUES(last_out_octets),
                  last_in_errors  = VALUES(last_in_errors),
                  last_out_errors = VALUES(last_out_errors),
                  last_seen       = VALUES(last_seen)
            """, (
                ip, idx, name,
                in_raw, out_raw,
                in_err_raw, out_err_raw,
                now
            ))

            # 3b) insert into traffic_metrics
            cur.execute("""
                INSERT INTO traffic_metrics
                  (device_ip, interface_index, iface_name,
                   inbound_kbps, outbound_kbps,
                   in_errors, out_errors, errors,
                   timestamp)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                ip, idx, name,
                inbound_kbps, outbound_kbps,
                in_errors, out_errors, errors,
                now
            ))

            logger.info(
                f"[SNAPSHOT] {ip} idx={idx} "
                f"in={inbound_kbps}kbps out={outbound_kbps}kbps "
                f"errors={errors}"
            )

            snapshot.append({
                "device_ip":       ip,
                "interface_index": idx,
                "iface_name":      name,
                "inbound_kbps":    inbound_kbps,
                "outbound_kbps":   outbound_kbps,
                "in_errors":       in_errors,
                "out_errors":      out_errors,
                "errors":          errors,
                "timestamp":       now.isoformat() + "Z"
            })

    conn.commit()
    cur.close()
    conn.close()

    logger.info(f"Snapshot {len(snapshot)} entries at {now.isoformat()}Z")
    return snapshot


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    get_traffic_stats()
