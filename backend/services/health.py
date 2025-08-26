# backend/services/health.py
from backend.utils.db import get_db_connection
import redis
import os

def check_db():
    """
    Check DB connectivity using the shared db utils.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return "ok"
    except Exception as e:
        return f"down ({str(e)})"


def check_redis():
    """
    Check Redis connectivity.
    """
    try:
        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "redis"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=0
        )
        r.ping()
        return "ok"
    except Exception as e:
        return f"down ({str(e)})"
