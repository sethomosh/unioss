# app/main.py
import os
import logging
import redis
import json
import time
import random
from datetime import datetime
from typing import List, Optional, Tuple
from fastapi import BackgroundTasks
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Body
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
import mysql.connector
import asyncio
from backend.modules import traffic as traffic_module
from mysql.connector import Error, pooling
from pysnmp.hlapi import (
    SnmpEngine, CommunityData, UdpTransportTarget,
    ContextData, ObjectType, ObjectIdentity, getCmd
)
from backend.db.traffic_dao import save_traffic_metrics

# --- logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger("unisys")

app = FastAPI(title="Unified Network System")

@app.on_event("startup")
async def startup_event():
    # run traffic poller in background
    asyncio.create_task(poll_traffic_loop())
    asyncio.create_task(poll_performance_loop())


origins = [
    "http://localhost:5173",  # your frontend dev server
    "http://127.0.0.1:5173",  # optional: in case frontend uses 127.0.0.1
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

# --- initialize mysql connection pool ---
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
    logger.warning("Could not create MySQL pool: %s. Falling back to direct connect.", e)
    _mysql_pool = None


async def poll_traffic_loop():
    """
    continuously generate demo traffic metrics every N seconds
    """
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
            insert_traffic_metrics_bulk([TrafficMetricIn(**m) for m in metrics_payload])
            logger.info("Inserted %d demo traffic rows", len(metrics_payload))
        except Exception as e:
            logger.error("Error inserting demo traffic: %s", e)

        await asyncio.sleep(interval)

async def poll_performance_loop():
    """
    Continuously generate demo performance metrics every N seconds.
    """
    devices = ["127.0.0.1"]
    interval = 10  # seconds
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
            insert_performance_metrics_bulk([PerformanceMetricIn(**m) for m in metrics_payload])
            logger.info("Inserted %d demo performance rows", len(metrics_payload))
        except Exception as e:
            logger.error("Error inserting demo performance: %s", e)

        await asyncio.sleep(interval)




# --- SNMP polling ---
def get_traffic_metrics(device_ip, community, oid):
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((device_ip, 161)),
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

def poll_device(device_ip, community, oid):
    metrics = get_traffic_metrics(device_ip, community, oid)
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

# --- database helpers ---
def get_db_connection():
    try:
        if _mysql_pool:
            return _mysql_pool.get_connection()
        return mysql.connector.connect(**{k: v for k, v in DB_CONFIG.items() if v is not None})
    except Error as e:
        logger.exception("Database connection error")
        raise HTTPException(status_code=500, detail=f"Database connection error: {e}")

def run_query(query: str, params: Tuple = (), fetch: bool = True, many: bool = False, commit: bool = False, dict_cursor: bool = True):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=dict_cursor)
        if many:
            cursor.executemany(query, params)
        else:
            cursor.execute(query, params)
        if commit:
            conn.commit()
        if fetch:
            return cursor.fetchall()
        return cursor.rowcount
    except Error as e:
        logger.exception("Database query error: %s -- params=%s", e, params)
        raise
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass

# --- health ---
@app.get("/")
def root():
    return {"message": "Unified Network System is running..."}

@app.get("/health")
def health_check():
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

# --- Pydantic models ---
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

class InterfaceSnapshot(BaseModel):
    interface_name: str
    inbound_kbps: float
    outbound_kbps: float
    errors: int

class DeviceSnapshot(BaseModel):
    device_ip: str
    cpu_pct: float
    memory_pct: float
    uptime_seconds: float
    interfaces: List[InterfaceSnapshot] = []

class InterfaceTrend(BaseModel):
    timestamp: datetime
    inbound_kbps: float
    outbound_kbps: float

class DeviceDashboard(BaseModel):
    device_ip: str
    cpu_pct: Optional[float]
    memory_pct: Optional[float]
    uptime_seconds: Optional[float]
    avg_cpu: Optional[float]
    avg_memory: Optional[float]
    total_inbound: int
    total_outbound: int
    total_errors: int
    top_interfaces: List[dict] = []
    traffic_trend: List[InterfaceTrend] = []

# --- POST endpoints ---
@app.post("/performance")
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

@app.post("/traffic")
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

@app.post("/performance/bulk")
def insert_performance_metrics_bulk(metrics: List[PerformanceMetricIn] = Body(...)):
    if not metrics:
        raise HTTPException(status_code=400, detail="Empty metrics list")
    query = """
        INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
        VALUES (%s, %s, %s, %s, %s)
    """
    values = [(m.device_ip, m.cpu_pct, m.memory_pct, m.uptime_seconds, m.timestamp) for m in metrics]
    try:
        run_query(query, values, fetch=False, many=True, commit=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk insert performance failed: {e}")
    return {"status": "success", "inserted": len(values)}

@app.post("/traffic/bulk")
def insert_traffic_metrics_bulk(metrics: List[TrafficMetricIn] = Body(...)):
    if not metrics:
        raise HTTPException(status_code=400, detail="Empty metrics list")
    query = """
        INSERT INTO traffic_metrics (device_ip, interface_name, inbound_kbps, outbound_kbps, errors, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    values = [(m.device_ip, m.interface_name, m.inbound_kbps, m.outbound_kbps, m.errors, m.timestamp) for m in metrics]
    try:
        run_query(query, values, fetch=False, many=True, commit=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk insert traffic failed: {e}")
    return {"status": "success", "inserted": len(values)}

# --- GET endpoints ---
@app.get("/performance", response_model=List[PerformanceMetricIn])
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

@app.get("/traffic", response_model=List[TrafficMetricIn])
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
@app.get("/devices", response_model=List[DeviceSnapshot])
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
        FROM performance_metrics p
        LEFT JOIN traffic_metrics t ON p.device_ip = t.device_ip
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
@app.get("/performance/top-cpu")
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

@app.get("/performance/top-memory")
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

@app.get("/traffic/errors-summary")
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

@app.get("/traffic/top-interfaces")
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

@app.get("/dashboard/{device_ip}", response_model=DeviceDashboard)
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

@app.get("/traffic/device/{device_ip}/recent")
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
@app.get("/performance/history")
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
@app.get("/traffic/history")
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
