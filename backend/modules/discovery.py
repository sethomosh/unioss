# backend/modules/discovery.py

import os
from backend.utils.db import get_db_connection
from backend.utils.snmp_client import snmp_get

def get_device_inventory():
    """
    Pulls all devices from the 'devices' table, enriches each with
    SNMP sysDescr and sysName, and returns a list of dicts:
      [
        {
          'ip': '192.168.1.10',
          'hostname': '<snmp sysName or DB hostname>',
          'description': '<snmp sysDescr or DB description>',
          'error': None
        },
        ...
      ]
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ip, hostname AS db_hostname, description AS db_description FROM devices")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    devices = []
    for row in rows:
        ip = row["ip"]
        # fallbacks from the DB
        hostname = row["db_hostname"]
        description = row["db_description"]
        error = None

        try:
            # attempt SNMP lookups
            snmp_descr = snmp_get(ip, community=os.getenv("SNMP_COMMUNITY", "public"), oid="1.3.6.1.2.1.1.1.0", port=int(os.getenv("SNMP_PORT", 1161)))
            snmp_name  = snmp_get(ip, community=os.getenv("SNMP_COMMUNITY", "public"), oid="1.3.6.1.2.1.1.5.0", port=int(os.getenv("SNMP_PORT", 1161)))
            description = snmp_descr or description
            hostname    = snmp_name  or hostname
        except Exception as e:
            error = str(e)

        devices.append({
            "ip":          ip,
            "hostname":    hostname or "",
            "description": description or "",
            "error":       error
        })

    return devices
