# backend/api/performance_api.py

from flask import Blueprint, jsonify, current_app
from backend.modules.performance import get_performance_metrics
from backend.utils.db import get_db_connection
from datetime import datetime as _dt
import traceback

performance_api = Blueprint('performance_api', __name__)

def fetch_latest_performance():
    """
    Query DB for latest performance metrics per device and normalize timestamps.
    Returns a list of dicts.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT pm.device_ip AS ip,
                   pm.cpu_pct   AS cpu,
                   pm.memory_pct AS memory,
                   pm.uptime_seconds AS uptime,
                   pm.timestamp AS last_updated_raw
            FROM performance_metrics pm
            JOIN (
              SELECT device_ip, MAX(timestamp) AS maxts
              FROM performance_metrics
              GROUP BY device_ip
            ) latest
            ON pm.device_ip = latest.device_ip AND pm.timestamp = latest.maxts
        """)
        rows = cursor.fetchall()

        # Normalize timestamp
        for r in rows:
            ts = r.pop("last_updated_raw", None)
            if isinstance(ts, _dt):
                r["last_updated"] = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            elif isinstance(ts, str) and ts:
                try:
                    parsed = _dt.fromisoformat(ts)
                    r["last_updated"] = parsed.strftime("%Y-%m-%dT%H:%M:%SZ")
                except Exception:
                    r["last_updated"] = ts
            else:
                r["last_updated"] = None

        return rows

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@performance_api.route('/devices', methods=['GET'])
def list_performance():
    """
    Return last-known performance metrics per device from the DB.
    """
    try:
        rows = fetch_latest_performance()
        return jsonify(rows), 200
    except Exception as e:
        current_app.logger.error(f"Performance /devices error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


@performance_api.route('/metrics', methods=['GET'])
def performance_metrics():
    """
    Same as /devices — return latest metrics from DB (legacy API shape).
    """
    try:
        rows = fetch_latest_performance()
        return jsonify(rows), 200
    except Exception as e:
        current_app.logger.error(f"Performance /metrics error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


@performance_api.route('/history', methods=['GET'])
def performance_history():
    """
    Return historical performance metrics from DB.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
              device_ip,
              DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%sZ') AS timestamp,
              cpu_pct     AS cpu_pct,
              memory_pct  AS memory_pct,
              uptime_seconds AS uptime_secs
            FROM performance_metrics
            ORDER BY timestamp ASC
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(rows), 200

    except Exception as e:
        current_app.logger.error(f"Performance history error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
