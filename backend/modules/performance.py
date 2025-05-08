# backend/modules/performance.py
from datetime import datetime
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection  # assuming you have one

def get_performance_metrics():
    """
    Fetches performance metrics for all devices.
    Returns: List[dict] with keys: ip, cpu_usage, memory_usage, uptime, timestamp
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT ip FROM devices")  # or however you store them
    devices = cursor.fetchall()

    results = []
    for d in devices:
        ip = d["ip"]
        # SNMP OIDs are just examples:
        cpu = snmp_get(ip, "public", "1.3.6.1.4.1.2021.11.10.0")
        mem = snmp_get(ip, "public", "1.3.6.1.4.1.2021.4.6.0")
        uptime = snmp_get(ip, "public", "1.3.6.1.2.1.1.3.0")
        results.append({
            "ip": ip,
            "cpu_usage": cpu,
            "memory_usage": mem,
            "uptime": uptime,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

    cursor.close()
    conn.close()
    return results
