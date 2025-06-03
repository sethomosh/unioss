# backend/modules/traffic.py

from datetime import datetime
from backend.utils.snmp_client import snmp_get, snmp_walk
from backend.utils.db import get_db_connection
import time

# OID bases (for 64-bit counters and interface metadata)
IF_HC_IN_OCTETS_BASE  = "1.3.6.1.2.1.31.1.1.1.6"  # ifHCInOctets.<ifIndex>
IF_HC_OUT_OCTETS_BASE = "1.3.6.1.2.1.31.1.1.1.10" # ifHCOutOctets.<ifIndex>
IF_DESCR_BASE         = "1.3.6.1.2.1.2.2.1.2"     # ifDescr.<ifIndex>
IF_SPEED_BASE         = "1.3.6.1.2.1.2.2.1.5"     # ifSpeed.<ifIndex>

# In-memory cache for the previous poll’s counters
# Structure: { (ip, ifIndex): { "in": int, "out": int, "timestamp": float } }
_prev_counters = {}

def get_traffic_stats():
    """
    Fetches traffic stats for all devices, computes kbps by comparing to previous counters,
    stores into traffic_metrics table, and returns a list of dicts:
      [
        {
          "device_ip": "192.168.1.10",
          "interface_index": 1,
          "inbound_kbps":  123.45,
          "outbound_kbps": 67.89,
          "errors": 0,
          "timestamp": "2025-06-03T12:00:00Z"
        },
        ...
      ]
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 1) Get all devices
    cursor.execute("SELECT id, ip FROM devices")
    devices = cursor.fetchall()

    results = []
    now = time.time()

    for d in devices:
        device_id = d["id"]
        ip = d["ip"]

        # 2) Walk the interfaces for this device
        #    We can join with device_interfaces, but we want OIDs by ifIndex directly
        #    Optionally, we could read from device_interfaces table if already populated.
        #    For simplicity, assume device_interfaces is correct:
        cursor.execute(
            "SELECT interface_index FROM device_interfaces WHERE device_id = %s",
            (device_id,)
        )
        intfs = cursor.fetchall()

        for row in intfs:
            idx = row["interface_index"]

            try:
                # 3) Fetch raw 64-bit in/out octets
                in_oid = f"{IF_HC_IN_OCTETS_BASE}.{idx}"
                out_oid = f"{IF_HC_OUT_OCTETS_BASE}.{idx}"

                in_raw  = snmp_get(ip, "public", in_oid, port=1161)
                out_raw = snmp_get(ip, "public", out_oid, port=1161)

                in_val  = int(in_raw)
                out_val = int(out_raw)

                # 4) Look for previous counters to compute delta
                key = (ip, idx)
                prev = _prev_counters.get(key)
                if prev:
                    elapsed = now - prev["timestamp"]
                    delta_in  = max(in_val  - prev["in"],  0)
                    delta_out = max(out_val - prev["out"], 0)

                    # Convert to kilobits/sec: (octets * 8 bits/octet) / elapsed / 1000
                    inbound_kbps  = round((delta_in  * 8) / elapsed / 1000, 2)
                    outbound_kbps = round((delta_out * 8) / elapsed / 1000, 2)
                else:
                    # No previous counter: can’t calculate a rate. Return 0 or skip.
                    inbound_kbps  = 0.0
                    outbound_kbps = 0.0

                # 5) Update cache
                _prev_counters[key] = {
                    "in": in_val,
                    "out": out_val,
                    "timestamp": now
                }

                ts = datetime.utcfromtimestamp(now)

                # 6) Persist into traffic_metrics
                cursor.execute(
                    """
                    INSERT INTO traffic_metrics
                    (device_ip, interface_index, timestamp, inbound_kbps, outbound_kbps, errors)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (ip, idx, ts, inbound_kbps, outbound_kbps, 0)
                )
                conn.commit()

                results.append({
                    "device_ip": ip,
                    "interface_index": idx,
                    "inbound_kbps": inbound_kbps,
                    "outbound_kbps": outbound_kbps,
                    "errors": 0,
                    "timestamp": ts.isoformat() + "Z"
                })

            except Exception as e:
                # On error, log and return zeros
                conn.rollback()
                results.append({
                    "device_ip": ip,
                    "interface_index": idx,
                    "inbound_kbps":  None,
                    "outbound_kbps": None,
                    "errors":          1,
                    "timestamp":       datetime.utcfromtimestamp(now).isoformat() + "Z",
                    "error":           str(e)
                })

    cursor.close()
    conn.close()
    return results
