#!/usr/bin/env python3
import os
import time
import random
import logging
import asyncio
import math
from decimal import Decimal
from datetime import datetime as _dt
from datetime import datetime
from typing import Dict, Any, List, Optional

from backend.utils.db import get_db_connection
from backend.modules.traffic import get_traffic_metrics
from backend.modules.performance import get_performance_metrics
from backend.db.traffic_dao import save_traffic_metrics

logger = logging.getLogger("unisys_poller")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# CHANGED: concurrency and poll interval via env
MAX_CONCURRENT_POLLS = int(os.getenv("UNISYS_MAX_CONCURRENT_POLLS", "20"))
POLL_INTERVAL_SECONDS = int(os.getenv("UNISYS_POLL_INTERVAL", "30"))

# Optional: backfill missing performance rows for 'up' devices when poller starts.
# Set UNISYS_BACKFILL_ON_START=true to enable (manual opt-in; safe)
BACKFILL_ON_START = os.getenv("UNISYS_BACKFILL_ON_START", "false").lower() in ("1", "true", "yes")

_poll_semaphore: Optional[asyncio.Semaphore] = None

def _get_semaphore() -> asyncio.Semaphore:
    global _poll_semaphore
    if _poll_semaphore is None:
        _poll_semaphore = asyncio.Semaphore(MAX_CONCURRENT_POLLS)
    return _poll_semaphore


def _to_finite_float(val, default=0.0) -> float:
    """Normalize to float; handle Decimal, str, None, NaN, inf -> default."""
    if val is None:
        return float(default)
    try:
        if isinstance(val, Decimal):
            v = float(val)
        else:
            v = float(val)
    except Exception:
        return float(default)
    return float(v) if math.isfinite(v) else float(default)

def _to_int(val, default=0) -> int:
    """Normalize to int; handle str, float, None -> default."""
    if val is None:
        return int(default)
    try:
        return int(val)
    except Exception:
        try:
            return int(float(val))
        except Exception:
            return int(default)


def save_performance_metrics_row(row: Dict[str, Any]) -> bool:
    """
    Save a single performance metric row. Defensive: coerce numeric fields to primitives
    so that DB never receives NULL for cpu_pct / memory_pct / uptime_seconds.
    Returns True on success, False otherwise.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # normalize device ip
        device_ip = str(row.get("device_ip") or row.get("ip") or "")

        # Accept either cpu_pct or cpu; memory_pct or memory / mem; uptime_seconds or uptime/u
        cpu_raw = row.get("cpu_pct", row.get("cpu", None))
        mem_raw = row.get("memory_pct", row.get("memory", row.get("mem", None)))
        uptime_raw = row.get("uptime_seconds", row.get("uptime", row.get("uptime_secs", None)))

        cpu_safe = _to_finite_float(cpu_raw, default=0.0)
        mem_safe = _to_finite_float(mem_raw, default=0.0)
        uptime_safe = _to_int(uptime_raw, default=0)

        # timestamp handling: accept datetime or ISO str or fallback to now
        ts = row.get("timestamp") or row.get("time") or None
        ts_val = None
        if isinstance(ts, _dt):
            ts_val = ts
        elif isinstance(ts, str) and ts:
            try:
                # Python fromisoformat handles many ISO styles; fallback to now on parse fail
                ts_val = _dt.fromisoformat(ts)
            except Exception:
                ts_val = None

        if ts_val is None:
            ts_val = _dt.utcnow()

        cursor.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (device_ip, cpu_safe, mem_safe, uptime_safe, ts_val),
        )
        conn.commit()
        return True
    except Exception as e:
        logger.exception("Failed to insert performance metrics for %s: %s", row.get("device_ip"), e)
        if conn:
            try:
                conn.rollback()
            except Exception:
                logger.exception("rollback failed")
        return False
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                logger.exception("Failed to close cursor")
        if conn:
            try:
                conn.close()
            except Exception:
                logger.exception("Failed to close connection")

async def poll_all_devices(fake: bool = True):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ip FROM devices WHERE status='up'")
    devices = cursor.fetchall()
    cursor.close()
    conn.close()

    if not devices:
        logger.info("No devices marked 'up' to poll.")
        return

    # spawn tasks concurrently but semaphore limits active concurrency
    tasks = [asyncio.create_task(poll_device(d, fake)) for d in devices]
    await asyncio.gather(*tasks)


async def poll_loop(fake: bool = True, interval: int = POLL_INTERVAL_SECONDS):
    logger.info("Starting poll loop (interval=%s seconds)", interval)
    # Optional backfill at startup (manual opt-in via env var)
    if BACKFILL_ON_START:
        try:
            backfilled = backfill_missing_performance_rows()
            logger.info("Backfilled %s missing performance rows at startup", backfilled)
        except Exception:
            logger.exception("Backfill failed")

    while True:
        start = time.time()
        try:
            await poll_all_devices(fake=fake)
        except Exception:
            logger.exception("poll_all_devices raised an exception")
        elapsed = time.time() - start
        to_sleep = max(0, interval - elapsed)
        await asyncio.sleep(to_sleep)


def backfill_missing_performance_rows() -> int:
    """
    Optional helper to insert a single synthetic performance row for each 'up' device
    that currently has no performance_metrics rows. This is opt-in via env var.
    It uses deterministic-ish values so the dashboard shows something.
    Returns the number of inserted rows.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    # INSERT one row per up device that currently lacks any row in performance_metrics
    # NOTE: uses MySQL functions RAND() etc. This is intentionally simple and safe.
    cur.execute("""
        INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
        SELECT d.ip,
               ROUND(10 + (RAND() * 60), 1),
               ROUND(30 + (RAND() * 60), 1),
               3600,
               NOW()
        FROM devices d
        LEFT JOIN (
            SELECT DISTINCT device_ip FROM performance_metrics
        ) pm ON d.ip = pm.device_ip
        WHERE pm.device_ip IS NULL AND d.status = 'up'
    """)
    affected = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return affected


if __name__ == "__main__":
    env_mode = os.getenv("UNISYS_MODE", "fake").lower()

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--real", action="store_true", help="Run in real SNMP mode")
    parser.add_argument("--interval", type=int, help="Poll interval seconds")
    args = parser.parse_args()

    fake_mode = not (args.real or env_mode == "real")
    if args.interval:
        POLL_INTERVAL_SECONDS = args.interval

    logger.info(f"Poller starting in {'FAKE' if fake_mode else 'REAL'} mode; concurrency={MAX_CONCURRENT_POLLS}")

    try:
        asyncio.run(poll_loop(fake=fake_mode, interval=POLL_INTERVAL_SECONDS))
    except KeyboardInterrupt:
        logger.info("Poller stopped manually")
