# backend/utils/db.py

import os
import mysql.connector

def get_db_connection():
    """
    Return a new MySQL connection using the same env vars
    your Docker-Compose is already supplying.
    """
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "db"),
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DB")
    )
