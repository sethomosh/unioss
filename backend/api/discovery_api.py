from flask import Blueprint, jsonify, current_app
from flask_cors import CORS
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
        response = [
            {
                "ip": d["ip"],
                "hostname": d.get("hostname", ""),
                "vendor": d.get("vendor", ""),
                "model": d.get("model", ""),
                "os_version": d.get("os_version", ""),
                "status": d.get("status", "unknown"),
                "last_seen": d.get("last_seen", "")
            }
            for d in raw
        ]
        current_app.logger.info(f"Discovered {len(response)} devices")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Discovery error: {e}")
        return jsonify({"error": str(e)}), 500
