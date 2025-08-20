# app/main.py
import os
import logging
import redis
import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.encoders import jsonable_encoder
import mysql.connector
from mysql.connector import Error
from mysql.connector import pooling
from typing import List, Optional, Any, Tuple
from pydantic import BaseModel, Field
from datetime import datetime
from fastapi import Body
from datetime import timedelta

# --- logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger("unisys")

app = FastAPI(title="Unified Network System")

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

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)

DB_CONFIG = {
    "host": os.getenv("UNISYS_DB_HOST", "localhost"),
    "user": os.getenv("UNISYS_DB_USER", "unisys_user"),
    "password": os.getenv("UNISYS_DB_PASS", "StrongP@ssw0rd"),
    "database": os.getenv("UNISYS_DB_NAME", "unisys"),
}
# --- initialize redis client ---
try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    # quick ping to raise early if misconfigured
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


def get_db_connection():
    """
    Return a MySQL connection. Prefer pooled connections if available.
    """
    try:
        if _mysql_pool:
            return _mysql_pool.get_connection()
        return mysql.connector.connect(**{k: v for k, v in DB_CONFIG.items() if v is not None})
    except Error as e:
        logger.exception("Database connection error")
        raise HTTPException(status_code=500, detail=f"Database connection error: {e}")


def run_query(query: str, params: Tuple = (), fetch: bool = True, many: bool = False, commit: bool = False, dict_cursor: bool = True):
    """
    Helper that executes a query and safely closes cursor/connection.
    - query: SQL query
    - params: tuple/list of params (or list of tuples for many=True)
    - fetch: whether to fetch results
    - many: use executemany for bulk inserts
    - commit: commit transaction after executing
    - dict_cursor: use dictionary cursor for SELECTs
    Returns fetched results (list) when fetch=True else number of rows affected.
    """
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
        # Re-raise as HTTPException in endpoints, or return None for internal calls
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


# --- basic health ---
@app.get("/")
def root():
    return {"message": "Unified Network System is running..."}


@app.get("/health")
def health_check():
    # quick check DB and Redis availability
    db_ok = True
    redis_ok = True
    try:
        # very lightweight query
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

    status = {"db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down"}
    return {"status": status}


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


# --- BULK POST endpoints ---
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


# --- GET endpoints with pagination & sorting ---
@app.get("/performance", response_model=List[PerformanceMetricIn])
def get_performance_metrics(
    limit: int = 10,
    offset: int = 0,
    min_cpu: Optional[float] = None,
    device_ip: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc"
):
    allowed_sort = {"cpu_pct", "memory_pct", "uptime_seconds", "timestamp", "device_ip"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    sort_order = sort_order.lower()
    if sort_order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")

    query = "SELECT device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp FROM performance_metrics WHERE 1=1"
    params = []

    if min_cpu is not None:
        query += " AND cpu_pct >= %s"
        params.append(min_cpu)
    if device_ip is not None:
        query += " AND device_ip = %s"
        params.append(device_ip)

    query += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        results = run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching performance metrics: {e}")
    return results


@app.get("/traffic", response_model=List[TrafficMetricIn])
def get_traffic_metrics(
    limit: int = 10,
    offset: int = 0,
    min_errors: Optional[int] = None,
    device_ip: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc"
):
    allowed_sort = {"inbound_kbps", "outbound_kbps", "errors", "timestamp", "device_ip", "interface_name"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    sort_order = sort_order.lower()
    if sort_order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")

    query = "SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, errors, timestamp FROM traffic_metrics WHERE 1=1"
    params = []

    if min_errors is not None:
        query += " AND errors >= %s"
        params.append(min_errors)
    if device_ip is not None:
        query += " AND device_ip = %s"
        params.append(device_ip)

    query += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        results = run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic metrics: {e}")
    return results


@app.get("/devices", response_model=List[DeviceSnapshot])
def get_device_snapshots(
    device_ip: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    min_cpu: Optional[float] = None,
    min_errors: Optional[int] = None,
    limit: int = 10,
    offset: int = 0,
    sort_by: str = "device_ip",
    sort_order: str = "asc"
):
    allowed_sort = {"device_ip", "cpu_pct", "memory_pct", "uptime_seconds"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by value. Allowed: {allowed_sort}")
    sort_order = sort_order.lower()
    if sort_order not in {"asc", "desc"}:
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


# --- aggregation endpoints (keep behavior the same) ---
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
        results = run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top cpu devices: {e}")
    return results


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
        results = run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top memory devices: {e}")
    return results


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
        results = run_query(query, (min_errors,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic errors summary: {e}")
    return results


@app.get("/traffic/top-interfaces")
def top_traffic_interfaces(limit: int = 5):
    query = """
        SELECT device_ip, interface_name, (inbound_kbps + outbound_kbps) AS total_kbps
        FROM traffic_metrics
        ORDER BY total_kbps DESC
        LIMIT %s
    """
    try:
        results = run_query(query, (limit,), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top interfaces: {e}")
    return results


# --- time-based aggregation endpoints ---
@app.get("/performance/average")
def average_performance_metrics(
    period_hours: int = 1,
    device_ip: Optional[str] = None
):
    query = """
        SELECT device_ip, 
               AVG(cpu_pct) AS avg_cpu,
               AVG(memory_pct) AS avg_memory,
               MAX(uptime_seconds) AS max_uptime
        FROM performance_metrics
        WHERE timestamp >= NOW() - INTERVAL %s HOUR
    """
    params = [period_hours]
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)
    query += " GROUP BY device_ip ORDER BY avg_cpu DESC"

    try:
        results = run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching average performance: {e}")
    return results


@app.get("/traffic/total")
def total_traffic_metrics(
    period_hours: int = 1,
    device_ip: Optional[str] = None
):
    query = """
        SELECT device_ip,
               SUM(inbound_kbps) AS total_inbound,
               SUM(outbound_kbps) AS total_outbound,
               SUM(errors) AS total_errors
        FROM traffic_metrics
        WHERE timestamp >= NOW() - INTERVAL %s HOUR
    """
    params = [period_hours]
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)
    query += " GROUP BY device_ip ORDER BY total_inbound DESC"

    try:
        results = run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching total traffic: {e}")
    return results


@app.get("/traffic/trend")
def traffic_trend(
    period_hours: int = 24,
    interval_minutes: int = 60,
    device_ip: Optional[str] = None
):
    query = """
        SELECT 
            device_ip,
            FLOOR(UNIX_TIMESTAMP(timestamp) / (%s*60)) AS interval_bucket,
            SUM(inbound_kbps) AS inbound_sum,
            SUM(outbound_kbps) AS outbound_sum
        FROM traffic_metrics
        WHERE timestamp >= NOW() - INTERVAL %s HOUR
    """
    params = [interval_minutes, period_hours]
    if device_ip:
        query += " AND device_ip = %s"
        params.append(device_ip)
    query += " GROUP BY device_ip, interval_bucket ORDER BY interval_bucket ASC"

    try:
        results = run_query(query, tuple(params), fetch=True, dict_cursor=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic trend: {e}")
    return results


# --- dashboard with caching ---
@app.get("/devices/dashboard", response_model=List[DeviceDashboard])
def devices_dashboard(
    period_hours: int = 1,
    interval_minutes: int = 10,
    top_interfaces_limit: int = 3,
    use_cache: bool = True
):
    cache_key = f"dashboard_{period_hours}_{interval_minutes}_{top_interfaces_limit}"
    if use_cache and redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                logger.exception("Failed to decode cached dashboard; regenerating")

    try:
        # Latest perf
        perf_rows = run_query("""
            SELECT p1.device_ip, p1.cpu_pct, p1.memory_pct, p1.uptime_seconds
            FROM performance_metrics p1
            INNER JOIN (
                SELECT device_ip, MAX(timestamp) AS max_ts
                FROM performance_metrics
                GROUP BY device_ip
            ) p2 ON p1.device_ip = p2.device_ip AND p1.timestamp = p2.max_ts
        """, tuple(), fetch=True, dict_cursor=True) or []

        # Average
        avg_rows_list = run_query("""
            SELECT device_ip,
                   AVG(cpu_pct) AS avg_cpu,
                   AVG(memory_pct) AS avg_memory
            FROM performance_metrics
            WHERE timestamp >= NOW() - INTERVAL %s HOUR
            GROUP BY device_ip
        """, (period_hours,), fetch=True, dict_cursor=True) or []
        avg_rows = {r['device_ip']: r for r in avg_rows_list}

        # Traffic totals
        traffic_rows_list = run_query("""
            SELECT device_ip,
                   SUM(inbound_kbps) AS total_inbound,
                   SUM(outbound_kbps) AS total_outbound,
                   SUM(errors) AS total_errors
            FROM traffic_metrics
            WHERE timestamp >= NOW() - INTERVAL %s HOUR
            GROUP BY device_ip
        """, (period_hours,), fetch=True, dict_cursor=True) or []
        traffic_rows = {r['device_ip']: r for r in traffic_rows_list}

        # Top interfaces
        iface_rows_list = run_query("""
            SELECT device_ip, interface_name, (inbound_kbps + outbound_kbps) AS total_kbps
            FROM traffic_metrics t1
            WHERE timestamp >= NOW() - INTERVAL %s HOUR
            ORDER BY device_ip, total_kbps DESC
        """, (period_hours,), fetch=True, dict_cursor=True) or []
        iface_rows = {}
        for row in iface_rows_list:
            iface_rows.setdefault(row['device_ip'], []).append({
                "interface_name": row["interface_name"],
                "total_kbps": row["total_kbps"]
            })

        # Trend
        trend_rows_list = run_query("""
            SELECT device_ip,
                   FLOOR(UNIX_TIMESTAMP(timestamp) / (%s*60)) AS interval_bucket,
                   SUM(inbound_kbps) AS inbound_sum,
                   SUM(outbound_kbps) AS outbound_sum,
                   MIN(timestamp) AS ts
            FROM traffic_metrics
            WHERE timestamp >= NOW() - INTERVAL %s HOUR
            GROUP BY device_ip, interval_bucket
            ORDER BY device_ip, interval_bucket
        """, (interval_minutes, period_hours), fetch=True, dict_cursor=True) or []
        trend_rows = {}
        for row in trend_rows_list:
            trend_rows.setdefault(row['device_ip'], []).append({
                "timestamp": row["ts"],
                "inbound_kbps": row["inbound_sum"],
                "outbound_kbps": row["outbound_sum"]
            })

        # Assemble
        dashboard = {}
        for row in perf_rows:
            ip = row["device_ip"]
            avg_data = avg_rows.get(ip) or {"avg_cpu": row["cpu_pct"], "avg_memory": row["memory_pct"]}
            dashboard[ip] = {
                "device_ip": ip,
                "cpu_pct": row["cpu_pct"],
                "memory_pct": row["memory_pct"],
                "uptime_seconds": row["uptime_seconds"],
                "avg_cpu": avg_data.get("avg_cpu"),
                "avg_memory": avg_data.get("avg_memory"),
                "total_inbound": traffic_rows.get(ip, {}).get("total_inbound", 0),
                "total_outbound": traffic_rows.get(ip, {}).get("total_outbound", 0),
                "total_errors": traffic_rows.get(ip, {}).get("total_errors", 0),
                "top_interfaces": iface_rows.get(ip, [])[:top_interfaces_limit],
                "traffic_trend": trend_rows.get(ip, [])
            }

        # Add devices that only exist in traffic_rows
        for ip in set(traffic_rows.keys()) - set(dashboard.keys()):
            dashboard[ip] = {
                "device_ip": ip,
                "cpu_pct": None,
                "memory_pct": None,
                "uptime_seconds": None,
                "avg_cpu": avg_rows.get(ip, {}).get("avg_cpu"),
                "avg_memory": avg_rows.get(ip, {}).get("avg_memory"),
                "total_inbound": traffic_rows[ip]["total_inbound"],
                "total_outbound": traffic_rows[ip]["total_outbound"],
                "total_errors": traffic_rows[ip]["total_errors"],
                "top_interfaces": iface_rows.get(ip, [])[:top_interfaces_limit],
                "traffic_trend": trend_rows.get(ip, [])
            }

        result = list(dashboard.values())

        if use_cache and redis_client:
            try:
                payload = json.dumps(jsonable_encoder(result), default=str)
                redis_client.setex(cache_key, CACHE_TTL, payload)
            except Exception:
                logger.exception("Failed to cache dashboard")

        return result

    except Exception as e:
        logger.exception("Error generating dashboard")
        raise HTTPException(status_code=500, detail=f"Error generating dashboard: {e}")
