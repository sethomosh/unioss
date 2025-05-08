def get_active_sessions():
    """
    Stub for Access Control: returns list of current user sessions.
    Replace with real logic (e.g. querying a database or SNMP traps).
    """
    return [
        {
            "user": "alice",                      # ← add this
            "ip": "192.168.1.10",
            "mac": "AA:BB:CC:01:02:03",
            "status": "allowed",
            "login_time": "2025-05-08T16:00:00Z",   # ← required
            "logout_time": None,                   # ← allow None
            "duration": None,                      # ← allow None
            "authenticated_via": "snmp"            # ← any string
        },
        {
            "user": "bob",                        # ← and this
            "ip": "192.168.1.11",
            "mac": "AA:BB:CC:01:02:04",
            "status": "blocked",
            "login_time": "2025-05-08T15:30:00Z",
            "logout_time": "2025-05-08T16:00:00Z",
            "duration": 1800,                      # seconds, e.g.
            "authenticated_via": "database"
        },
    ]
