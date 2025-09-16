#!/usr/bin/env python3
import logging
from datetime import datetime
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger("performance")


@router.get("/performance/{device_ip}")
def read_performance(device_ip: str):
    return get_performance_metrics(device_ip)


def get_performance_metrics(device_ip: str):
    """
    Poll a single device for performance metrics and insert into DB.
    Returns the inserted row as a dict (or None if failed).
    """
    try:
        # Pick the CPU OID that matches your snmpsim files (laLoad.1 / laLoad.2 exist)
        cpu_oids = [
            "1.3.6.1.4.1.2021.11.10.0",  # laLoad.1 - present in public.snmprec
            "1.3.6.1.4.1.2021.11.11.0",  # laLoad.2 - fallback
            "1.3.6.1.4.1.2021.11.9.0",   # older attempted OID - fallback
        ]
        mem_oid = "1.3.6.1.4.1.2021.4.6.0"   # available memory in KB (your snmpsim)
        uptime_oid = "1.3.6.1.2.1.1.3.0"     # SysUpTime (TimeTicks: hundredths of a second)

        def safe_cast(val, cast, default=None):
            try:
                if val is None:
                    return default
                return cast(val)
            except Exception:
                return default

        # Try CPU OIDs in order until we get a non-None value
        cpu = None
        for oid in cpu_oids:
            cpu_val = snmp_get(device_ip, oid)
            if cpu_val is not None:
                cpu = safe_cast(cpu_val, float, None)
                break

        # Memory
        mem = snmp_get(device_ip, mem_oid)

        # Uptime: SNMP timeticks are hundredths of a second -> convert to seconds
        uptime_ticks = snmp_get(device_ip, uptime_oid)
        uptime_seconds = None
        if uptime_ticks is not None:
            t = safe_cast(uptime_ticks, int, None)
            if t is not None:
                uptime_seconds = int(t / 100)

        # Ensure numeric values (do not return None to avoid response validation errors)
        cpu_pct_val = 0.0 if cpu is None else float(cpu)
        memory_pct_val = 0.0 if mem is None else safe_cast(mem, float, 0.0)
        uptime_seconds_val = 0 if uptime_seconds is None else int(uptime_seconds)

        row = {
            "device_ip": device_ip,
            "cpu_pct": cpu_pct_val,
            "memory_pct": memory_pct_val,
            "uptime_seconds": uptime_seconds_val,
        }

        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (row["device_ip"], row["cpu_pct"], row["memory_pct"], row["uptime_seconds"], datetime.utcnow()),
        )
        conn.commit()
        cur.close()
        conn.close()

        logger.debug("Inserted metrics for %s: %s", device_ip, row)
        return row

    except Exception as e:
        logger.exception("Failed to get metrics for %s: %s", device_ip, str(e))
        return None