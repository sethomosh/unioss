from flask import Blueprint

bp = Blueprint('discovery_api', __name__)

@bp.route('/')
def index():
    return "discovery_api endpoint"
