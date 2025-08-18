# backend/modules/traffic.py
from datetime import datetime
import os
from backend.utils.snmp_client import snmp_get, snmp_walk
from backend.utils.db import get_db_connection
from backend.utils.traffic_utils import compute_kbps_delta
import logging

logger = logging.getLogger(__name__)

# environment / default snmpsim port (we will pass device ip per-query)
SNMP_PORT      = int(os.getenv("SNMP_PORT", 1161))
SNMP_COMMUNITY = os.getenv("SNMP_COMMUNITY", "public")

# base OIDs for ifInOctets / ifOutOctets
OID_IN   = "1.3.6.1.2.1.2.2.1.10"
OID_OUT  = "1.3.6.1.2.1.2.2.1.16"
OID_IF_DESCR   = "1.3.6.1.2.1.2.2.1.2"
OID_IF_IN_ERR  = "1.3.6.1.2.1.2.2.1.14"
OID_IF_OUT_ERR = "1.3.6.1.2.1.2.2.1.20"

MAX_32 = 2**32
MAX_64 = 2**64

def _safe_int(s, default=0):
    """
    coerce strings like '12345', 'Counter32: 12345', 'Timeticks: (12345)' to int
    return default if unable.
    """
    if s is None:
        return default
    try:
        return int(s)
    except Exception:
        # extract first long run of digits
        import re
        m = re.search(r'(\d+)', str(s))
        if m:
            try:
                return int(m.group(1))
            except Exception:
                return default
        return default

def _wrap_aware_delta(prev, new):
    """
    return (delta, is_64) -> detect whether wrap occurred using thresholds,
    choose 32 or 64-bit based on magnitude heuristics.
    """
    # quick heuristics: if values > 2**32 assume 64-bit counters
    if new >= MAX_32 or prev >= MAX_32:
        maxv = MAX_64
        is64 = True
    else:
        maxv = MAX_32
        is64 = False

    if new >= prev:
        delta = new - prev
    else:
        # wrapped or reset
        delta = (new + maxv) - prev
    return delta, is64

def get_traffic_stats():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

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

    # iterate devices
    cur.execute("SELECT ip FROM devices")
    for (ip,) in cur.fetchall():
        logger.info(f"→ processing device {ip!r}")

        # fetch interface count from the device ip (pass ip to snmp)
        try:
            num_ifs_raw = snmp_get(ip, SNMP_COMMUNITY,
                                   "1.3.6.1.2.1.2.1.0",
                                   port=SNMP_PORT)
            num_ifs = _safe_int(num_ifs_raw, default=0)
        except Exception as e:
            logger.error(f"failed to fetch ifNumber for {ip}: {e}")
            continue

        descr_map = {}
        try:
            for oid_str, val in snmp_walk(ip, SNMP_COMMUNITY,
                                          OID_IF_DESCR,
                                          port=SNMP_PORT):
                try:
                    idx = int(oid_str.rsplit(".", 1)[1])
                except Exception:
                    continue
                descr_map[idx] = val or ""
        except Exception as e:
            logger.warning(f"could not walk ifDescr for {ip}: {e}")

        in_map, out_map = {}, {}
        in_err_map, out_err_map = {}, {}

        for idx in range(1, num_ifs + 1):
            try:
                in_raw_s = snmp_get(ip, SNMP_COMMUNITY, f"{OID_IN}.{idx}", port=SNMP_PORT)
                out_raw_s = snmp_get(ip, SNMP_COMMUNITY, f"{OID_OUT}.{idx}", port=SNMP_PORT)
                in_err_s = snmp_get(ip, SNMP_COMMUNITY, f"{OID_IF_IN_ERR}.{idx}", port=SNMP_PORT)
                out_err_s = snmp_get(ip, SNMP_COMMUNITY, f"{OID_IF_OUT_ERR}.{idx}", port=SNMP_PORT)

                in_map[idx]      = _safe_int(in_raw_s, default=0)
                out_map[idx]     = _safe_int(out_raw_s, default=0)
                in_err_map[idx]  = _safe_int(in_err_s, default=0)
                out_err_map[idx] = _safe_int(out_err_s, default=0)
            except Exception as e:
                logger.warning(f"snmp get failed idx={idx} on {ip}: {e}")

        if not in_map:
            logger.warning(f"no counters for {ip!r}, skipping")
            continue

        for idx, in_raw in in_map.items():
            now = datetime.utcnow()
            out_raw    = out_map.get(idx, 0)
            in_err_raw = in_err_map.get(idx, 0)
            out_err_raw= out_err_map.get(idx, 0)
            key        = (ip, idx)
            last       = last_seen_map.get(key)

            if last:
                delta_s = (now - last["last_seen"]).total_seconds() or 1
                prev_in = _safe_int(last.get("last_in_octets", 0), default=0)
                prev_out = _safe_int(last.get("last_out_octets", 0), default=0)

                in_delta, in_is64 = _wrap_aware_delta(prev_in, in_raw)
                out_delta, out_is64 = _wrap_aware_delta(prev_out, out_raw)

                inbound_kbps = (in_delta * 8) / (delta_s * 1000.0)
                outbound_kbps = (out_delta * 8) / (delta_s * 1000.0)

                # errors
                in_err_delta = in_err_raw - _safe_int(last.get("last_in_errors", 0))
                out_err_delta = out_err_raw - _safe_int(last.get("last_out_errors", 0))
                # fallback wrap for errors
                if in_err_delta < 0:
                    in_err_delta += MAX_32
                if out_err_delta < 0:
                    out_err_delta += MAX_32

                in_errors = in_err_delta
                out_errors = out_err_delta
                errors = in_errors + out_errors
            else:
                inbound_kbps = outbound_kbps = 0.0
                in_errors = out_errors = errors = 0

            name = descr_map.get(idx, "")

            # upsert raw counters
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

            try:
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
            except Exception as e:
                logger.warning(f"failed to insert traffic_metrics for {ip} idx={idx} at {now.isoformat()}Z: {e}")
                conn.rollback()

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

    logger.info(f"snapshot {len(snapshot)} entries at {datetime.utcnow().isoformat()}Z")
    return snapshot


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    get_traffic_stats()
