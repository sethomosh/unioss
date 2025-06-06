from flask import Blueprint, jsonify, current_app
from flask_cors import CORS
from backend.modules.traffic import get_traffic_stats

traffic_api = Blueprint('traffic_api', __name__)

@traffic_api.route('/interfaces', methods=['GET'])
def list_traffic():
    """
    GET /api/traffic/interfaces
    Returns traffic statistics for each interface.
    """
    try:
        raw = get_traffic_stats()
        response = [
            {
                "device_ip":       t["device_ip"],
                "interface_index": t["interface_index"],
                "iface_name":      t.get("iface_name", ""),  # ← new
                "inbound_kbps":    t["inbound_kbps"],
                "outbound_kbps":   t["outbound_kbps"],
                "errors":          t.get("errors", 0),
                "timestamp":       t["timestamp"]
            }
            for t in raw
        ]
        current_app.logger.info(f"Fetched traffic stats for {len(response)} interfaces")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Traffic error: {e}")
        return jsonify({"error": str(e)}), 500
