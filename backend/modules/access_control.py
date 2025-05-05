# backend/modules/access_control.py

def get_active_sessions():
    """
    Stub for Access Control: returns list of current user sessions.
    Replace with real logic (e.g. querying a database or SNMP traps).
    """
    return [
        {"ip": "192.168.1.10", "mac": "AA:BB:CC:01:02:03", "status": "allowed"},
        {"ip": "192.168.1.11", "mac": "AA:BB:CC:01:02:04", "status": "blocked"},
    ]
