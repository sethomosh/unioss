# backend/api/performance_api.py

from flask import Blueprint, jsonify, current_app
from backend.modules.performance import get_performance_metrics
from backend.utils.db import get_db_connection
import traceback

performance_api = Blueprint('performance_api', __name__)

@performance_api.route('/devices', methods=['GET'])
def list_performance():
    try:
        raw = get_performance_metrics()

        # ── persist into performance_metrics ───────────────────────────────────
        conn = get_db_connection()
        cursor = conn.cursor()

        for p in raw:
            ts_iso   = p.get("last_updated", "")
            # “2025-06-10T09:36:17.064737Z” → “2025-06-10 09:36:17”
            ts_clean = ts_iso.replace("T", " ").split(".")[0]

            cursor.execute(
                "INSERT INTO performance_metrics "
                "(device_ip, timestamp, cpu_pct, memory_pct, uptime_secs) "
                "VALUES (%s,%s,%s,%s,%s)",
                (
                    p["ip"],
                    ts_clean,
                    p.get("cpu", 0),
                    p.get("memory", 0),
                    int(p.get("uptime") or 0)
                )
            )

        conn.commit()
        cursor.close()
        conn.close()
        # ───────────────────────────────────────────────────────────────────────

        response = [
            {
                "ip":           p["ip"],
                "cpu":          p.get("cpu", 0),
                "memory":       p.get("memory", 0),
                "uptime":       p.get("uptime", "0"),
                "last_updated": p.get("last_updated")
            }
            for p in raw
        ]
        current_app.logger.info(f"Fetched performance for {len(response)} devices")
        return jsonify(response), 200

    except Exception as e:
        current_app.logger.error(f"Performance error: {e}")
        return jsonify({"error": str(e)}), 500


@performance_api.route('/history', methods=['GET'])
def performance_history():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
              device_ip,
              DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%sZ') AS timestamp,
              cpu_pct     AS cpu_pct,
              memory_pct  AS memory_pct,
              uptime_secs AS uptime_secs
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


@performance_api.route('/metrics', methods=['GET'])
def performance_metrics():
    try:
        raw = get_performance_metrics()
        response = [
            {
                "ip":           p["ip"],
                "cpu":          p.get("cpu", 0),
                "memory":       p.get("memory", 0),
                "uptime":       p.get("uptime", "0"),
                "last_updated": p.get("last_updated")
            }
            for p in raw
        ]
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Performance /metrics error: {e}")
        return jsonify({"error": str(e)}), 500
