# backend/modules/performance.py

from datetime import datetime
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection

# OIDs (change if your SNMP simulator uses different ones)
CPU_LOAD_OID         = "1.3.6.1.4.1.2021.11.10.0"  # UCD-SNMP’s laLoad.1 or similar
MEM_TOTAL_OID        = "1.3.6.1.4.1.2021.4.5.0"   # Total RAM
MEM_AVAILABLE_OID    = "1.3.6.1.4.1.2021.4.6.0"   # Available (or used—check your sim)
UPTIME_TICKS_OID     = "1.3.6.1.2.1.1.3.0"       # sysUpTime

def get_performance_metrics():
    """
    Fetches performance metrics for all devices, writes into performance_metrics table, and returns a list:
      [
        {
          "ip": "...",
          "cpu_usage": "12.34",
          "memory_usage": "45.67",
          "uptime": "123456",           # in seconds
          "timestamp": "2025-06-03T12:00:00Z"
        }, ...
      ]
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 1) Fetch all device IPs
    cursor.execute("SELECT ip FROM devices")
    devices = cursor.fetchall()

    results = []

    for d in devices:
        ip = d["ip"]

        try:
            # 2) CPU load (as a percent)
            cpu_raw = snmp_get(ip, "public", CPU_LOAD_OID, port=1161)        # e.g. "12" (percent)
            cpu_pct = float(cpu_raw)

            # 3) Memory used / total to compute percent
            total_mem_raw = snmp_get(ip, "public", MEM_TOTAL_OID, port=1161)   # e.g. "1024000" KB
            avail_mem_raw = snmp_get(ip, "public", MEM_AVAILABLE_OID, port=1161) # e.g. "524288" KB
            total_mem = float(total_mem_raw)
            avail_mem = float(avail_mem_raw)
            used_mem = total_mem - avail_mem
            mem_pct = (used_mem / total_mem) * 100 if total_mem > 0 else 0.0

            # 4) Uptime ticks → seconds
            uptime_raw = snmp_get(ip, "public", UPTIME_TICKS_OID, port=1161)   # e.g. "12345678" (hundredths of second)
            uptime_centi = float(uptime_raw)
            uptime_secs = int(uptime_centi / 100)

            # 5) Timestamp
            ts = datetime.utcnow()

            # 6) Persist into performance_metrics
            cursor.execute(
                """
                INSERT INTO performance_metrics (device_ip, timestamp, cpu_pct, memory_pct, uptime_secs)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (ip, ts, round(cpu_pct, 2), round(mem_pct, 2), uptime_secs)
            )
            conn.commit()

            results.append({
                "ip": ip,
                "cpu_usage": f"{round(cpu_pct, 2)}",
                "memory_usage": f"{round(mem_pct, 2)}",
                "uptime": str(uptime_secs),
                "timestamp": ts.isoformat() + "Z"
            })

        except Exception as e:
            # Log error but continue with next device
            conn.rollback()
            results.append({
                "ip": ip,
                "cpu_usage": None,
                "memory_usage": None,
                "uptime": None,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "error": str(e)
            })

    cursor.close()
    conn.close()
    return results
