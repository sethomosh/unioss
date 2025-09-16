# backend/api/performance_api.py
from fastapi import APIRouter, HTTPException
from backend.utils.db import get_db_connection
from datetime import datetime as _dt
import traceback
import math
from decimal import Decimal
from datetime import datetime as _dt
import logging

logger = logging.getLogger(__name__)
router = APIRouter()  # expected to be included under /api in the main app e.g. app.include_router(router, prefix="/performance")

def _to_finite_float(val, default=0.0):
    if val is None:
        return float(default)
    try:
        if isinstance(val, Decimal):
            v = float(val)
        else:
            v = float(val)
    except Exception:
        return float(default)
    if not math.isfinite(v):
        return float(default)
    return v

def _to_int(val, default=0):
    if val is None:
        return int(default)
    try:
        return int(val)
    except Exception:
        try:
            return int(float(val))
        except Exception:
            return int(default)

# replace the old fetch_latest_performance() with this exact function
def fetch_latest_performance():
    """
    defensive fetch: always returns plain primitives (no None), logs raw DB rows.
    returns: list of dicts:
      device_ip (str), cpu_pct (float), memory_pct (float), uptime_seconds (int), last_updated (ISO str)
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT pm.device_ip AS device_ip,
                   COALESCE(pm.cpu_pct, 0.0)   AS cpu_pct,
                   COALESCE(pm.memory_pct, 0.0) AS memory_pct,
                   COALESCE(pm.uptime_seconds, 0) AS uptime_seconds,
                   pm.timestamp AS last_updated_raw
            FROM performance_metrics pm
            JOIN (
              SELECT device_ip, MAX(timestamp) AS maxts
              FROM performance_metrics
              GROUP BY device_ip
            ) latest
            ON pm.device_ip = latest.device_ip AND pm.timestamp = latest.maxts
        """)

        raw_rows = cursor.fetchall() or []

        # debug: log the first few raw rows so we can inspect types/None values
        if raw_rows:
            logger.debug("fetch_latest_performance: sample raw_rows (first 5): %s", raw_rows[:5])

        out = []
        for idx, r in enumerate(raw_rows):
            device_ip = r.get("device_ip") or ""
            raw_cpu = r.get("cpu_pct", None)
            raw_mem = r.get("memory_pct", None)
            raw_uptime = r.get("uptime_seconds", None)
            raw_ts = r.get("last_updated_raw", None)

            cpu = _to_finite_float(raw_cpu, default=0.0)
            memory = _to_finite_float(raw_mem, default=0.0)
            uptime = _to_int(raw_uptime, default=0)

            # timestamp -> ISO string (Z-terminated) or empty string
            if isinstance(raw_ts, _dt):
                last_updated = raw_ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            elif isinstance(raw_ts, str) and raw_ts:
                try:
                    parsed = _dt.fromisoformat(raw_ts)
                    last_updated = parsed.strftime("%Y-%m-%dT%H:%M:%SZ")
                except Exception:
                    last_updated = raw_ts
            else:
                last_updated = ""

            # log anomalies to help debug why a None snuck through
            if raw_cpu is None:
                logger.debug("fetch_latest_performance: device %s has raw_cpu=None (idx=%s)", device_ip, idx)
            if raw_cpu is not None and (isinstance(raw_cpu, float) and not math.isfinite(raw_cpu)):
                logger.debug("fetch_latest_performance: device %s raw_cpu not finite -> %r", device_ip, raw_cpu)

            out.append({
                "device_ip": device_ip,
                "cpu_pct": cpu,
                "memory_pct": memory,
                "uptime_seconds": uptime,
                "last_updated": last_updated,
            })

        return out

    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                logger.exception("closing cursor failed")
        if conn:
            try:
                conn.close()
            except Exception:
                logger.exception("closing conn failed")


@router.get("/", summary="Latest performance per-device")
def list_performance():
    try:
        rows = fetch_latest_performance()
        return rows
    except Exception as e:
        # let the app log a full stack trace; surface a 500
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics", summary="Legacy alias for latest performance")
def performance_metrics():
    try:
        rows = fetch_latest_performance()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", summary="Historical performance rows")
def performance_history():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT
              device_ip,
              DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%sZ') AS timestamp,
              cpu_pct,
              memory_pct,
              uptime_seconds
            FROM performance_metrics
            ORDER BY timestamp ASC
        """)
        rows = cursor.fetchall() or []
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
