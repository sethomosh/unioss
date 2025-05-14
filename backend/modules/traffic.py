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
    cursor.execute("""
       SELECT 
            d.ip AS ip,
            di.interface_index AS interface_index,
            di.name AS name
         FROM device_interfaces  di
         JOIN devices  d ON di.device_id = d.id
    """)
    rows = cursor.fetchall()
    results = []

    for row in rows:
        ip = row["ip"]
        idx = row["interface_index"]
        name = row["name"]
        # replace these OIDs with your actual interface counters
        in_octets = snmp_get(ip, "public", f"1.3.6.1.2.1.2.2.1.10.{idx}")
        out_octets = snmp_get(ip, "public", f"1.3.6.1.2.1.2.2.1.16.{idx}")
        results.append({
            "device_ip": ip,
            "interface": name,
            "inbound_kbps": in_octets,
            "outbound_kbps": out_octets,
            "errors": 0,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })

    cursor.close()
    conn.close()
    return results
