# backend/api/alerts_api.py
import logging
import datetime
from flask import Blueprint, jsonify, request
from backend.utils.db import get_db_connection

logger = logging.getLogger("alerts_api")
alerts_api = Blueprint("alerts", __name__)

@alerts_api.route("/recent", methods=["GET"])
def get_recent_alerts():
    limit = request.args.get("limit", 5, type=int)
    query = """
        SELECT id, device_ip, severity, message, timestamp,
               IFNULL(acknowledged, 0) AS acknowledged, category
        FROM alerts
        ORDER BY timestamp DESC
        LIMIT %s
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (limit,))
        rows = cur.fetchall() or []
        for r in rows:
            r["acknowledged"] = bool(r.get("acknowledged"))
            if isinstance(r.get("timestamp"), datetime.datetime):
                r["timestamp"] = r["timestamp"].isoformat()
        return jsonify(rows), 200
    except Exception as e:
        logger.exception("Error fetching recent alerts: %s", e)
        return jsonify({"error": "Error fetching recent alerts"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@alerts_api.route("/<int:alert_id>/acknowledge", methods=["POST"])
def acknowledge_alert(alert_id):
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("SELECT id, acknowledged FROM alerts WHERE id=%s", (alert_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Alert not found"}), 404
            
        if row.get("acknowledged"):
            return jsonify({"success": True, "message": "Already acknowledged"}), 200

        cur.execute("UPDATE alerts SET acknowledged = 1 WHERE id = %s", (alert_id,))
        conn.commit()
        logger.info("Alert %s acknowledged", alert_id)
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.exception("Failed to acknowledge alert %s: %s", alert_id, e)
        return jsonify({"error": "Failed to acknowledge alert"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

def insert_alert_internal(device_ip: str, severity: str, message: str, category: str = None) -> bool:
    """
    Internal helper to insert a new alert into the DB.
    """
    query = """
        INSERT INTO alerts (device_ip, severity, message, timestamp, category)
        VALUES (%s, %s, %s, %s, %s)
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        params = (device_ip, severity, message, datetime.datetime.utcnow(), category)
        cur.execute(query, params)
        conn.commit()
        return True
    except Exception as e:
        logger.error("insert_alert_internal failed for %s : %s", device_ip, e)
        return False
    finally:
        if cur: cur.close()
        if conn: conn.close()
