#!/usr/bin/env python3
import logging
import time
from backend.utils.snmp_client import snmp_get
from backend.utils.db import get_db_connection

logger = logging.getLogger("performance")

def get_performance_metrics(device_ip: str):
    """
    Poll a single device for performance metrics and insert into DB.
    Returns the inserted row as a dict (or None if failed).
    """
    try:
        cpu_oid = "1.3.6.1.4.1.2021.11.9.0"   # CPU load %
        mem_oid = "1.3.6.1.4.1.2021.4.6.0"   # Memory %
        uptime_oid = "1.3.6.1.2.1.1.3.0"     # SysUpTime

        cpu = snmp_get(device_ip, cpu_oid)
        mem = snmp_get(device_ip, mem_oid)
        uptime = snmp_get(device_ip, uptime_oid)

        def safe_cast(val, cast, default=None):
            try:
                return cast(val)
            except Exception:
                return default

        row = {
            "device_ip": device_ip,
            "cpu_pct": safe_cast(cpu, float),
            "memory_pct": safe_cast(mem, float),
            "uptime_secs": safe_cast(uptime, int),
        }

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_secs)
            VALUES (%s, %s, %s, %s)
            """,
            (row["device_ip"], row["cpu_pct"], row["memory_pct"], row["uptime_secs"]),
        )
        conn.commit()
        cur.close()
        conn.close()

        logger.debug("Inserted metrics for %s: %s", device_ip, row)
        return row

    except Exception as e:
        logger.exception("Failed to get metrics for %s: %s", device_ip, str(e))
        return None
