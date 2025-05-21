# backend/api/health_api.py
from flask import Blueprint, jsonify, current_app

health_api = Blueprint('health', __name__, url_prefix='/health')

@health_api.route('/', methods=['GET'])
def health():
    # You can add more checks here (DB ping, SNMPSim ping, etc.)
    return jsonify(status="ok"), 200
