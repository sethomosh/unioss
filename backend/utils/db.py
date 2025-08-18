# backend/utils/db.py
import os
import logging
import mysql.connector
from mysql.connector import errors as mysql_errors

logger = logging.getLogger(__name__)

def get_db_connection():
    """
    Connect to MySQL using environment variables.
    Expects MYSQL_HOST, MYSQL_PORT, MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD.
    """
    host = os.getenv("MYSQL_HOST", "db")
    port = int(os.getenv("MYSQL_PORT", 3306))
    user = os.getenv("MYSQL_USER", "unisys_user")
    password = os.getenv("MYSQL_PASSWORD", "")
    database = os.getenv("MYSQL_DB", "unisys")

    logger.debug("Connecting to MySQL: host=%s port=%s user=%s db=%s", host, port, user, database)
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            autocommit=False
        )
        return conn
    except mysql_errors.ProgrammingError as e:
        logger.error("MySQL ProgrammingError connecting as %s@%s: %s", user, host, e)
        raise
    except Exception as e:
        logger.exception("Unexpected error opening DB connection: %s", e)
        raise
