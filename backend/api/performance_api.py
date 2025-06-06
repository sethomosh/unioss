# backend/api/performance_api.py

from flask import Blueprint, jsonify, current_app
from backend.modules.performance import get_performance_metrics

performance_api = Blueprint('performance_api', __name__)

@performance_api.route('/devices', methods=['GET'])
def list_performance():
    """
    GET /api/performance/devices
    Returns CPU %, memory %, uptime, and last_updated for each tower device.
    """
    try:
        raw = get_performance_metrics()
        response = [
            {
                "ip":           p["ip"],
                "cpu":          p.get("cpu"),        # number or null
                "memory":       p.get("memory"),     # number or null
                "uptime":       p.get("uptime"),     # string or null
                "last_updated": p.get("last_updated")
            }
            for p in raw
        ]
        current_app.logger.info(f"Fetched performance for {len(response)} devices")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Performance error: {e}")
        return jsonify({"error": str(e)}), 500
