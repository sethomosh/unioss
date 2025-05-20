from flask import Blueprint, jsonify

health_api = Blueprint('health_api', __name__)

@health_api.route('/health', methods=['GET'])
def health():
    return jsonify(status='ok'), 200