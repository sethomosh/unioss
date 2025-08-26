from fastapi import APIRouter, Query, HTTPException
from fastapi.encoders import jsonable_encoder
from typing import Optional, List
import os
import redis
from datetime import datetime
import logging

from backend.utils.db import run_query

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/api", tags=["compat"])


# lightweight redis client for health endpoint (separate from main app redis to avoid circular import)
def _get_redis_client():
    try:
        REDIS_HOST = os.getenv("UNISYS_REDIS_HOST", os.getenv("REDIS_HOST", "localhost"))
        REDIS_PORT = int(os.getenv("UNISYS_REDIS_PORT", os.getenv("REDIS_PORT", "6379")))
        REDIS_DB = int(os.getenv("UNISYS_REDIS_DB", "0"))
        client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
        client.ping()
        return client
    except Exception:
        return None


@api_router.get("/health")
def api_health():
    db_ok = True
    try:
        run_query("SELECT 1", fetch=False)
    except Exception:
        db_ok = False

    redis_client = _get_redis_client()
    redis_ok = True
    if redis_client:
        try:
            redis_client.ping()
        except Exception:
            redis_ok = False
    else:
        redis_ok = False

    return {"status": {"db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down"}}


@api_router.get("/traffic/interfaces")
def list_interfaces():
    """
    Returns current interfaces stored in traffic_metrics
    shape:
    [
      {
        "device_ip": "...",
        "interface_index": 0,
        "iface_name": "...",
        "inbound_kbps": 0.0,
        "outbound_kbps": 0.0,
        "errors": 0,
        "timestamp": "2025-08-21T12:34:56.123456"
      }
    ]
    """
    query = """
        SELECT device_ip,
               IFNULL(interface_index, 0) AS interface_index,
               iface_name AS iface_name,
               inbound_kbps,
               outbound_kbps,
               errors,
               timestamp
        FROM traffic_metrics
        ORDER BY device_ip, interface_index
    """
    try:
        rows = run_query(query, (), fetch=True, dict_cursor=True) or []
    except Exception as e:
        logger.exception("Error querying interfaces: %s", e)
        raise HTTPException(status_code=500, detail="Error querying interfaces")

    # convert timestamps to iso strings
    for r in rows:
        ts = r.get("timestamp")
        if isinstance(ts, datetime):
            r["timestamp"] = ts.isoformat()
        elif r.get("timestamp") is None:
            r["timestamp"] = None
        else:
            # leave as-is (string)
            r["timestamp"] = str(r["timestamp"])

    return jsonable_encoder(rows)


@api_router.get("/traffic/history")
def traffic_history(
    start: Optional[str] = Query(None, description="start time ISO string or unix ts"),
    end: Optional[str] = Query(None, description="end time ISO string or unix ts"),
    device_ip: Optional[str] = Query(None),
    limit: int = Query(500)
):
    """
    Return historical traffic rows for charting. time filters optional.
    """
    query = """
        SELECT device_ip,
               IFNULL(interface_index, 0) AS interface_index,
               iface_name AS iface_name,
               inbound_kbps,
               outbound_kbps,
               errors,
               timestamp
        FROM traffic_metrics
        WHERE 1=1
    """
    params = []
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)

    if start:
        # accept iso string or unix timestamp; pass through as string
        try:
            # validate iso
            _ = datetime.fromisoformat(start)
            query += " AND timestamp >= %s"
            params.append(start)
        except Exception:
            # attempt numeric unix
            if start.isdigit():
                query += " AND timestamp >= FROM_UNIXTIME(%s)"
                params.append(int(start))
            else:
                raise HTTPException(status_code=400, detail="start must be ISO datetime or unix timestamp")

    if end:
        try:
            _ = datetime.fromisoformat(end)
            query += " AND timestamp <= %s"
            params.append(end)
        except Exception:
            if end.isdigit():
                query += " AND timestamp <= FROM_UNIXTIME(%s)"
                params.append(int(end))
            else:
                raise HTTPException(status_code=400, detail="end must be ISO datetime or unix timestamp")

    query += " ORDER BY timestamp ASC LIMIT %s"
    params.append(limit)

    try:
        rows = run_query(query, tuple(params), fetch=True, dict_cursor=True) or []
    except Exception as e:
        logger.exception("Error fetching traffic history: %s", e)
        raise HTTPException(status_code=500, detail="Error fetching traffic history")

    for r in rows:
        ts = r.get("timestamp")
        if isinstance(ts, datetime):
            r["timestamp"] = ts.isoformat()
        elif r.get("timestamp") is None:
            r["timestamp"] = None
        else:
            r["timestamp"] = str(r["timestamp"])

    return jsonable_encoder(rows)


@api_router.get("/performance/metrics")
def performance_metrics():
    """
    Latest snapshots per device.
    """
    query = """
        SELECT p1.device_ip, p1.cpu_pct, p1.memory_pct, p1.uptime_seconds, p1.timestamp
        FROM performance_metrics p1
        INNER JOIN (
            SELECT device_ip, MAX(timestamp) AS max_ts
            FROM performance_metrics
            GROUP BY device_ip
        ) p2 ON p1.device_ip = p2.device_ip AND p1.timestamp = p2.max_ts
    """
    try:
        rows = run_query(query, (), fetch=True, dict_cursor=True) or []
    except Exception as e:
        logger.exception("Error fetching performance metrics: %s", e)
        raise HTTPException(status_code=500, detail="Error fetching performance metrics")

    for r in rows:
        ts = r.get("timestamp")
        if isinstance(ts, datetime):
            r["timestamp"] = ts.isoformat()
        elif r.get("timestamp") is None:
            r["timestamp"] = None
        else:
            r["timestamp"] = str(r["timestamp"])

    return jsonable_encoder(rows)


@api_router.get("/performance/history")
def performance_history(
    device_ip: Optional[str] = Query(None),
    limit: int = Query(500)
):
    query = """
        SELECT device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp
        FROM performance_metrics
        WHERE 1=1
    """
    params = []
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)

    query += " ORDER BY timestamp ASC LIMIT %s"
    params.append(limit)

    try:
        rows = run_query(query, tuple(params), fetch=True, dict_cursor=True) or []
    except Exception as e:
        logger.exception("Error fetching performance history: %s", e)
        raise HTTPException(status_code=500, detail="Error fetching performance history")

    for r in rows:
        ts = r.get("timestamp")
        if isinstance(ts, datetime):
            r["timestamp"] = ts.isoformat()
        elif r.get("timestamp") is None:
            r["timestamp"] = None
        else:
            r["timestamp"] = str(r["timestamp"])

    return jsonable_encoder(rows)
