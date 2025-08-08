# backend/modules/performance.py

from datetime import datetime
from backend.utils.snmp_client import snmp_get_bulk, snmp_get    # ← CHANGED: import fallback
from backend.utils.db import get_db_connection
import random
import logging

logger = logging.getLogger(__name__)

# — OIDs that exactly match your SNMP-Sim data files — #
CPU_IDLE_OID      = "1.3.6.1.4.1.2021.11.10.0"  # laLoad.1 (idle)        ← NEW
CPU_USER_OID      = "1.3.6.1.4.1.2021.11.11.0"  # laLoad.2 (user)
MEM_TOTAL_OID     = "1.3.6.1.4.1.2021.4.5.0"    # memTotal
MEM_AVAILABLE_OID = "1.3.6.1.4.1.2021.4.6.0"    # memAvail
UPTIME_TICKS_OID  = "1.3.6.1.2.1.1.3.0"         # sysUpTime

def safe_float(value, default=0.0):
    try:
        f = float(value)
        return f if not (f != f) else default  # NaN check: NaN != NaN is always True
    except Exception:
        return default




def get_performance_metrics():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT ip FROM devices")
    devices = cursor.fetchall()

    results = []
    for d in devices:
        ip = d["ip"]
        ts = datetime.utcnow().isoformat() + "Z"
        # initialize with demo/random values
        cpu_idle    = round(random.uniform(5.0, 80.0), 2)
        cpu_user    = round(random.uniform(5.0, 80.0), 2)
        mem_pct     = round(random.uniform(10.0, 90.0), 2)
        uptime_secs = random.randint(60, 86400)

        # ── Try a single bulk GET for all OIDs ───────────────────── #
        try:
            vals = snmp_get_bulk(
                "snmpsim", "public",
                [CPU_IDLE_OID, CPU_USER_OID, MEM_TOTAL_OID, MEM_AVAILABLE_OID, UPTIME_TICKS_OID],
                port=1161, timeout=3, retries=2
            )
            cpu_idle    = float(vals[CPU_IDLE_OID])
            cpu_user    = float(vals[CPU_USER_OID])
            total_mem   = float(vals[MEM_TOTAL_OID])
            avail_mem   = float(vals[MEM_AVAILABLE_OID])
            mem_pct     = round(((total_mem - avail_mem) / total_mem) * 100, 2) if total_mem > 0 else None
            uptime_secs = int(float(vals[UPTIME_TICKS_OID]) / 100)
        except Exception as bulk_err:
            logger.error(f"SNMP bulk error for {ip}: {bulk_err}")  # ← NEW: log bulk failure

            # ── Fallback to individual GETs so you still get partial data ── #
            try:
                cpu_idle = float(snmp_get("snmpsim", "public", CPU_IDLE_OID, port=1161))
            except Exception:
                cpu_idle = None
            try:
                cpu_user = float(snmp_get("snmpsim", "public", CPU_USER_OID, port=1161))
            except Exception:
                cpu_user = None
            try:
                total_mem = float(snmp_get("snmpsim", "public", MEM_TOTAL_OID, port=1161))
                avail_mem = float(snmp_get("snmpsim", "public", MEM_AVAILABLE_OID, port=1161))
                mem_pct   = round(((total_mem - avail_mem) / total_mem) * 100, 2) if total_mem > 0 else None
            except Exception:
                mem_pct = None
            try:
                uptime_secs = int(float(snmp_get("snmpsim", "public", UPTIME_TICKS_OID, port=1161)) / 100)
            except Exception:
                uptime_secs = None

        # ── Derive a single CPU-percent metric ──────────────────── #
        cpu_pct = (
            cpu_user if cpu_user is not None else
            (100 - cpu_idle if cpu_idle is not None else 0)  # fallback to 0
        )


        # ── Persist into MySQL ─────────────────────────────────── #
        try:
            cursor.execute(
                "INSERT INTO performance_metrics "
                "(device_ip, timestamp, cpu_pct, memory_pct, uptime_secs) "
                "VALUES (%s,%s,%s,%s,%s)",
                (
                    ip,
                    ts.replace("T", " ").rstrip("Z"),  # MySQL DATETIME
                    safe_float(cpu_pct, 0.0),
                    safe_float(mem_pct, 0.0),
                    int(uptime_secs or 0)
                )
            )

        except Exception as e:
            logger.error(f"Failed to insert performance_metrics for {ip} at {ts}: {e}")

        # ── Build API response ──────────────────────────────────── #
        results.append({
            "ip":           ip,
            "cpu":          cpu_pct,
            "memory":       mem_pct,
            "uptime":       str(uptime_secs) if uptime_secs is not None else None,
            "last_updated": ts
        })

    conn.commit()
    cursor.close()
    conn.close()
    return results
