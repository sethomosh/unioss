# backend/modules/traffic.py

from datetime import datetime
from backend.utils.db import get_db_connection
from backend.utils.snmp_client import snmp_walk
import logging

logger = logging.getLogger(__name__)

# base OIDs for ifInOctets / ifOutOctets
OID_IN  = "1.3.6.1.2.1.2.2.1.10"
OID_OUT = "1.3.6.1.2.1.2.2.1.16"

# maximum counter before wrap (assuming 32‑bit)
COUNTER_MAX = 2**32

def get_traffic_stats():
    """
    Walk raw SNMP counters, compute kbps deltas vs. last seen,
    upsert raw counters, insert one traffic_metrics row per interface.
    """
    now = datetime.utcnow()
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)

    # 1) read last‑seen raw counters into a dict
    cur.execute("SELECT device_ip, interface_index, last_in_octets, last_out_octets, last_seen FROM traffic_counters_last")
    last_seen_map = {
        (r["device_ip"], r["interface_index"]): r
        for r in cur.fetchall()
    }

    snapshot = []

    # 2) for each device/interface, pull SNMP counters
    cur.execute("SELECT ip, id FROM devices")
    for dev in cur.fetchall():
        ip = dev["ip"]
        # walk in / out counters for this IP
        in_rows  = list(snmp_walk(ip, "public", OID_IN, port=1161))
        out_rows = list(snmp_walk(ip, "public", OID_OUT, port=1161))

        # build a map idx → raw value
        in_map  = { int(oid.rsplit(".",1)[1]): int(val) for oid,val in in_rows }
        out_map = { int(oid.rsplit(".",1)[1]): int(val) for oid,val in out_rows }

        for idx, in_raw in in_map.items():
            out_raw = out_map.get(idx, 0)
            key = (ip, idx)
            last = last_seen_map.get(key)

            # compute delta only if we have history
            if last:
                delta_s = (now - last["last_seen"]).total_seconds() or 1
                # handle wrap
                in_delta  = in_raw  - last["last_in_octets"]
                out_delta = out_raw - last["last_out_octets"]
                if in_delta < 0:  in_delta  += COUNTER_MAX
                if out_delta < 0: out_delta += COUNTER_MAX

                # bits → kilobits/s
                inbound_kbps  = round((in_delta  * 8) / (delta_s * 1000), 2)
                outbound_kbps = round((out_delta * 8) / (delta_s * 1000), 2)
            else:
                # no prior: report None (or 0)
                inbound_kbps = outbound_kbps = None

            # 3) upsert raw counters into traffic_counters_last
            cur.execute("""
                INSERT INTO traffic_counters_last
                  (device_ip, interface_index, last_in_octets, last_out_octets, last_seen)
                VALUES (%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                  last_in_octets = VALUES(last_in_octets),
                  last_out_octets = VALUES(last_out_octets),
                  last_seen = VALUES(last_seen)
            """, (ip, idx, in_raw, out_raw, now))

            # 4) insert into traffic_metrics
            cur.execute("""
                INSERT INTO traffic_metrics
                  (device_ip, interface_index, timestamp, inbound_kbps, outbound_kbps, errors)
                VALUES (%s,%s,%s,%s,%s,%s)
            """, (ip, idx, now, inbound_kbps, outbound_kbps, 0))

            snapshot.append({
                "device_ip":       ip,
                "interface_index": idx,
                "inbound_kbps":    inbound_kbps,
                "outbound_kbps":   outbound_kbps,
                "errors":          0,
                "timestamp":       now.isoformat() + "Z"
            })

    conn.commit()
    cur.close()
    conn.close()
    logger.info(f"Snapshot {len(snapshot)} traffic entries at {now.isoformat()}Z")
    return snapshot
