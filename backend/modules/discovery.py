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
          'vendor': '<sysObjectID or parsed vendor>',
          'os_version': '<optional SNMP OS‐version>',
          'status': '<"up" or "down">',
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
        hostname    = row["db_hostname"]
        description = row["db_description"]
        error       = None
        vendor      = ""
        os_version  = ""
        status      = "unknown"  # ← initialize status

        try:
            # attempt SNMP lookups against the SNMP‐Sim container (port from env)
            snmp_host = os.getenv("SNMP_HOSTNAME", "snmpsim")
            snmp_port = int(os.getenv("SNMP_PORT", 1161))

            # 1) sysDescr → description
            snmp_descr = snmp_get(
                snmp_host,
                community=os.getenv("SNMP_COMMUNITY", "public"),
                oid="1.3.6.1.2.1.1.1.0",
                port=snmp_port
            )
            description = snmp_descr or description

            # 2) sysName → hostname
            snmp_name = snmp_get(
                snmp_host,
                community=os.getenv("SNMP_COMMUNITY", "public"),
                oid="1.3.6.1.2.1.1.5.0",
                port=snmp_port
            )
            hostname = snmp_name or hostname

            # 3) sysObjectID → vendor (very basic mapping)
            sysobj = snmp_get(
                snmp_host,
                community=os.getenv("SNMP_COMMUNITY", "public"),
                oid="1.3.6.1.2.1.1.2.0",
                port=snmp_port
            )
            vendor = sysobj or ""

            # 4) (Optional) fetch an OS‐version OID if your SNMP‐Sim supports it:
            #    os_ver = snmp_get(snmp_host, os.getenv("SNMP_COMMUNITY","public"),
            #                      "<your‐os‐ver‐OID>", port=snmp_port)
            #    os_version = os_ver or ""

            # 5) Determine “up/down” via sysUpTime (if it responds, device is “up”)
            _ = snmp_get(
                snmp_host,
                community=os.getenv("SNMP_COMMUNITY", "public"),
                oid="1.3.6.1.2.1.1.3.0",
                port=snmp_port
            )
            status = "up"

        except Exception as e:
            # If any of the SNMP calls (including ping) fails, mark status = "down"
            error  = str(e)
            status = "down"

        devices.append({
            "ip":          ip,
            "hostname":    hostname or "",
            "description": description or "",
            "vendor":      vendor,
            "os_version":  os_version,
            "status":      status,      # ← include status in returned dict
            "error":       error
        })

    return devices
