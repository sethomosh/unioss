# backend/utils/db.py

import os
import mysql.connector

def get_db_connection():
    """
    Return a new MySQL connection using hardcoded localhost for local dev.
    """
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DB")
    )