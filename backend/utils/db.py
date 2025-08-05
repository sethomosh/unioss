# backend/utils/db.py

import os
import mysql.connector

def get_db_connection():
    """
    Return a new MySQL connection using hardcoded localhost for local dev.
    """
    return mysql.connector.connect(
        host="localhost",  # force localhost to eliminate 'db' lookup failures
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DB")
    )