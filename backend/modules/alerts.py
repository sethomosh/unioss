# backend/modules/alerts.py
import datetime
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from ..utils.db import run_query

logger = logging.getLogger("unisys.alerts")
router = APIRouter()   # no prefix here — main.py provides prefix

# --- GET recent alerts ---
@router.get("/recent", response_model=List[dict])
def get_recent_alerts(limit: int = 5):
    query = """
        SELECT id, device_ip, severity, message, timestamp,
               IFNULL(acknowledged, 0) AS acknowledged, category
        FROM alerts
        ORDER BY timestamp DESC
        LIMIT %s
    """
    try:
        rows = run_query(query, params=(limit,), fetch=True, dict_cursor=True) or []
        for r in rows:
            r["acknowledged"] = bool(r.get("acknowledged"))
            r["category"] = r.get("category") or None
        return rows
    except Exception as e:
        logger.exception("Error fetching recent alerts: %s", e)
        raise HTTPException(status_code=500, detail="Error fetching recent alerts")
    

# --- Insert alert helper ---
def insert_alert(device_ip: str, severity: str, message: str, category: str = None) -> bool:
    """
    Insert a new alert into the DB. Returns True on success, False on failure.
    """
    query = """
        INSERT INTO alerts (device_ip, severity, message, timestamp, category)
        VALUES (%s, %s, %s, %s, %s)
    """
    params = (device_ip, severity, message, datetime.datetime.utcnow(), category)
    try:
        logger.info("insert_alert called: device_ip=%s severity=%s message=%s category=%s", device_ip, severity, message, category)
        run_query(query, params=params, fetch=False, commit=True)
        logger.info("insert_alert succeeded for %s", device_ip)
        return True
    except Exception as e:
        logger.exception("insert_alert failed for %s : %s", device_ip, e)
        return False
    
# --- Acknowledge endpoint (POST) ---
@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int):
    """
    Mark an alert as acknowledged.
    """
    try:
        rows = run_query("SELECT id, acknowledged FROM alerts WHERE id=%s", (alert_id,), fetch=True, dict_cursor=True) or []
        if not rows:
            raise HTTPException(status_code=404, detail="Alert not found")
        if rows[0].get("acknowledged"):
            return {"success": True, "message": "Already acknowledged"}

        run_query("UPDATE alerts SET acknowledged = 1 WHERE id = %s", (alert_id,), fetch=False, commit=True)
        logger.info("Alert %s acknowledged", alert_id)
        return {"success": True}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to acknowledge alert %s", alert_id)
        raise HTTPException(status_code=500, detail="Failed to acknowledge alert")
