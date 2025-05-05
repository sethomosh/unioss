from flask import Blueprint, jsonify, current_app
from backend.modules.discovery import get_device_inventory

discovery_api = Blueprint('discovery_api', __name__)

@discovery_api.route('/devices', methods=['GET'])
def list_devices():
    """
    GET /api/discovery/devices
    Returns a list of discovered tower devices.
    """
    try:
        raw = get_device_inventory()
        response = []
        for d in raw:
            response.append({
                "ip":          d.get("ip"),
                "hostname":    d.get("hostname", ""),
                "description": d.get("description", ""),
                "vendor":      d.get("vendor",""),
                "os_version":  d.get("os_version",""),
                "status":      d.get("status","unknown"),
                "error":       d.get("error")  # None if no error
            })
        current_app.logger.info(f"Discovered {len(response)} devices")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Discovery error: {e}")
        return jsonify({"error": str(e)}), 500
