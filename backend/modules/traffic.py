# backend/modules/traffic.py

from datetime import datetime
from backend.utils.db import get_db_connection

def get_traffic_stats():
    """
    Fetches traffic stats for all interfaces recorded in device_interfaces.
    Since SNMP-Sim does not expose actual counters under ifHCInOctets/ifHCOutOctets,
    we return one entry per (device_ip, interface_index) with inbound_kbps/outbound_kbps set to None.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # 1) Get all devices (id + ip)
    cursor.execute("SELECT id, ip FROM devices")
    devices = cursor.fetchall()

    results = []
    ts = datetime.utcnow().isoformat() + "Z"

    for d in devices:
        device_id = d["id"]
        ip = d["ip"]

        # 2) Get all interfaces for this device from device_interfaces
        cursor.execute(
            "SELECT interface_index, name FROM device_interfaces WHERE device_id = %s",
            (device_id,)
        )
        intfs = cursor.fetchall()

        for row in intfs:
            idx       = row["interface_index"]
            iface_nm  = row["name"]   # <— grab the interface name from DB

            results.append({
                "device_ip":       ip,
                "interface_index": idx,
                "iface_name":      iface_nm,        # <— include it here
                "inbound_kbps":    None,
                "outbound_kbps":   None,
                "errors":          0,
                "timestamp":       ts
            })
    cursor.close()
    conn.close()
    return results
