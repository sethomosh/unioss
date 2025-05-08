from flask import Flask
from flask_cors import CORS
from backend.api.access_api import access_api
from backend.api.discovery_api import discovery_api
from backend.api.performance_api import performance_api
from backend.api.traffic_api import traffic_api
from backend.config.settings import configure_logging
def create_app():
    app = Flask(__name__)
    CORS(app)
    app.config.from_object('backend.config.settings')
    
    #Enable CORS globally
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    configure_logging(app)

    # Register Blueprints
    app.register_blueprint(access_api, url_prefix='/api/access')
    app.register_blueprint(discovery_api, url_prefix='/api/discovery')
    app.register_blueprint(performance_api, url_prefix='/api/performance')
    app.register_blueprint(traffic_api, url_prefix='/api/traffic')
    return app

if __name__ == '__main__':
    create_app().run(host='0.0.0.0', port=5000)

# 👇 This makes it available to Gunicorn
app = create_app()