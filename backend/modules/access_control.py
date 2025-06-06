# backend/modules/access_control.py

from backend.utils.db import get_db_connection

def get_active_sessions():
    """
    Returns a list of all access sessions in the `access_sessions` table.
    Each dict has keys: user, ip, mac, login_time, logout_time, duration, authenticated_via
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Pull every row (you could filter WHERE logout_time IS NULL if you only want
    # “currently active,” but front end expects them all)
    cursor.execute("""
        SELECT
            user,
            ip,
            mac,
            login_time,
            logout_time,
            duration_seconds AS duration,
            authenticated_via
        FROM access_sessions
        ORDER BY login_time DESC
    """)
    rows = cursor.fetchall()

    result = []
    for row in rows:
        login_iso = row["login_time"].isoformat() + "Z"
        logout_iso = None
        if row["logout_time"]:
            logout_iso = row["logout_time"].isoformat() + "Z"

        result.append({
            "user":              row["user"],
            "ip":                row["ip"],
            "mac":               row["mac"],
            "login_time":        login_iso,
            "logout_time":       logout_iso,
            "duration":          row["duration"],          # int or None
            "authenticated_via": row["authenticated_via"]
        })

    cursor.close()
    conn.close()
    return result
