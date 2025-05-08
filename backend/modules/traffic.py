# backend/modules/traffic.py

from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection
from datetime import datetime

def get_traffic_stats():
    """
    Fetches traffic stats for all devices.
    Returns: List[dict] with keys: ip, ifInOctets, ifOutOctets, timestamp
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT ip, interface_index FROM device_interfaces")  # or your schema
    rows = cursor.fetchall()
    results = []

    for row in rows:
        ip = row["ip"]
        idx = row["interface_index"]
        # replace these OIDs with your actual interface counters
        in_octets = snmp_get(ip, "public", f"1.3.6.1.2.1.2.2.1.10.{idx}")
        out_octets = snmp_get(ip, "public", f"1.3.6.1.2.1.2.2.1.16.{idx}")
        results.append({
            "ip": ip,
            "ifInOctets": in_octets,
            "ifOutOctets": out_octets,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

    cursor.close()
    conn.close()
    return results
