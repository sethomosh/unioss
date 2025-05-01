from flask import Blueprint

bp = Blueprint('traffic_api', __name__)

@bp.route('/')
def index():
    return "traffic_api endpoint"
