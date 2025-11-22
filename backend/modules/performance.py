#!/usr/bin/env python3
import logging
from datetime import datetime
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("performance")


@router.get("/{device_ip}")
def read_performance(device_ip: str):
    """
    API endpoint: immediately polls a device once and returns the stored row.
    """
    return get_performance_metrics(device_ip)


def _safe_cast(val, cast, default=None):
    try:
        if val is None:
            return default
        return cast(val)
    except Exception:
        return default


def get_performance_metrics(device_ip: str):
    """
    Poll a single device for performance metrics and insert into DB.
    Returns the inserted row as a dict (or None if failed).
    """
    try:
        # CPU OIDs (progressive fallback)
        cpu_oids = [
            "1.3.6.1.4.1.2021.11.10.0",  # laLoad.1  (our snmpsim has this)
            "1.3.6.1.4.1.2021.11.11.0",  # laLoad.2
            "1.3.6.1.4.1.2021.11.9.0",   # older fallback
        ]

        # UCD memory OIDs
        mem_total_oid = "1.3.6.1.4.1.2021.4.5.0"   # memTotalReal (KB)
        mem_avail_oid = "1.3.6.1.4.1.2021.4.6.0"   # memAvailReal (KB)

        # Uptime OID
        uptime_oid = "1.3.6.1.2.1.1.3.0"  # TimeTicks

        # --------------------------
        # CPU
        # --------------------------
        cpu = None
        for oid in cpu_oids:
            try:
                cpu_val = snmp_get(device_ip, oid)
            except Exception:
                cpu_val = None

            if cpu_val is not None:
                cpu = _safe_cast(cpu_val, float, None)
                break

        # --------------------------
        # Memory
        # --------------------------
        try:
            mem_total = snmp_get(device_ip, mem_total_oid)
        except Exception:
            mem_total = None

        try:
            mem_avail = snmp_get(device_ip, mem_avail_oid)
        except Exception:
            mem_avail = None

        mem_total_kb = _safe_cast(mem_total, int, None)
        mem_avail_kb = _safe_cast(mem_avail, int, None)

        if mem_total_kb is not None and mem_avail_kb is not None and mem_total_kb > 0:
            used_kb = max(0, mem_total_kb - mem_avail_kb)
            memory_pct_value = round((used_kb / mem_total_kb) * 100.0, 1)
        elif mem_avail_kb is not None:
            # fallback: store as-is (KB); discovery will later clamp
            memory_pct_value = float(mem_avail_kb)
        elif mem_total_kb is not None:
            memory_pct_value = float(mem_total_kb)
        else:
            memory_pct_value = 0.0

        # --------------------------
        # Uptime (TimeTicks -> seconds)
        # --------------------------
        try:
            uptime_ticks = snmp_get(device_ip, uptime_oid)
        except Exception:
            uptime_ticks = None

        uptime_ticks = _safe_cast(uptime_ticks, int, None)
        uptime_seconds_value = int(uptime_ticks / 100) if uptime_ticks is not None else 0

        # --------------------------
        # Prepare row for DB
        # --------------------------
        cpu_pct_value = 0.0 if cpu is None else float(cpu)

        row = {
            "device_ip": device_ip,
            "cpu_pct": cpu_pct_value,
            "memory_pct": memory_pct_value,
            "uptime_seconds": uptime_seconds_value,
        }

        # --------------------------
        # Insert into DB
        # --------------------------
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                row["device_ip"],
                row["cpu_pct"],
                row["memory_pct"],
                row["uptime_seconds"],
                datetime.utcnow(),
            ),
        )

        conn.commit()
        cur.close()
        conn.close()

        logger.debug("Inserted metrics for %s: %s", device_ip, row)
        return row

    except Exception as e:
        logger.exception("Failed to get metrics for %s: %s", device_ip, str(e))
        return None
