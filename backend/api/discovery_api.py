from flask import Blueprint, jsonify, current_app
from backend.modules.discovery import get_device_inventory

discovery_api = Blueprint('discovery_api', __name__)

@discovery_api.route('/devices', methods=['GET'])
def list_devices():
    try:
        devices = get_device_inventory()
        current_app.logger.info(f"Discovered {len(devices)} devices")
        return jsonify({'devices': devices}), 200
    except Exception as e:
        current_app.logger.error(f"Discovery error: {e}")
        return jsonify({'error': str(e)}), 500
