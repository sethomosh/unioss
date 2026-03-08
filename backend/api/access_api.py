from flask import Blueprint, jsonify, current_app, request
from flask_cors import CORS
from backend.modules.access_control import get_active_sessions
from backend.utils.db import get_db_connection
import datetime

access_api = Blueprint('access_api', __name__)
CORS(access_api)

@access_api.route('/sessions', methods=['GET'])
def list_sessions():
    """
    GET /api/access/sessions
    Returns a list of current access sessions.
    """
    try:
        sessions = get_active_sessions()
        # Transform to contract
        response = [
            {
                "user": s["user"],
                "ip": s["ip"],
                "mac": s["mac"],
                "login_time": s["login_time"],
                "logout_time": s.get("logout_time"),
                "duration": s.get("duration"),
                "authenticated_via": s.get("authenticated_via", "unknown")
            }
            for s in sessions
        ]
        current_app.logger.info(f"Fetched {len(response)} access sessions")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Access sessions error: {e}")
        return jsonify({"error": str(e)}), 500

@access_api.route('/acl', methods=['GET'])
def list_acl():
    """
    GET /api/access/acl
    Fetch the list of allowed/blocked MAC addresses.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id, mac_address, device_ip, auth_method, status, created_at FROM client_acl ORDER BY created_at DESC")
        rows = cur.fetchall() or []
        for r in rows:
            if isinstance(r.get("created_at"), datetime.datetime):
                r["created_at"] = r["created_at"].isoformat()
        return jsonify(rows), 200
    except Exception as e:
        current_app.logger.error(f"ACL fetch error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@access_api.route('/acl', methods=['POST'])
def add_acl():
    """
    POST /api/access/acl
    Body: { "mac_address": "AA:BB:CC:DD:EE:FF", "device_ip": "10.0.1.5", "auth_method": "manual" }
    """
    data = request.json or {}
    mac = data.get("mac_address")
    ip = data.get("device_ip")
    auth_method = data.get("auth_method", "manual")
    if not mac or not ip:
        return jsonify({"error": "mac_address and device_ip are required"}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO client_acl (mac_address, device_ip, auth_method, status)
            VALUES (%s, %s, %s, 'allowed')
            ON DUPLICATE KEY UPDATE auth_method = VALUES(auth_method), status = 'allowed'
            """,
            (mac, ip, auth_method)
        )
        conn.commit()
        return jsonify({"success": True}), 201
    except Exception as e:
        current_app.logger.error(f"ACL insert error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@access_api.route('/kickout', methods=['POST'])
def kickout_client():
    """
    POST /api/access/kickout
    Body: { "mac_address": "AA:BB:...", "device_ip": "10.0.1.5", "reason": "policy violation" }
    Simulates a client kickout. Logs it, marks session disconnected, and creates an alert.
    """
    data = request.json or {}
    mac = data.get("mac_address")
    ip = data.get("device_ip")
    reason = data.get("reason", "administrator kick")
    
    if not mac or not ip:
        return jsonify({"error": "mac_address and device_ip are required"}), 400

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        now = datetime.datetime.utcnow()
        
        # 1. log kickout
        cur.execute("INSERT INTO client_kickouts (mac_address, device_ip, reason, timestamp) VALUES (%s, %s, %s, %s)",
                    (mac, ip, reason, now))
        
        # 2. block in ACL if exists
        cur.execute("UPDATE client_acl SET status = 'blocked' WHERE mac_address = %s AND device_ip = %s", (mac, ip))
        
        # 3. mark active session disconnected (if we had a sessions table for clients, we'd update it here)
        # Assuming access_sessions is the table:
        cur.execute("UPDATE access_sessions SET logout_time = %s WHERE mac = %s AND ip = %s AND logout_time IS NULL",
                    (now, mac, ip))
        
        conn.commit()
        
        try:
            from backend.api.alerts_api import insert_alert_internal
            msg = f"Client {mac} kicked out. Reason: {reason}"
            insert_alert_internal(device_ip=ip, severity="high", message=msg, category="auth.kickout")
        except Exception as e:
            current_app.logger.error(f"Failed to generate kickout alert: {e}")
            
        return jsonify({"success": True}), 200
    except Exception as e:
        current_app.logger.error(f"Kickout error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
