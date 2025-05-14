import logging
from logging.handlers import RotatingFileHandler
import os

def configure_logging(app):
    """Sets up rotating file logging to logs/backend.log."""
    # ── no change here ──
    logs_dir = os.path.join(app.root_path, '..', 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    # ——— NEW: ensure the log file exists at startup ———
    log_path = os.path.join(logs_dir, 'backend.log')
    # Create the file if it doesn’t already exist so RotatingFileHandler
    # can open it without permission errors at boot.
    if not os.path.exists(log_path):
        open(log_path, 'a').close()

    handler = RotatingFileHandler(
        log_path,
        maxBytes=10240,
        backupCount=5
    )
    handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    ))
    handler.setLevel(logging.INFO)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('Logging configured')


MYSQL_HOST     = os.getenv('MYSQL_HOST', 'db')
MYSQL_USER     = os.getenv('MYSQL_USER', 'unios_user')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'StrongP@ssw0rd')
MYSQL_DB       = os.getenv('MYSQL_DB', 'unios')

SNMP_HOST      = os.getenv('SNMP_HOST', 'snmpsim')    # ← make sure your code later reads these
SNMP_PORT      = int(os.getenv('SNMP_PORT', 1161))
SNMP_COMMUNITY = os.getenv('SNMP_COMMUNITY', 'public')
