from flask import Blueprint, jsonify

traffic_api = Blueprint('traffic_api', __name__)

@traffic_api.route('/traffic/status', methods=['GET'])
def traffic_status():
    return jsonify({'status': 'Traffic module OK'})

