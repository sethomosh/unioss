# backend/modules/discovery.py

def get_device_inventory():
    """
    Polls configured APs via SNMP (or REST/SSH) and returns a list of
    device dicts: [{'ip': '10.0.0.1', 'mac': 'AA:BB:CC:DD:EE:FF', ...}, ...]
    """
    # TODO: replace this stub with real SNMP calls
    devices = [
        {'ip': '192.168.1.10', 'mac': 'AA:BB:CC:01:02:03', 'model': 'NanoStation LBE'},
        {'ip': '192.168.1.11', 'mac': 'AA:BB:CC:01:02:04', 'model': 'LiteBeam 5AC'},
    ]
    return devices
