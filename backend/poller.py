#!/usr/bin/env python3
import os
import time
import random
import logging
import asyncio
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


def save_performance_metrics_row(row: Dict[str, Any]) -> bool:
    """
    Save a single performance metric row. Uses get_db_connection (same as rest of codebase).
    Returns True on success, False otherwise.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
            VALUES (%s,%s,%s,%s,%s)
            """,
            (
                row.get("device_ip"),
                row.get("cpu_pct"),
                row.get("memory_pct"),
                row.get("uptime_seconds"),          # FIXED: use uptime_seconds (matches DB)
                row.get("timestamp") or datetime.utcnow(),
            ),
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


async def poll_device(device: Dict[str, Any], fake: bool = True):
    ip = device["ip"]
    device_id = device.get("id")

    sem = _get_semaphore()
    async with sem:
        logger.info(f"Polling device {ip} (fake={fake})")

        conn = None
        cursor = None

        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT id, name, ifIndex FROM device_interfaces WHERE device_id=%s", (device_id,))
            interfaces = cursor.fetchall()

            traffic_rows: List[Dict[str, Any]] = []

            if fake:
                # DEMO MODE: still create a perf row even if there are no interfaces
                for iface in interfaces:
                    in_kbps = round(random.uniform(10, 500), 2)
                    out_kbps = round(random.uniform(10, 500), 2)
                    in_err = random.randint(0, 5)
                    out_err = random.randint(0, 5)

                    traffic_rows.append({
                        "device_ip": ip,
                        "interface_index": iface["ifIndex"],
                        "interface_name": iface["name"],
                        "inbound_kbps": in_kbps,
                        "outbound_kbps": out_kbps,
                        "in_errors": in_err,
                        "out_errors": out_err,
                        "errors": in_err + out_err,
                        "timestamp": datetime.utcnow(),
                    })

                # FIXED: key name matches DB/other code
                perf_row = {
                    "device_ip": ip,
                    "cpu_pct": round(random.uniform(5, 90), 1),
                    "memory_pct": round(random.uniform(20, 95), 1),
                    "uptime_seconds": random.randint(1000, 1000000),
                    "timestamp": datetime.utcnow(),
                }

            else:
                # REAL SNMP MODE (offload to a thread so we don't block the loop)
                try:
                    metrics = await asyncio.to_thread(get_traffic_metrics, ip)
                    for iface in interfaces:
                        row = next((r for r in metrics if r.get("interface_index") == iface.get("ifIndex")), None)
                        if row:
                            row["interface_name"] = iface["name"]
                            traffic_rows.append(row)
                except Exception as e:
                    logger.exception("Traffic poll failed for %s: %s", ip, e)

                perf_row = None
                try:
                    perf_row = await asyncio.to_thread(get_performance_metrics, ip)
                    if perf_row:
                        # ensure keys match what save_performance_metrics_row expects
                        perf_row.setdefault("device_ip", ip)
                        # if the returned perf_row uses a different key name, normalize it here:
                        if "uptime_secs" in perf_row and "uptime_seconds" not in perf_row:
                            perf_row["uptime_seconds"] = perf_row.pop("uptime_secs")
                        perf_row.setdefault("timestamp", datetime.utcnow())
                except Exception as e:
                    logger.exception("Performance poll failed for %s: %s", ip, e)

            # save traffic metrics
            if traffic_rows:
                try:
                    saved = save_traffic_metrics(traffic_rows)
                    logger.info(f"Saved {saved} traffic rows for {ip}")
                except Exception:
                    logger.exception("Failed to save traffic rows for %s", ip)

            # save performance metrics
            if perf_row:
                ok = await asyncio.to_thread(save_performance_metrics_row, perf_row)
                if ok:
                    logger.info(f"Saved performance metrics for {ip}")
                else:
                    logger.error(f"Failed to save performance metrics for {ip}")

        except Exception as e:
            logger.exception("Polling device %s failed: %s", ip, e)
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
