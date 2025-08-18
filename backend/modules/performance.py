# backend/modules/performance.py
from datetime import datetime
from backend.utils.snmp_client import snmp_get_bulk, snmp_get
from backend.utils.db import get_db_connection
import logging
import traceback
import os

logger = logging.getLogger(__name__)

# OIDs matching SNMP-Sim or actual device MIBs
CPU_IDLE_OID      = "1.3.6.1.4.1.2021.11.10.0"  # CPU idle %
CPU_USER_OID      = "1.3.6.1.4.1.2021.11.11.0"  # CPU user %
MEM_TOTAL_OID     = "1.3.6.1.4.1.2021.4.5.0"    # Total memory (kB)
MEM_AVAILABLE_OID = "1.3.6.1.4.1.2021.4.6.0"    # Available memory (kB)
UPTIME_TICKS_OID  = "1.3.6.1.2.1.1.3.0"         # Uptime in hundredths of a second

def safe_float(value, default=None):
    """Convert to float safely, handling NaN and invalid values."""
    try:
        f = float(value)
        # avoid NaN
        if f != f:
            return default
        return f
    except Exception:
        return default

def _find_key_and_val(vals: dict, oid: str):
    """
    Robust lookup: exact match, longest suffix match, then last token fallback.
    Returns (key, val) or (None, None) if not found.
    """
    if not vals:
        return None, None
    if oid in vals:
        return oid, vals[oid]
    oid_parts = oid.split('.')
    for n in range(len(oid_parts), 0, -1):
        suffix = '.'.join(oid_parts[-n:])
        for k, v in vals.items():
            if k.endswith(suffix):
                return k, v
    last_token = oid_parts[-1]
    for k, v in vals.items():
        if k.endswith(last_token):
            return k, v
    return None, None

def get_performance_metrics():
    """
    Poll devices, compute metrics, persist to DB and return results.
    Ensures non-null values for columns declared NOT NULL in schema.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT ip FROM devices")
    devices = cursor.fetchall()

    results = []
    bulk_target = os.getenv("SNMP_TARGET", None)
    snmp_port = int(os.getenv("SNMP_PORT", 1161))

    for d in devices:
        ip = d["ip"]
        ts = datetime.utcnow().isoformat() + "Z"

        cpu_idle = cpu_user = mem_pct = uptime_secs = None
        total_mem = avail_mem = None
        cpu_idle_raw = cpu_user_raw = total_mem_raw = avail_mem_raw = uptime_ticks_raw = None

        bulk_host = bulk_target or ip
        community = (ip if bulk_target else "public")

        try:
            vals = snmp_get_bulk(
                bulk_host,
                community,
                [CPU_IDLE_OID, CPU_USER_OID, MEM_TOTAL_OID, MEM_AVAILABLE_OID, UPTIME_TICKS_OID],
                port=snmp_port,
                timeout=2,
                retries=2
            )
            logger.debug("snmp_get_bulk returned keys: %s", list(vals.keys()))

            _, cpu_idle_raw = _find_key_and_val(vals, CPU_IDLE_OID)
            _, cpu_user_raw = _find_key_and_val(vals, CPU_USER_OID)
            _, total_mem_raw = _find_key_and_val(vals, MEM_TOTAL_OID)
            _, avail_mem_raw = _find_key_and_val(vals, MEM_AVAILABLE_OID)
            _, uptime_ticks_raw = _find_key_and_val(vals, UPTIME_TICKS_OID)

            cpu_idle = safe_float(cpu_idle_raw)
            cpu_user = safe_float(cpu_user_raw)
            total_mem = safe_float(total_mem_raw)
            avail_mem = safe_float(avail_mem_raw)
            uptime_ticks = safe_float(uptime_ticks_raw)

            if total_mem is not None and avail_mem is not None and total_mem > 0:
                mem_pct = round(((total_mem - avail_mem) / total_mem) * 100, 2)
            if uptime_ticks is not None:
                uptime_secs = float(uptime_ticks / 100)

        except Exception as bulk_err:
            logger.warning("SNMP bulk error for %s (host=%s community=%s): %s", ip, bulk_host, community, bulk_err)
            try:
                cpu_idle = safe_float(snmp_get(ip, community, CPU_IDLE_OID, port=snmp_port))
            except Exception:
                cpu_idle = None
            try:
                cpu_user = safe_float(snmp_get(ip, community, CPU_USER_OID, port=snmp_port))
            except Exception:
                cpu_user = None
            try:
                total_mem = safe_float(snmp_get(ip, community, MEM_TOTAL_OID, port=snmp_port))
                avail_mem = safe_float(snmp_get(ip, community, MEM_AVAILABLE_OID, port=snmp_port))
                if total_mem is not None and avail_mem is not None and total_mem > 0:
                    mem_pct = round(((total_mem - avail_mem) / total_mem) * 100, 2)
            except Exception:
                mem_pct = None
            try:
                uptime_ticks = safe_float(snmp_get(ip, community, UPTIME_TICKS_OID, port=snmp_port))
                uptime_secs = float(uptime_ticks / 100) if uptime_ticks is not None else None
            except Exception:
                uptime_secs = None

        cpu_pct = (cpu_user if cpu_user is not None else (100 - cpu_idle if cpu_idle is not None else None))

        logger.debug(
            "INSERT DEBUG for %s (community=%s): raw(cpu_user_raw=%r, cpu_idle_raw=%r, total_mem_raw=%r, avail_mem_raw=%r, uptime_ticks_raw=%r) -> computed(uptime_secs=%r, cpu_pct=%r, mem_pct=%r)",
            ip, community,
            cpu_user_raw, cpu_idle_raw, total_mem_raw, avail_mem_raw, uptime_ticks_raw,
            uptime_secs, cpu_pct, mem_pct
        )

        # Ensure we do not insert explicit NULL into NOT NULL DB columns
        cpu_val = safe_float(cpu_pct, 0.0)
        mem_val = safe_float(mem_pct, 0.0)
        uptime_val = float(uptime_secs) if uptime_secs is not None else None

        try:
            cursor.execute(
                "INSERT INTO performance_metrics "
                "(device_ip, timestamp, cpu_pct, memory_pct, uptime_seconds) "
                "VALUES (%s,%s,%s,%s,%s)",
                (
                    ip,
                    ts.replace("T", " ").rstrip("Z"),
                    cpu_val,
                    mem_val,
                    uptime_val
                )
            )
        except Exception as e:
            logger.error("Failed to insert performance_metrics for %s at %s: %s", ip, ts, e)

        logger.debug("Device %s -> cpu=%s memory=%s uptime=%s", ip, cpu_val, mem_val, uptime_val)

        results.append({
            "device_ip": ip,
            "cpu_pct": cpu_val,
            "memory_pct": mem_val,
            "uptime_secs": uptime_val,
            "last_updated": ts
        })

    conn.commit()
    cursor.close()
    conn.close()
    return results
