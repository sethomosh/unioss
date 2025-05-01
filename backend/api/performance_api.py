from flask import Blueprint, jsonify

performance_api = Blueprint('performance_api', __name__)

@performance_api.route('/performance/status', methods=['GET'])
def performance_status():
    return jsonify({'status': 'Performance module OK'})
