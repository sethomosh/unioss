# backend/api/health_api.py
from flask import Blueprint, jsonify, current_app

health_api = Blueprint('health_api', __name__)

@health_api.route('/health', methods=['GET'])
def health():
    # You can add more checks here (DB ping, SNMPSim ping, etc.)
    return jsonify(status="ok"), 200
