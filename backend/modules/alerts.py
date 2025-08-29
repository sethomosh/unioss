import datetime
from typing import List
from fastapi import APIRouter
from app.types import Alert
from ..utils.db import run_query
import logging

logger = logging.getLogger("unisys.alerts")

router = APIRouter()

# -----------------------
# Fetch alerts
# -----------------------
@router.get("/alerts/recent", response_model=List[Alert])
def get_recent_alerts(limit: int = 5):
    """
    Return a smaller set of the most recent alerts (default 5).
    Useful for dashboard dropdowns or top-bar notifications.
    """
    query = """
        SELECT id, device_ip, severity, message, timestamp
        FROM alerts
        ORDER BY timestamp DESC
        LIMIT %s
    """
    rows = run_query(query, params=(limit,), fetch=True, dict_cursor=True) or []
    return rows

# -----------------------
# Insert alert safely
# -----------------------
def insert_alert(device_ip: str, severity: str, message: str):
    """
    Insert a new alert into the DB safely.
    Failures are logged but do not raise exceptions.
    """
    query = """
        INSERT INTO alerts (device_ip, severity, message, timestamp)
        VALUES (%s, %s, %s, %s)
    """
    params = (device_ip, severity, message, datetime.datetime.utcnow())
    try:
        run_query(query, params=params, fetch=False, commit=True)
    except Exception as e:
        logger.error("Failed to insert alert for %s: %s", device_ip, e)
