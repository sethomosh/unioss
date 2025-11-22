# app/main.py
import os
import logging
import redis
import json
import time
import random
from datetime import datetime
from typing import List, Optional, Tuple
from fastapi import Path
import asyncio
import mysql.connector
from mysql.connector import Error, pooling
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi import Request
from pydantic import BaseModel, Field

# shared models (single source of truth)
from app.types import DeviceSnapshot, InterfaceSnapshot, Session

# DB helper from utils (prefer single source of truth)
from backend.utils.db import run_query

# backend modules
from backend.modules import alerts as alerts_module
from backend.modules import signals as signals_module
from backend.modules.alerts import insert_alert
from backend.modules import performance as performance_module
from backend.modules import traffic as traffic_module
from backend.db.traffic_dao import save_traffic_metrics
from backend.modules.discovery import get_device_inventory

# SNMP helper
from pysnmp.hlapi import (
    SnmpEngine, CommunityData, UdpTransportTarget,
    ContextData, ObjectType, ObjectIdentity, getCmd
)
# helper: ensure datetimes become ISO strings for the frontend
def _format_ts_for_client(ts):
    if not ts:
        return None
    try:
        # MySQL connector often returns datetime objects; convert to ISO string
        if isinstance(ts, datetime):
            return ts.isoformat() + "Z"
        # if it's already a string, try to return it unchanged
        return str(ts)
    except Exception:
        return None

# --- logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger("unisys")

app = FastAPI(title="Unified Network System")

# -----------------------
# Routers
# -----------------------
app.include_router(performance_module.router, prefix="/api/performance", tags=["performance"])
app.include_router(traffic_module.router, prefix="/api/traffic", tags=["traffic"])
app.include_router(alerts_module.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(signals_module.router, prefix="/api/signals", tags=["signals"])

@app.get("/signals")
def signals_redirect(request: Request):
    # preserve querystring by simply redirecting to the api prefix
    qs = str(request.query_params)
    return RedirectResponse(f"/api/signals{'?' + qs if qs else ''}")

@app.on_event("startup")
async def startup_event():
    if os.getenv("UNISYS_DEV", "0") == "1":
        # demo localhost devices (dev only)
        asyncio.create_task(_poll_devices(["127.0.0.1"], interval=int(os.getenv("UNISYS_DEMO_INTERVAL","10"))))

        snmp_devices_env = os.getenv("UNISYS_SNMP_DEVICES", "")
        snmp_devices = [x.strip() for x in snmp_devices_env.split(",") if x.strip()]
        if snmp_devices:
            asyncio.create_task(
                poll_snmp_devices(
                    snmp_devices,
                    interval=int(os.getenv("UNISYS_SNMP_INTERVAL", "30")),
                    community=os.getenv("UNISYS_SNMP_COMMUNITY", "public")
                )
            )
    else:
        logger.info("startup_event: demo pollers disabled (UNISYS_DEV != 1).")

origins = [
    "http://localhost:5173",  # Vite default
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",  # when serving frontend from backend
]

# allow wildcard when UNISYS_DEV=1 (only for development)
if os.getenv("UNISYS_DEV", "1") == "1":
    allow_origins = ["*"]
else:
    allow_origins = origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- config from env with sensible defaults ---
DB_CONFIG = {
    "host": os.getenv("UNISYS_DB_HOST", "localhost"),
    "user": os.getenv("UNISYS_DB_USER", "unisys_user"),
    "password": os.getenv("UNISYS_DB_PASS", "StrongP@ssw0rd"),
    "database": os.getenv("UNISYS_DB_NAME", "unisys"),
    "port": int(os.getenv("UNISYS_DB_PORT", 3306)),
    "auth_plugin": os.getenv("UNISYS_DB_AUTH_PLUGIN", None) or None,
}

REDIS_HOST = os.getenv("UNISYS_REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("UNISYS_REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("UNISYS_REDIS_DB", "0"))
CACHE_TTL = int(os.getenv("UNISYS_CACHE_TTL", "300"))

# --- initialise redis client ---
try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    redis_client.ping()
    logger.info("Connected to Redis at %s:%s db=%s", REDIS_HOST, REDIS_PORT, REDIS_DB)
except Exception as e:
    logger.warning("Redis not available/connected: %s", e)
    redis_client = None

# --- initialize mysql connection pool (optional local pool) ---
# NOTE: If you prefer a single DB layer, keep run_query in backend.utils.db and remove the pool below.
POOL_NAME = "unisys_pool"
POOL_SIZE = int(os.getenv("UNISYS_DB_POOL_SIZE", 5))
_mysql_pool = None
try:
    _mysql_pool = pooling.MySQLConnectionPool(
        pool_name=POOL_NAME,
        pool_size=POOL_SIZE,
        **{k: v for k, v in DB_CONFIG.items() if v is not None}
    )
    logger.info("MySQL connection pool created (size=%s)", POOL_SIZE)
except Exception as e:
    logger.warning("Could not create MySQL pool: %s. Falling back to backend.utils.db", e)
    _mysql_pool = None



# -----------------------
# async device polling
# -----------------------

async def _poll_devices(devices: list, interval: int = 10):
    """
    Generic device poller for SNMP or demo.
    Sends bulk inserts to performance and traffic endpoints.
    """
    uptime_counters = {ip: 0 for ip in devices}

    while True:
        perf_payload = []
        traffic_payload = []

        for ip in devices:
            uptime_counters[ip] += interval

            # --- performance (demo/random) ---
            perf_payload.append({
                "device_ip": ip,
                "cpu_pct": round(random.uniform(5, 95), 2),
                "memory_pct": round(random.uniform(10, 90), 2),
                "uptime_seconds": uptime_counters[ip],
                "timestamp": datetime.utcnow()
            })

            # --- traffic (demo/random) ---
            for iface in ["eth0", "eth1"]:
                traffic_payload.append({
                    "device_ip": ip,
                    "interface_name": iface,
                    "inbound_kbps": round(random.uniform(100, 1200), 2),
                    "outbound_kbps": round(random.uniform(50, 900), 2),
                    "errors": random.randint(0, 5),
                    "timestamp": datetime.utcnow()
                })

        # --- insert to API endpoints ---
        try:
            if perf_payload:
                perf_q = """
                    INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
                    VALUES (%s, %s, %s, %s, %s)
                """
                perf_params = [
                    (p["device_ip"], p["cpu_pct"], p["memory_pct"], p["uptime_seconds"], p["timestamp"])
                    for p in perf_payload
                ]
                run_query(perf_q, params=perf_params, fetch=False, commit=True, many=True)

            if traffic_payload:
                # save_traffic_metrics expects list[dict] and can accept datetime objects
                save_traffic_metrics(traffic_payload)

            logger.info("Inserted demo metrics: %d perf, %d traffic", len(perf_payload), len(traffic_payload))
        except Exception as e:
            logger.error("Error inserting demo metrics: %s", e)

        await asyncio.sleep(interval)
async def poll_snmp_devices(devices: list, interval: int = 10, community: str = "public"):
    """
    Poll actual SNMP devices and save results.
    """
    while True:
        for ip in devices:
            try:
                # call the SNMP helper (RENAMED to avoid collision with endpoint)
                traffic_metrics = snmp_get_traffic_metrics(ip, community, "1.3.6.1.2.1.2.2.1")
                if traffic_metrics:
                    rows = [{
                        "device_ip": ip,
                        "if_index": 1,
                        "if_descr": "eth0",
                        "inbound_kbps": float(traffic_metrics.get("inOctets", 0)),
                        "outbound_kbps": float(traffic_metrics.get("outOctets", 0)),
                        "in_errors": int(traffic_metrics.get("inErrors", 0)),
                        "out_errors": int(traffic_metrics.get("outErrors", 0)),
                        "timestamp": datetime.utcnow()
                    }]
                    # save via DAO (should be safe)
                    save_traffic_metrics(rows)
                    logger.info("Saved SNMP traffic for %s", ip)

                # TODO: add SNMP CPU/memory polling if needed

            except Exception as e:
                logger.error("SNMP poll failed for %s: %s", ip, e)

        await asyncio.sleep(interval)


async def poll_traffic_loop():
    devices = ["127.0.0.1"]
    interval = 10  # seconds

    while True:
        metrics_payload = []
        for ip in devices:
            metrics_payload.append({
                "device_ip": ip,
                "interface_name": "eth0",
                "inbound_kbps": round(random.uniform(100, 1000), 2),
                "outbound_kbps": round(random.uniform(50, 800), 2),
                "errors": random.randint(0, 5),
                "timestamp": datetime.utcnow()
            })
            metrics_payload.append({
                "device_ip": ip,
                "interface_name": "eth1",
                "inbound_kbps": round(random.uniform(200, 1200), 2),
                "outbound_kbps": round(random.uniform(100, 900), 2),
                "errors": random.randint(0, 2),
                "timestamp": datetime.utcnow()
            })

        try:
            save_traffic_metrics(metrics_payload)
            logger.info("Inserted %d demo traffic rows", len(metrics_payload))
        except Exception as e:
            logger.error("Error inserting demo traffic: %s", e)

        await asyncio.sleep(interval)


async def poll_performance_loop():
    devices = ["127.0.0.1"]
    interval = 10
    uptime_counters = {ip: 0 for ip in devices}

    while True:
        metrics_payload = []
        for ip in devices:
            uptime_counters[ip] += interval
            metrics_payload.append({
                "device_ip": ip,
                "cpu_pct": round(random.uniform(5, 95), 2),
                "memory_pct": round(random.uniform(10, 90), 2),
                "uptime_seconds": uptime_counters[ip],
                "timestamp": datetime.utcnow()
            })

        try:
            perf_q = """
                INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
                VALUES (%s, %s, %s, %s, %s)
            """
            perf_params = [
                (p["device_ip"], p["cpu_pct"], p["memory_pct"], p["uptime_seconds"], p["timestamp"])
                for p in metrics_payload
            ]
            run_query(perf_q, params=perf_params, fetch=False, commit=True, many=True)
            logger.info("Inserted %d demo performance rows", len(metrics_payload))
        except Exception as e:
            logger.error("Error inserting demo performance: %s", e)

        await asyncio.sleep(interval)


# --- SNMP polling helper (RENAMED) ---
def snmp_get_traffic_metrics(device_ip, community, oid, port: Optional[int] = None):
    """
    SNMP helper — returns dict of OID -> value (strings).
    uses SNMP_PORT env when provided, or given port param.
    """
    try:
        snmp_port = int(port or os.getenv("SNMP_PORT", "161"))
    except Exception:
        snmp_port = 161

    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((device_ip, snmp_port)),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )

    errorIndication, errorStatus, errorIndex, varBinds = next(iterator)

    if errorIndication:
        logger.error("SNMP error: %s", errorIndication)
        return None
    elif errorStatus:
        logger.error("%s at %s", errorStatus.prettyPrint(),
                     errorIndex and varBinds[int(errorIndex) - 1][0] or '?')
        return None
    else:
        metrics = {}
        for varBind in varBinds:
            metrics[str(varBind[0])] = str(varBind[1])
        return metrics
def _format_signal_row(row):
    if not row:
        return None
    try:
        return {
            "rssi_dbm": float(row.get("rssi_dbm")) if row.get("rssi_dbm") is not None else None,
            "rssi_pct": float(row.get("rssi_pct")) if row.get("rssi_pct") is not None else None,
            "snr_db": float(row.get("snr_db")) if row.get("snr_db") is not None else None,
            "timestamp": _format_ts_for_client(row.get("timestamp"))
        }
    except Exception:
        # best-effort conversion
        return {
            "rssi_dbm": row.get("rssi_dbm"),
            "rssi_pct": row.get("rssi_pct"),
            "snr_db": row.get("snr_db"),
            "timestamp": _format_ts_for_client(row.get("timestamp"))
        }

def get_latest_signals_map(device_ips: Optional[List[str]] = None):
    """
    returns dict { device_ip: { rssi_dbm, rssi_pct, snr_db, timestamp } }
    if device_ips is provided, restricts to those device_ips.
    """
    try:
        if device_ips:
            # build placeholders
            placeholders = ",".join(["%s"] * len(device_ips))
            q = f"""
            SELECT s.device_ip, s.rssi_dbm, s.rssi_pct, s.snr_db, s.timestamp
            FROM signal_metrics s
            JOIN (
                SELECT device_ip, MAX(timestamp) AS max_ts
                FROM signal_metrics
                WHERE device_ip IN ({placeholders})
                GROUP BY device_ip
            ) latest ON latest.device_ip = s.device_ip AND latest.max_ts = s.timestamp
            """
            rows = run_query(q, tuple(device_ips), fetch=True, dict_cursor=True) or []
        else:
            q = """
            SELECT s.device_ip, s.rssi_dbm, s.rssi_pct, s.snr_db, s.timestamp
            FROM signal_metrics s
            JOIN (
                SELECT device_ip, MAX(timestamp) AS max_ts
                FROM signal_metrics
                GROUP BY device_ip
            ) latest ON latest.device_ip = s.device_ip AND latest.max_ts = s.timestamp
            """
            rows = run_query(q, fetch=True, dict_cursor=True) or []

        out = {}
        for r in rows:
            out[r["device_ip"]] = r
        return out
    except Exception as e:
        logger.exception("get_latest_signals_map error: %s", e)
        return {}

def poll_device(device_ip, community, oid):
    metrics = snmp_get_traffic_metrics(device_ip, community, oid)
    if metrics:
        logger.info("Polled %s -> %s", device_ip, metrics)
        rows = [{
            "device_ip": device_ip,
            "if_index": 1,
            "if_descr": oid,
            "inbound_kbps": float(metrics.get("inOctets", 0)),
            "outbound_kbps": float(metrics.get("outOctets", 0)),
            "in_errors": int(metrics.get("inErrors", 0)),
            "out_errors": int(metrics.get("outErrors", 0)),
            "last_updated": int(time.time())
        }]
        inserted = save_traffic_metrics(rows)
        logger.info("Saved %d row(s) for %s", inserted, device_ip)
    else:
        logger.warning("No metrics returned for %s", device_ip)


if __name__ == "__main__":
    device_ip = "127.0.0.1"
    community = "public"
    oid = "1.3.6.1.2.1.1.3.0"
    while True:
        poll_device(device_ip, community, oid)
        time.sleep(10)

# -----------------------
# NOTE: we prefer a single run_query implementation in backend.utils.db.
# If you still want the local helper, uncomment the implementations below,
# but by default they are commented to avoid shadowing the imported run_query.
# -----------------------

# def get_db_connection():
#     try:
#         if _mysql_pool:
#             return _mysql_pool.get_connection()
#         return mysql.connector.connect(**{k: v for k, v in DB_CONFIG.items() if v is not None})
#     except Error as e:
#         logger.exception("Database connection error")
#         raise HTTPException(status_code=500, detail=f"Database connection error: {e}")
#
# def run_query_local(query: str, params: Tuple = (), fetch: bool = True, many: bool = False, commit: bool = False, dict_cursor: bool = True):
#     conn = None
#     cursor = None
#     try:
#         conn = get_db_connection()
#         cursor = conn.cursor(dictionary=dict_cursor)
#         if many:
#             cursor.executemany(query, params)
#         else:
#             cursor.execute(query, params)
#         if commit:
#             conn.commit()
#         if fetch:
#             return cursor.fetchall()
#         return cursor.rowcount
#     except Error as e:
#         logger.exception("Database query error: %s -- params=%s", e, params)
#         raise
#     finally:
#         try:
#             if cursor:
#                 cursor.close()
#         except Exception:
#             pass
#         try:
#             if conn:
#                 conn.close()
#         except Exception:
#             pass

# --- health ---
@app.get("/api/")
def root():
    return {"message": "Unified Network System is running..."}

@app.get("/api/health")
def health_check():
    db_ok, redis_ok = True, True
    try:
        # uses backend.utils.db.run_query
        run_query("SELECT 1", fetch=False)
    except Exception:
        db_ok = False
    if redis_client:
        try:
            redis_client.ping()
        except Exception:
            redis_ok = False
    else:
        redis_ok = False
    return {"status": {"db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down"}}

@app.get("/health")
def root_health():
    # simple liveness for docker healthchecks
    db_ok, redis_ok = True, True
    try:
        run_query("SELECT 1", fetch=False)
    except Exception:
        db_ok = False
    if redis_client:
        try:
            redis_client.ping()
        except Exception:
            redis_ok = False
    else:
        redis_ok = False
    return {"status": {"db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down"}}

# --- Pydantic models for API (left here as DTOs) ---
class PerformanceMetricIn(BaseModel):
    device_ip: str
    cpu_pct: float
    memory_pct: float
    uptime_seconds: float
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)

class TrafficMetricIn(BaseModel):
    device_ip: str
    interface_name: str
    inbound_kbps: float
    outbound_kbps: float
    errors: int
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)

class InterfaceTrend(BaseModel):
    timestamp: datetime
    inbound_kbps: float
    outbound_kbps: float

class DeviceDashboard(BaseModel):
    device_ip: str
    cpu_pct: Optional[float]
    memory_pct: Optional[float]
    uptime_seconds: Optional[float]
    avg_cpu: Optional[float] = None
    avg_memory: Optional[float] = None
    total_inbound: int = 0
    total_outbound: int = 0
    total_errors: int = 0
    top_interfaces: List[dict] = []
    traffic_trend: List[InterfaceTrend] = []

# --- POST endpoints ---
@app.post("/api/performance")
def insert_performance_metric(metric: PerformanceMetricIn):
    query = """
        INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
        VALUES (%s, %s, %s, %s, %s)
    """
    try:
        run_query(query, (metric.device_ip, metric.cpu_pct, metric.memory_pct, metric.uptime_seconds, metric.timestamp), fetch=False, commit=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inserting performance metric failed: {e}")
    return {"status": "success", "message": "Performance metric inserted"}

@app.post("/api/traffic")
def insert_traffic_metric(metric: TrafficMetricIn):
    query = """
        INSERT INTO traffic_metrics (device_ip, interface_name, inbound_kbps, outbound_kbps, errors, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        run_query(query, (metric.device_ip, metric.interface_name, metric.inbound_kbps, metric.outbound_kbps, metric.errors, metric.timestamp), fetch=False, commit=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inserting traffic metric failed: {e}")
    return {"status": "success", "message": "Traffic metric inserted"}

# -----------------------
# Bulk insert - performance
# -----------------------
@app.post("/api/performance/bulk")
def bulk_insert_performance(metrics: List[PerformanceMetricIn]):
    query = """
        INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
        VALUES (%s, %s, %s, %s, %s)
    """
    params = [(m.device_ip, m.cpu_pct, m.memory_pct, m.uptime_seconds, m.timestamp) for m in metrics]

    try:
        run_query(query, params=params, fetch=False, commit=True, many=True)

        # ---- alerts ----
        for m in metrics:
            try:
                if m.cpu_pct > 90:
                    insert_alert(m.device_ip, "critical", f"High CPU usage: {m.cpu_pct}%")
                elif m.memory_pct > 85:
                    insert_alert(m.device_ip, "warning", f"High memory usage: {m.memory_pct}%")
            except Exception as e:
                logger.error("Failed to insert alert for %s: %s", m.device_ip, e)

        return {"status": "success", "inserted": len(metrics)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------
# Bulk insert - traffic
# -----------------------
@app.post("/api/traffic/bulk")
def bulk_insert_traffic(metrics: List[TrafficMetricIn]):
    query = """
        INSERT INTO traffic_metrics (device_ip, interface_name, inbound_kbps, outbound_kbps, errors, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    params = [(m.device_ip, m.interface_name, m.inbound_kbps, m.outbound_kbps, m.errors, m.timestamp) for m in metrics]

    try:
        run_query(query, params=params, fetch=False, commit=True, many=True)

        # ---- alerts ----
        for m in metrics:
            try:
                if m.errors > 0:
                    insert_alert(m.device_ip, "warning", f"Interface {m.interface_name} has {m.errors} errors")
            except Exception as e:
                logger.error("Failed to insert alert for %s/%s: %s", m.device_ip, m.interface_name, e)

        return {"status": "success", "inserted": len(metrics)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- GET endpoints ---
@app.get("/api/access/sessions")
def get_sessions():
    try:
        # align with access module DB table name and contract
        rows = run_query(
            """
            SELECT
              user,
              ip AS device_ip,
              mac,
              login_time,
              logout_time,
              duration_seconds AS duration,
              authenticated_via
            FROM access_sessions
            ORDER BY login_time DESC
            """,
            fetch=True,
            dict_cursor=True
        ) or []

        # normalize datetime to ISO strings for frontend
        for r in rows:
            if r.get("login_time"):
                r["login_time"] = _format_ts_for_client(r["login_time"])
            if r.get("logout_time"):
                r["logout_time"] = _format_ts_for_client(r["logout_time"])
        return rows
    except mysql.connector.errors.ProgrammingError as e:
        if e.errno == 1146:
            return []  # table doesn’t exist
        raise HTTPException(status_code=500, detail=f"Error fetching sessions: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sessions: {e}")
    

@app.get("/api/performance", response_model=List[PerformanceMetricIn])
def get_performance_metrics(limit: int = 10, offset: int = 0, min_cpu: Optional[float] = None, device_ip: Optional[str] = None, sort_by: str = "timestamp", sort_order: str = "desc"):
    allowed_sort = {"cpu_pct", "memory_pct", "uptime_seconds", "timestamp", "device_ip"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    if sort_order.lower() not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")
    query = "SELECT device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp FROM performance_metrics WHERE 1=1"
    params = []
    if min_cpu is not None:
        query += " AND cpu_pct >= %s"
        params.append(min_cpu)
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)
    query += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    try:
        return run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching performance metrics: {e}")

@app.get("/api/traffic", response_model=List[TrafficMetricIn])
def get_traffic_metrics(limit: int = 10, offset: int = 0, min_errors: Optional[int] = None, device_ip: Optional[str] = None, sort_by: str = "timestamp", sort_order: str = "desc"):
    allowed_sort = {"inbound_kbps", "outbound_kbps", "errors", "timestamp", "device_ip", "interface_name"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    if sort_order.lower() not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")
    query = "SELECT device_ip, interface_name AS interface_name, inbound_kbps, outbound_kbps, errors, timestamp FROM traffic_metrics WHERE 1=1"
    params = []
    if min_errors is not None:
        query += " AND errors >= %s"
        params.append(min_errors)
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)
    query += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    try:
        return run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic metrics: {e}")

# --- devices and dashboard endpoints ---
@app.get("/api/devices", response_model=List[DeviceSnapshot])
def get_device_snapshots(device_ip: Optional[str] = None, start_time: Optional[datetime] = None, end_time: Optional[datetime] = None,
                         min_cpu: Optional[float] = None, min_errors: Optional[int] = None, limit: int = 10, offset: int = 0,
                         sort_by: str = "device_ip", sort_order: str = "asc"):
    allowed_sort = {"device_ip", "cpu_pct", "memory_pct", "uptime_seconds"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    if sort_order.lower() not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")

    query = """
        SELECT 
            p.device_ip,
            p.cpu_pct,
            p.memory_pct,
            p.uptime_seconds,
            t.interface_name,
            t.inbound_kbps,
            t.outbound_kbps,
            t.errors
        FROM performance_metrics AS p
        JOIN (
            SELECT device_ip, MAX(timestamp) AS ts
            FROM performance_metrics
            GROUP BY device_ip
        ) AS m ON p.device_ip = m.device_ip AND p.timestamp = m.ts
        LEFT JOIN (
            SELECT t1.device_ip, t1.interface_name, t1.inbound_kbps, t1.outbound_kbps, t1.errors
            FROM traffic_metrics t1
            JOIN (
                SELECT device_ip, interface_name, MAX(timestamp) AS ts
                FROM traffic_metrics
                GROUP BY device_ip, interface_name
            ) AS t2 
            ON t1.device_ip = t2.device_ip AND t1.interface_name = t2.interface_name AND t1.timestamp = t2.ts
        ) AS t ON p.device_ip = t.device_ip
        WHERE 1=1
    """
    params = []
    if device_ip:
        query += " AND p.device_ip = %s"
        params.append(device_ip)
    if start_time:
        query += " AND p.timestamp >= %s"
        params.append(start_time)
    if end_time:
        query += " AND p.timestamp <= %s"
        params.append(end_time)
    if min_cpu is not None:
        query += " AND p.cpu_pct >= %s"
        params.append(min_cpu)
    if min_errors is not None:
        query += " AND (t.errors >= %s OR t.errors IS NULL)"
        params.append(min_errors)

    query += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        rows = run_query(query, tuple(params), fetch=True, dict_cursor=True) or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching devices: {e}")

    devices = {}
    for row in rows:
        ip = row["device_ip"]
        if ip not in devices:
            devices[ip] = {
                "device_ip": ip,
                "cpu_pct": row["cpu_pct"],
                "memory_pct": row["memory_pct"],
                "uptime_seconds": row["uptime_seconds"],
                "interfaces": []
            }
        if row.get("interface_name"):
            devices[ip]["interfaces"].append({
                "interface_name": row["interface_name"],
                "inbound_kbps": row["inbound_kbps"],
                "outbound_kbps": row["outbound_kbps"],
                "errors": row["errors"]
            })
    return list(devices.values())

# --- aggregations (top cpu/memory/errors) ---
@app.get("/api/performance/top-cpu")
def top_cpu_devices(limit: int = 5):
    query = """
        SELECT device_ip, MAX(cpu_pct) AS max_cpu
        FROM performance_metrics
        GROUP BY device_ip
        ORDER BY max_cpu DESC
        LIMIT %s
    """
    try:
        return run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top cpu devices: {e}")

@app.get("/api/performance/top-memory")
def top_memory_devices(limit: int = 5):
    query = """
        SELECT device_ip, MAX(memory_pct) AS max_memory
        FROM performance_metrics
        GROUP BY device_ip
        ORDER BY max_memory DESC
        LIMIT %s
    """
    try:
        return run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top memory devices: {e}")

@app.get("/api/traffic/errors-summary")
def traffic_errors_summary(min_errors: int = 1):
    query = """
        SELECT device_ip, SUM(errors) AS total_errors, COUNT(*) AS interfaces_with_errors
        FROM traffic_metrics
        WHERE errors >= %s
        GROUP BY device_ip
        ORDER BY total_errors DESC
    """
    try:
        return run_query(query, (min_errors,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic errors summary: {e}")

@app.get("/api/traffic/top-interfaces")
def top_traffic_interfaces(limit: int = 5):
    query = """
        SELECT device_ip, interface_name, SUM(inbound_kbps) AS total_inbound, SUM(outbound_kbps) AS total_outbound
        FROM traffic_metrics
        GROUP BY device_ip, interface_name
        ORDER BY total_inbound DESC
        LIMIT %s
    """
    try:
        return run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top interfaces: {e}")




# --- caching example for dashboard ---
def cache_get(key):
    if not redis_client:
        return None
    data = redis_client.get(key)
    if data:
        return json.loads(data)
    return None

def cache_set(key, value, ttl=CACHE_TTL):
    if not redis_client:
        return
    redis_client.set(key, json.dumps(value, default=str), ex=ttl)

@app.get("/api/dashboard/{device_ip}", response_model=DeviceDashboard)
def get_device_dashboard(device_ip: str):
    cached = cache_get(f"dashboard:{device_ip}")
    if cached:
        return cached
    try:
        perf = run_query("SELECT cpu_pct, memory_pct, uptime_seconds FROM performance_metrics WHERE device_ip=%s ORDER BY timestamp DESC LIMIT 1", (device_ip,), fetch=True)
        traffic_rows = run_query("SELECT interface_name, inbound_kbps, outbound_kbps, errors FROM traffic_metrics WHERE device_ip=%s ORDER BY timestamp DESC LIMIT 10", (device_ip,), fetch=True)
        total_inbound = sum([r["inbound_kbps"] for r in traffic_rows])
        total_outbound = sum([r["outbound_kbps"] for r in traffic_rows])
        total_errors = sum([r["errors"] for r in traffic_rows])
        top_interfaces = sorted(traffic_rows, key=lambda x: x["inbound_kbps"], reverse=True)[:5]
        dashboard = DeviceDashboard(
            device_ip=device_ip,
            cpu_pct=perf[0]["cpu_pct"] if perf else None,
            memory_pct=perf[0]["memory_pct"] if perf else None,
            uptime_seconds=perf[0]["uptime_seconds"] if perf else None,
            total_inbound=total_inbound,
            total_outbound=total_outbound,
            total_errors=total_errors,
            top_interfaces=top_interfaces,
            traffic_trend=[InterfaceTrend(timestamp=datetime.utcnow(), inbound_kbps=r["inbound_kbps"], outbound_kbps=r["outbound_kbps"]) for r in traffic_rows]
        )
        cache_set(f"dashboard:{device_ip}", jsonable_encoder(dashboard))
        return dashboard
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard: {e}")

@app.get("/api/traffic/device/{device_ip}/recent")
def get_device_recent_traffic(device_ip: str, limit: int = 0):
    """
    Return recent traffic metrics for device_ip.

    - If ?limit=N and N>0 -> return up to N recent rows (ordered by timestamp desc).
    - If no limit (or limit==0) -> return one latest row per interface (most useful for dashboards).
    """
    try:
        # Raw recent rows if requested
        if limit and limit > 0:
            sql = """
                SELECT device_ip, interface_name, inbound_kbps, outbound_kbps,
                       in_errors, out_errors, errors, timestamp
                FROM traffic_metrics
                WHERE device_ip = %s
                ORDER BY timestamp DESC
                LIMIT %s
            """
            rows = run_query(sql, (device_ip, limit), fetch=True)
            return {"device_ip": device_ip, "rows": rows}

        # Default: latest row per interface
        sql = """
            SELECT t.device_ip, t.interface_name, t.inbound_kbps, t.outbound_kbps,
                   t.in_errors, t.out_errors, t.errors, t.timestamp
            FROM traffic_metrics t
            JOIN (
                SELECT interface_name, MAX(timestamp) AS ts
                FROM traffic_metrics
                WHERE device_ip = %s
                GROUP BY interface_name
            ) m ON t.interface_name = m.interface_name AND t.timestamp = m.ts
            WHERE t.device_ip = %s
            ORDER BY t.interface_name
        """
        rows = run_query(sql, (device_ip, device_ip), fetch=True)
        return {"device_ip": device_ip, "latest_per_interface": rows}

    except Exception as e:
        # keep message short but actionable for frontend/devs
        raise HTTPException(status_code=500, detail=f"Error fetching recent metrics: {e}")
    


# -----------------------
# PERFORMANCE HISTORY
# -----------------------
@app.get("/api/performance/history")
def get_performance_history(
    device_ip: Optional[str] = Query(None, description="Filter by device IP"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """
    Returns historical CPU/Memory usage.
    """
    query = """
        SELECT device_ip, cpu_pct, memory_pct, timestamp
        FROM performance_metrics
        WHERE 1=1
    """
    params = []

    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)

    query += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        return run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching performance history: {e}")


# -----------------------
# TRAFFIC HISTORY
# -----------------------
@app.get("/api/traffic/history")
def get_traffic_history(
    device_ip: Optional[str] = Query(None, description="Filter by device IP"),
    interface_name: Optional[str] = Query(None, description="Filter by interface name"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """
    Returns historical traffic metrics (kbps + errors).
    """
    query = """
        SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, errors, timestamp
        FROM traffic_metrics
        WHERE 1=1
    """
    params = []

    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)

    if interface_name:
        query += " AND interface_name = %s"
        params.append(interface_name)

    query += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        return run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic history: {e}")



# -----------------------
# discovery
# -----------------------


@app.get("/api/discovery/devices", response_model=List[DeviceSnapshot])
def discovery_devices():
    try:
        perf_devices = run_query(
            """
            SELECT p.device_ip, p.cpu_pct, p.memory_pct, p.uptime_seconds, p.timestamp
            FROM performance_metrics p
            JOIN (
                SELECT device_ip, MAX(timestamp) AS ts
                FROM performance_metrics
                GROUP BY device_ip
            ) m ON p.device_ip = m.device_ip AND p.timestamp = m.ts
            """,
            fetch=True,
            dict_cursor=True
        ) or []

        traffic_rows = run_query(
            """
            SELECT t.device_ip, t.interface_name, t.inbound_kbps, t.outbound_kbps, t.errors
            FROM traffic_metrics t
            JOIN (
                SELECT device_ip, interface_name, MAX(timestamp) AS ts
                FROM traffic_metrics
                GROUP BY device_ip, interface_name
            ) m ON t.device_ip = m.device_ip AND t.interface_name = m.interface_name AND t.timestamp = m.ts
            """,
            fetch=True,
            dict_cursor=True
        ) or []

        discovery_rows = get_device_inventory() or []  # ensure this returns list[dict] with key "ip"

        now = datetime.utcnow()
        ONLINE_THRESHOLD = int(os.getenv("UNISYS_ONLINE_THRESHOLD", "120"))  # seconds, make configurable

        devices = {}

        # First populate devices from latest perf rows
        for d in perf_devices:
            ip = d["device_ip"]
            perf_ts = d.get("timestamp")
            # parse perf_ts into datetime if needed for comparison
            perf_dt = None
            if perf_ts:
                try:
                    perf_dt = datetime.fromisoformat(perf_ts) if isinstance(perf_ts, str) else perf_ts
                except Exception:
                    # if parsing fails, ignore and treat as None
                    perf_dt = perf_ts if isinstance(perf_ts, datetime) else None

            # SNMP discovery rows might use "ip" or "device_ip" depending on implementation.
            snmp_info = next((x for x in discovery_rows if x.get("ip") == ip or x.get("device_ip") == ip), None)

            # discovery last_seen (may be ISO string or datetime)
            disc_last_seen_raw = None
            disc_dt = None
            if isinstance(snmp_info, dict):
                disc_last_seen_raw = snmp_info.get("last_seen") or snmp_info.get("timestamp")
                if disc_last_seen_raw:
                    try:
                        disc_dt = datetime.fromisoformat(disc_last_seen_raw) if isinstance(disc_last_seen_raw, str) else disc_last_seen_raw
                    except Exception:
                        disc_dt = disc_last_seen_raw if isinstance(disc_last_seen_raw, datetime) else None

            # choose most recent last_seen between perf_ts and discovery last_seen
            chosen_dt = None
            last_seen_source = None
            if perf_dt and disc_dt:
                if perf_dt >= disc_dt:
                    chosen_dt = perf_dt
                    last_seen_source = "perf"
                else:
                    chosen_dt = disc_dt
                    last_seen_source = "discovery"
            elif perf_dt:
                chosen_dt = perf_dt
                last_seen_source = "perf"
            elif disc_dt:
                chosen_dt = disc_dt
                last_seen_source = "discovery"

            last_seen_str = _format_ts_for_client(chosen_dt)

            # prefer status from SNMP discovery info if available; otherwise use online heuristic
            inferred_status = None
            if isinstance(snmp_info, dict):
                # allow boolean 'online' or 'status' string
                inferred_status = snmp_info.get("status") or (("up" if snmp_info.get("online") else None) if snmp_info.get("online") is not None else None)
            # if still None, infer from chosen_dt vs now threshold
            if not inferred_status:
                inferred_status = "up" if (chosen_dt and (now - chosen_dt).total_seconds() <= ONLINE_THRESHOLD) else "down"

            # build hostname/desc/vendor/os by checking many fallbacks (discovery may use different keys)
            hostname = None
            description = None
            vendor_val = None
            os_version_val = None
            error_val = None
            if isinstance(snmp_info, dict):
                hostname = snmp_info.get("hostname") or snmp_info.get("db_hostname") or snmp_info.get("name")
                description = snmp_info.get("description") or snmp_info.get("db_description")
                vendor_val = snmp_info.get("vendor")
                os_version_val = snmp_info.get("os_version") or snmp_info.get("os")
                error_val = snmp_info.get("error")

            # prefer performance metrics from the perf row; if missing, fall back to discovery-provided metrics
            cpu_val = d.get("cpu_pct") if d.get("cpu_pct") is not None else (snmp_info.get("cpu_pct") if isinstance(snmp_info, dict) else None)
            mem_val = d.get("memory_pct") if d.get("memory_pct") is not None else (snmp_info.get("memory_pct") if isinstance(snmp_info, dict) else None)
            uptime_val = d.get("uptime_seconds") if d.get("uptime_seconds") is not None else (snmp_info.get("uptime_seconds") if isinstance(snmp_info, dict) else None)

            # compute boolean online (explicit discovery status overrides heuristics)
            online_bool = False
            if isinstance(snmp_info, dict) and snmp_info.get("status") is not None:
                online_bool = str(snmp_info.get("status")).lower() in ("up", "online", "true")
            elif chosen_dt:
                online_bool = (now - chosen_dt).total_seconds() <= ONLINE_THRESHOLD
            else:
                online_bool = False

            devices[ip] = {
                "device_ip": ip,
                "cpu_pct": cpu_val,
                "memory_pct": mem_val,
                "uptime_seconds": uptime_val,
                "interfaces": [],
                "online": online_bool,
                "last_seen": last_seen_str,
                "last_seen_source": last_seen_source,   # new field (perf | discovery | None)
                # only set discovery values if present; otherwise leave None (frontend shows —)
                "hostname": hostname,
                "description": description,
                "vendor": vendor_val,
                "os_version": os_version_val,
                "status": inferred_status,
                "error": error_val
            }

            print(f"[discovery-debug] ip={ip} snmp_info={snmp_info} perf_ts={perf_ts} chosen_last_seen={last_seen_str} cpu={cpu_val}")
            
        # Add discovered-only devices (no perf rows)
        for disc in discovery_rows:
            # accept either key name
            ip = disc.get("ip") or disc.get("device_ip")
            if not ip or ip in devices:
                continue

            # determine online from discovery's last_seen or status
            online = False
            last_seen = disc.get("last_seen") or disc.get("timestamp")
            if last_seen:
                try:
                    last_seen_dt = datetime.fromisoformat(last_seen) if isinstance(last_seen, str) else last_seen
                    online = (now - last_seen_dt).total_seconds() <= ONLINE_THRESHOLD
                except Exception:
                    online = False
            else:
                status = disc.get("status")
                if status is not None:
                    online = str(status).lower() in ("up", "online", "true")

            # format last_seen from discovery rows (if available)
            last_seen_raw = disc.get("last_seen") or disc.get("timestamp")
            last_seen_str = _format_ts_for_client(last_seen_raw)

            # prefer the explicit status from discovery if present, otherwise infer from online boolean
            inferred_status = disc.get("status") or ("up" if online else "down")

            devices[ip] = {
                "device_ip": ip,
                "cpu_pct": None,
                "memory_pct": None,
                "uptime_seconds": None,
                "interfaces": [],
                "online": online,
                "last_seen": last_seen_str,
                "hostname": disc.get("hostname") or disc.get("name"),
                "description": disc.get("description"),
                "vendor": disc.get("vendor"),
                "os_version": disc.get("os_version") or disc.get("os"),
                "status": inferred_status,
                "error": disc.get("error")
            }
        # Attach traffic interface info
        for row in traffic_rows:
            ip = row.get("device_ip")
            if ip in devices:
                devices[ip]["interfaces"].append({
                    "interface_name": row.get("interface_name", ""),
                    "inbound_kbps": row.get("inbound_kbps", 0),
                    "outbound_kbps": row.get("outbound_kbps", 0),
                    "errors": row.get("errors", 0)
                })
        try:
            device_ips = list(devices.keys())
            if device_ips:
                sigmap = get_latest_signals_map(device_ips)
                for ip, dev in devices.items():
                    sig_row = sigmap.get(ip)
                    dev["signal"] = _format_signal_row(sig_row) if sig_row else None
        except Exception as e:
            logger.warning("failed to attach signals to discovery devices: %s", e)

        return list(devices.values())

    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Error fetching devices: {e}"})

@app.get("/api/devices/{device_ip}/details")
def device_details(
    device_ip: str = Path(..., description="Device IP to fetch details for"),
    start: Optional[datetime] = Query(None, description="Start time (ISO) to filter history"),
    end: Optional[datetime] = Query(None, description="End time (ISO) to filter history"),
    perf_limit: int = Query(200, ge=1, le=5000, description="Max performance rows to return"),
    traffic_limit: int = Query(200, ge=1, le=5000, description="Max traffic rows to return"),
    interface: Optional[str] = Query(None, description="Filter traffic by interface name"),
):
    """
    Combined device details payload for the frontend:
      - snapshot: latest perf row (cpu/memory/uptime)
      - performance_history: ordered DESC by timestamp (limited)
      - traffic_history: ordered DESC by timestamp (limited, optional interface filter)
    """
    try:
        # --- snapshot (latest perf row) ---
        snap_q = """
            SELECT cpu_pct, memory_pct, uptime_seconds, timestamp
            FROM performance_metrics
            WHERE device_ip = %s
            ORDER BY timestamp DESC
            LIMIT 1
        """
        snap_rows = run_query(snap_q, (device_ip,), fetch=True, dict_cursor=True) or []
        snapshot = snap_rows[0] if snap_rows else None

        # --- performance history ---
        perf_q = """
            SELECT timestamp, cpu_pct, memory_pct
            FROM performance_metrics
            WHERE device_ip = %s
        """
        perf_params: List = [device_ip]
        if start:
            perf_q += " AND timestamp >= %s"
            perf_params.append(start)
        if end:
            perf_q += " AND timestamp <= %s"
            perf_params.append(end)
        perf_q += " ORDER BY timestamp DESC LIMIT %s"
        perf_params.append(perf_limit)
        perf_history = run_query(perf_q, tuple(perf_params), fetch=True, dict_cursor=True) or []

        # --- traffic history ---
        traffic_q = """
            SELECT timestamp, interface_name, inbound_kbps, outbound_kbps, errors
            FROM traffic_metrics
            WHERE device_ip = %s
        """
        traffic_params: List = [device_ip]
        if interface:
            traffic_q += " AND interface_name = %s"
            traffic_params.append(interface)
        if start:
            traffic_q += " AND timestamp >= %s"
            traffic_params.append(start)
        if end:
            traffic_q += " AND timestamp <= %s"
            traffic_params.append(end)
        traffic_q += " ORDER BY timestamp DESC LIMIT %s"
        traffic_params.append(traffic_limit)
        traffic_history = run_query(traffic_q, tuple(traffic_params), fetch=True, dict_cursor=True) or []

        # --- optionally include latest per-interface rows (useful for overview) ---
        latest_if_rows = run_query(
            """
            SELECT t.device_ip, t.interface_name, t.inbound_kbps, t.outbound_kbps, t.errors, t.timestamp
            FROM traffic_metrics t
            JOIN (
                SELECT interface_name, MAX(timestamp) AS ts
                FROM traffic_metrics
                WHERE device_ip = %s
                GROUP BY interface_name
            ) m ON t.interface_name = m.interface_name AND t.timestamp = m.ts
            WHERE t.device_ip = %s
            """,
            (device_ip, device_ip),
            fetch=True,
            dict_cursor=True
        ) or []
        # attach top-level latest signal for device
        try:
            sig_row = run_query(
                "SELECT rssi_dbm, rssi_pct, snr_db, timestamp FROM signal_metrics WHERE device_ip=%s ORDER BY timestamp DESC LIMIT 1",
                (device_ip,),
                fetch=True,
                dict_cursor=True
            )
            top_sig = sig_row[0] if sig_row else None
            top_sig_obj = _format_signal_row(top_sig)
        except Exception as e:
            logger.exception("error fetching top-level signal for %s: %s", device_ip, e)
            top_sig_obj = None

        # attach per-interface latest signal if available (match by interface_name or interface_index)
        try:
            # try interface_name-based mapping first (if your signal_metrics stores interface_name)
            per_if_map = {}
            rows = run_query(
                """
                SELECT device_ip, interface_index, interface_name, rssi_dbm, rssi_pct, snr_db, timestamp
                FROM signal_metrics s
                JOIN (
                    SELECT COALESCE(interface_name, interface_index) as keyname, MAX(timestamp) as max_ts
                    FROM signal_metrics
                    WHERE device_ip=%s
                    GROUP BY COALESCE(interface_name, interface_index)
                ) latest ON (COALESCE(s.interface_name, s.interface_index) = latest.keyname AND s.timestamp = latest.max_ts)
                WHERE s.device_ip=%s
                """,
                (device_ip, device_ip),
                fetch=True,
                dict_cursor=True
            ) or []
            for r in rows:
                # prefer interface_name where present, fallback to index
                key = r.get("interface_name") or str(r.get("interface_index"))
                per_if_map[key] = r
        except Exception:
            per_if_map = {}

        # attach signal field to each latest_per_interface row if possible
        for idx, row in enumerate(latest_if_rows):
            key = row.get("interface_name") or str(row.get("interface_index", ""))
            sig_row = per_if_map.get(key)
            if sig_row:
                latest_if_rows[idx]["signal"] = _format_signal_row(sig_row)

        return {
            "device_ip": device_ip,
            "signal": top_sig_obj,
            "snapshot": snapshot,
            "latest_per_interface": latest_if_rows,
            "performance_history": perf_history,
            "traffic_history": traffic_history,
        }

    except Exception as e:
        logger.exception("Error building device details for %s", device_ip)
        raise HTTPException(status_code=500, detail=f"Error fetching device details: {e}")


