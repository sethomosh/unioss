from flask import Flask
from flask import Flask, jsonify
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from backend.api.access_api import access_api
from backend.api.discovery_api import discovery_api
from backend.api.performance_api import performance_api
from backend.api.traffic_api import traffic_api
from backend.api.performance_api import list_performance as _snapshot_performance
from backend.api.traffic_api    import list_traffic     as _snapshot_traffic
from backend.config.settings import configure_logging
from backend.snmp_routes import snmp_bp
from backend.api.health_api import health_api

def create_app():
    app = Flask(__name__)
    CORS(app)
    app.config.from_object('backend.config.settings')

    #Enable CORS globally
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    configure_logging(app)

    # Register Blueprints
    from backend.api.health_api import health_api
    app.register_blueprint(access_api, url_prefix='/api/access')
    app.register_blueprint(discovery_api, url_prefix='/api/discovery')
    app.register_blueprint(performance_api, url_prefix='/api/performance')
    app.register_blueprint(traffic_api, url_prefix='/api/traffic')
    app.register_blueprint(health_api,   url_prefix='/api/health')
    app.register_blueprint(snmp_bp, url_prefix='/api/snmp')

    # ————————————— Scheduler Setup ——————————————
    sched = BackgroundScheduler()

    # wrap your snapshot calls in app context so DB and logging work
    def perf_job():
        with app.app_context():
            # this will fetch & persist performance_metrics
            _snapshot_performance()

    def traffic_job():
        with app.app_context():
            # this will fetch & persist traffic_metrics
            _snapshot_traffic()

    # schedule every minute (adjust as needed)
    sched.add_job(perf_job,    'interval', minutes=1, id='perf_snapshot')
    sched.add_job(traffic_job, 'interval', minutes=1, id='traffic_snapshot')
    sched.start()


    @app.route("/health", methods=["GET"])
    def health():
    # Simple “I’m alive” check
        return jsonify(status="ok"), 200


    # ── Seed initial snapshots immediately ───────────────────────────────────
    perf_job()
    traffic_job()
    # ────────────────────────────────────────────────────────────────────────

    # make sure scheduler shut down on exit
    @app.teardown_appcontext
    def shutdown_scheduler(exc):
        # only shut down once
        if sched.running:
            sched.shutdown(wait=False)
    # ————————————————————————————————————————————————
    return app

if __name__ == '__main__':
    create_app().run(host='0.0.0.0', port=5000)

# 👇 This makes it available to Gunicorn
app = create_app()