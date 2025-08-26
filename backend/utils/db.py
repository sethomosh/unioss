"""
Database helpers for unioss.

Provides:
  - get_db_connection()  -> primary function used throughout the codebase
  - get_db()             -> backwards-compatible alias for get_db_connection()
  - get_db_dict_cursor() -> convenience (conn, cursor) with cursor(dictionary=True)
  - run_query(...)       -> helper for queries (fetch / executemany / commit)
"""

import os
import logging
from typing import Tuple, Optional, Any, Iterable
import mysql.connector
from mysql.connector import errors as mysql_errors

logger = logging.getLogger(__name__)


def _db_config() -> dict:
    """
    Build db config from environment with sensible defaults for local/dev.
    Environment variables used: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
    """
    return {
        "host": os.getenv("MYSQL_HOST", os.getenv("UNISYS_DB_HOST", "127.0.0.1")),
        "port": int(os.getenv("MYSQL_PORT", os.getenv("UNISYS_DB_PORT", "3306"))),
        "user": os.getenv("MYSQL_USER", os.getenv("UNISYS_DB_USER", "unisys_user")),
        "password": os.getenv("MYSQL_PASSWORD", os.getenv("UNISYS_DB_PASS", "StrongP@ssw0rd")),
        "database": os.getenv("MYSQL_DB", os.getenv("UNISYS_DB_NAME", "unisys")),
        # short timeout to avoid long blocking during container startup problems
        "connection_timeout": int(os.getenv("MYSQL_CONN_TIMEOUT", "10")),
    }


def get_db_connection():
    """
    Connect to MySQL using environment variables and return a mysql.connector connection.
    Caller is responsible for closing the connection.
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
    # use buffered cursor to avoid "Unread result found" errors when
    # multiple queries/operations are performed on same connection
    cursor = conn.cursor(dictionary=True, buffered=True)
    return conn, cursor


def run_query(query: str, params: Tuple = (), fetch: bool = True, many: bool = False, commit: bool = False, dict_cursor: bool = True) -> Any:
    """
    Run a query against MySQL.

    - query: SQL string with %s placeholders
    - params: tuple/list of parameters or list of tuples when many=True
    - fetch: if True, return cursor.fetchall()
    - many: if True, use executemany (params should be iterable of tuples)
    - commit: commit transaction after execution
    - dict_cursor: whether to return rows as dicts (True) or tuples (False)
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        # create a buffered cursor so we always consume results
        cursor = conn.cursor(dictionary=dict_cursor, buffered=True)
        if many:
            if not isinstance(params, (list, tuple)):
                raise ValueError("params must be a list/tuple of tuples when many=True")
            cursor.executemany(query, params)
        else:
            cursor.execute(query, params)
        if commit:
            conn.commit()
        if fetch:
            # fetchall on a buffered cursor is safe and will consume the resultset
            return cursor.fetchall()
        return cursor.rowcount
    except Exception as e:
        logger.exception("Database query error: %s -- params=%s", e, params)
        if conn:
            try:
                conn.rollback()
            except Exception:
                logger.exception("Failed to rollback transaction after error")
        raise
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                logger.exception("Failed to close cursor")
        if conn:
            try:
                conn.close()
            except Exception:
                logger.exception("Failed to close connection")
