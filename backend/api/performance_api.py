from flask import Blueprint

bp = Blueprint('performance_api', __name__)

@bp.route('/')
def index():
    return "performance_api endpoint"
