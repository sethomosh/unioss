# backend/utils/db.py
"""
Database helpers for Unisys.

Provides:
  - get_db_connection()  -> primary function used throughout the codebase
  - get_db()             -> backwards-compatible alias for get_db_connection()
  - get_db_dict_cursor() -> convenience (conn, cursor) with cursor(dictionary=True)
"""

import os
import logging
import mysql.connector
from mysql.connector import errors as mysql_errors
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


def _db_config() -> dict:
    """
    Build db config from environment with sensible defaults for local/dev.
    """
    return {
        "host": os.getenv("MYSQL_HOST", "db"),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "user": os.getenv("MYSQL_USER", "unisys_user"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "database": os.getenv("MYSQL_DB", "unisys"),
        # short timeout to avoid long blocking during container startup problems
        "connection_timeout": int(os.getenv("MYSQL_CONN_TIMEOUT", "10")),
    }


def get_db_connection():
    """
    Connect to MySQL using environment variables and return a mysql.connector connection.
    Caller is responsible for closing the connection.

    Environment variables read: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
    """
    cfg = _db_config()
    logger.debug(
        "Connecting to MySQL: host=%s port=%s user=%s db=%s",
        cfg.get("host"), cfg.get("port"), cfg.get("user"), cfg.get("database")
    )
    try:
        conn = mysql.connector.connect(
            host=cfg["host"],
            port=cfg["port"],
            user=cfg["user"],
            password=cfg["password"],
            database=cfg["database"],
            connection_timeout=cfg.get("connection_timeout", 10),
            autocommit=False
        )
        return conn
    except mysql_errors.ProgrammingError as e:
        logger.error("MySQL ProgrammingError connecting as %s@%s: %s", cfg["user"], cfg["host"], e)
        raise
    except Exception as e:
        logger.exception("Unexpected error opening DB connection: %s", e)
        raise


def get_db():
    """
    Backwards-compatible alias for get_db_connection() used by some modules.
    """
    return get_db_connection()


def get_db_dict_cursor(conn: Optional[mysql.connector.connection_cext.CMySQLConnection] = None) -> Tuple[mysql.connector.connection_cext.CMySQLConnection, mysql.connector.cursor_cext.CMySQLCursorDict]:
    """
    Convenience helper: return (conn, cursor) where cursor has dictionary=True.
    If conn is None, a new connection is created.

    Caller is responsible for closing cursor and connection.
    """
    if conn is None:
        conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    return conn, cursor
