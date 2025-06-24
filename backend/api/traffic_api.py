# backend/api/traffic_api.py

from flask import Blueprint, jsonify, current_app
from backend.modules.traffic import get_traffic_stats
from backend.utils.db import get_db_connection
import traceback

traffic_api = Blueprint('traffic_api', __name__)

@traffic_api.route('/interfaces', methods=['GET'])
def list_traffic():
    try:
        raw = get_traffic_stats()

        # ── persist into traffic_metrics ────────────────────────────────────────
        conn = get_db_connection()
        cursor = conn.cursor()

        for t in raw:
            ts_iso   = t.get("timestamp", "")
            # “2025-06-10T09:36:27.936666Z” → “2025-06-10 09:36:27”
            ts_clean = ts_iso.replace("T", " ").split(".")[0]

            cursor.execute(
                "INSERT INTO traffic_metrics "
                "(device_ip, interface_index, timestamp, inbound_kbps, outbound_kbps, errors) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (
                    t["device_ip"],
                    t["interface_index"],
                    ts_clean,
                    t.get("inbound_kbps", 0),
                    t.get("outbound_kbps", 0),
                    t.get("errors", 0)
                )
            )

        conn.commit()
        cursor.close()
        conn.close()
        # ───────────────────────────────────────────────────────────────────────

        response = [
            {
                "device_ip":       t["device_ip"],
                "interface_index": t["interface_index"],
                "iface_name":      t.get("iface_name", ""),
                "inbound_kbps":    t.get("inbound_kbps"),
                "outbound_kbps":   t.get("outbound_kbps"),
                "errors":          t.get("errors", 0),
                "timestamp":       t.get("timestamp")
            }
            for t in raw
        ]
        current_app.logger.info(f"Fetched traffic stats for {len(response)} interfaces")
        return jsonify(response), 200

    except Exception as e:
        current_app.logger.error(f"Traffic error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


@traffic_api.route('/history', methods=['GET'])
def traffic_history():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
              device_ip,
              interface_index,
              DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%sZ') AS timestamp,
              inbound_kbps,
              outbound_kbps,
              errors
            FROM traffic_metrics
            ORDER BY timestamp ASC
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(rows), 200

    except Exception as e:
        current_app.logger.error(f"Traffic history error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
