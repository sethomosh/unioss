from flask import Blueprint

bp = Blueprint('access_api', __name__)

@bp.route('/')
def index():
    return "access_api endpoint"
