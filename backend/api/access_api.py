from flask import Blueprint, jsonify, current_app
from flask_cors import CORS
from backend.modules.access_control import get_active_sessions

access_api = Blueprint('access_api', __name__)
CORS(access_api)

@access_api.route('/sessions', methods=['GET'])
def list_sessions():
    """
    GET /api/access/sessions
    Returns a list of current access sessions.
    """
    try:
        sessions = get_active_sessions()
        # Transform to contract
        response = [
            {
                "user": s["user"],
                "ip": s["ip"],
                "mac": s["mac"],
                "login_time": s["login_time"],
                "logout_time": s.get("logout_time"),
                "duration": s.get("duration"),
                "authenticated_via": s.get("authenticated_via", "unknown")
            }
            for s in sessions
        ]
        current_app.logger.info(f"Fetched {len(response)} access sessions")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Access sessions error: {e}")
        return jsonify({"error": str(e)}), 500
