# backend/modules/discovery.py

from ..utils.snmp_client import snmp_get

def get_device_inventory():
    """
    Polls configured APs via SNMP and returns a list of device dicts:
    [{'ip': '192.168.1.10', 'hostname': '...', 'description': '...'}, ...]
    """
    devices = []

    # Example target IPs; replace or extend as needed
    for ip in ['192.168.1.10', '192.168.1.11']:
        try:
            # Retrieve sysDescr and sysName via SNMP
            description = snmp_get(ip, 'public', '1.3.6.1.2.1.1.1.0')
            hostname    = snmp_get(ip, 'public', '1.3.6.1.2.1.1.5.0')
            devices.append({
                'ip': ip,
                'hostname': hostname,
                'description': description
            })
        except Exception as e:
            # On error, include the exception message
            devices.append({
                'ip': ip,
                'error': str(e)
            })

    return devices
