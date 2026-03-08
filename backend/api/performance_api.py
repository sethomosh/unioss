# backend/api/performance_api.py
from flask import Blueprint, jsonify, request, current_app
from backend.utils.db import get_db_connection
from datetime import datetime as _dt
import traceback
import math
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)
performance_api = Blueprint('performance_api', __name__)

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

            out.append({
                "device_ip": device_ip,
                "cpu_pct": cpu,
                "memory_pct": memory,
                "uptime_seconds": uptime,
                "timestamp": last_updated,
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


@performance_api.route("", methods=["GET"])
def list_performance():
    try:
        rows = fetch_latest_performance()
        return jsonify(rows), 200
    except Exception as e:
        logger.error(f"Performance list error: {e}")
        return jsonify({"error": str(e)}), 500


@performance_api.route("/metrics", methods=["GET"])
def performance_metrics_endpoint():
    try:
        rows = fetch_latest_performance()
        return jsonify(rows), 200
    except Exception as e:
        logger.error(f"Performance metrics error: {e}")
        return jsonify({"error": str(e)}), 500


@performance_api.route("/history", methods=["GET"])
def performance_history():
    try:
        device_ip = request.args.get("device_ip")
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT
              device_ip,
              DATE_FORMAT(timestamp, '%Y-%m-%dT%H:%i:%sZ') AS timestamp,
              cpu_pct,
              memory_pct,
              uptime_seconds
            FROM performance_metrics
            WHERE 1=1
        """
        params = []
        if device_ip:
            query += " AND device_ip = %s"
            params.append(device_ip)

        query += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall() or []
        
        # Count total for frontend pagination
        count_query = "SELECT COUNT(*) as total FROM performance_metrics WHERE 1=1"
        count_params = []
        if device_ip:
            count_query += " AND device_ip = %s"
            count_params.append(device_ip)
        cursor.execute(count_query, tuple(count_params))
        total = cursor.fetchone().get("total", 0)

        cursor.close()
        conn.close()
        
        return jsonify({
            "items": rows,
            "total": total,
            "limit": limit,
            "offset": offset
        }), 200
    except Exception as e:
        logger.error(f"Performance history error: {e}")
        return jsonify({"error": str(e)}), 500
