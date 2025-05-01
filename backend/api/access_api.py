from flask import Blueprint, jsonify

access_api = Blueprint('access_api', __name__)

@access_api.route('/access/status', methods=['GET'])
def access_status():
    return jsonify({'status': 'Access module OK'})

