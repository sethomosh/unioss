import logging
from logging.handlers import RotatingFileHandler
import os

def configure_logging(app):
    """Sets up rotating file logging to logs/backend.log."""
    logs_dir = os.path.join(app.root_path, '..', 'logs')
    os.makedirs(logs_dir, exist_ok=True)

    log_path = os.path.join(logs_dir, 'backend.log')
    handler = RotatingFileHandler(log_path, maxBytes=10240, backupCount=5)
    handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    ))
    handler.setLevel(logging.INFO)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('Logging configured')



MYSQL_HOST = os.getenv('MYSQL_HOST', 'db')
MYSQL_USER = os.getenv('MYSQL_USER', 'unios_user')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'StrongP@ssw0rd')
MYSQL_DB = os.getenv('MYSQL_DB', 'unios')

SNMP_USER = os.getenv('SNMP_USER', 'snmpuser')
SNMP_AUTH = os.getenv('SNMP_AUTH', 'authpass')
SNMP_PRIV = os.getenv('SNMP_PRIV', 'privpass')
