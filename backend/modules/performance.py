# backend/modules/performance.py

from datetime import datetime
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection
import random

# OIDs for UCD-SNMP CPU, memory, uptime (if your SNMP-Sim or real agent supports them)
CPU_LOAD_OID      = "1.3.6.1.4.1.2021.11.10.0"  # e.g. UCD-SNMP laLoad.1
MEM_TOTAL_OID     = "1.3.6.1.4.1.2021.4.5.0"   # total RAM (KB)
MEM_AVAILABLE_OID = "1.3.6.1.4.1.2021.4.6.0"   # available RAM (KB)
UPTIME_TICKS_OID  = "1.3.6.1.2.1.1.3.0"       # sysUpTime (hundredths of seconds)

def get_performance_metrics():
    """
    For each device IP, attempt SNMP GET of CPU load, memory used %, and uptime.
    Returns a list of dicts:
      [
        {
          "ip": "192.168.1.10",
          "cpu":    "12.34",         # percent, as string
          "memory": "45.67",         # percent, as string
          "uptime": "123456",        # seconds, as string
          "last_updated": "2025-06-05T13:20:45Z"
        },
        ...
      ]
    If an OID isn’t reachable (e.g. SNMP-Sim lacks it), that field will be null.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT ip FROM devices")
    devices = cursor.fetchall()

    results = []
    for d in devices:
        ip = d["ip"]
        ts = datetime.utcnow().isoformat() + "Z"

        # Generate random “demo” values:
        cpu_pct = round(random.uniform(5.0, 80.0), 2)
        mem_pct = round(random.uniform(10.0, 90.0), 2)
        uptime_secs = random.randint(60, 86400)  # 1 min → 24 h

        # 1) CPU load
        try:
            raw_cpu = snmp_get("snmpsim", "public", CPU_LOAD_OID, port=1161)
            cpu_pct = round(float(raw_cpu), 2)
        except Exception:
            cpu_pct = None

        # 2) Memory % = (total − avail) / total × 100
        try:
            total_mem_raw = snmp_get("snmpsim", "public", MEM_TOTAL_OID, port=1161)
            avail_mem_raw = snmp_get("snmpsim", "public", MEM_AVAILABLE_OID, port=1161)
            total_mem = float(total_mem_raw)
            avail_mem = float(avail_mem_raw)
            used_mem = total_mem - avail_mem
            mem_pct = round((used_mem / total_mem) * 100, 2) if total_mem > 0 else None
        except Exception:
            mem_pct = None

        # 3) Uptime (centiseconds → seconds)
        try:
            raw_uptime = snmp_get("snmpsim", "public", UPTIME_TICKS_OID, port=1161)
            # raw_uptime is in centiseconds (hundredths of a second)
            uptime_secs = int(float(raw_uptime) / 100)
        except Exception:
            uptime_secs = None

        results.append({
            "ip":           ip,
            "cpu":          cpu_pct,                         # number or None
            "memory":       mem_pct,                         # number or None
            "uptime":       str(uptime_secs) if uptime_secs is not None else None,
            "last_updated": ts
        })

    cursor.close()
    conn.close()
    return results
