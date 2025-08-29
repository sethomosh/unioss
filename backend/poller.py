#!/usr/bin/env python3
import os
import time
import random
import logging
import asyncio
from datetime import datetime

from backend.utils.db import get_db_connection
from backend.modules.traffic import get_traffic_metrics
from backend.modules.performance import get_performance_metrics
from backend.db.traffic_dao import save_traffic_metrics

logger = logging.getLogger("unisys_poller")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


async def poll_device(device, fake=True):
    ip = device["ip"]
    device_id = device["id"]

    logger.info(f"Polling device {ip} (fake={fake})")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # get device interfaces
        cursor.execute("SELECT id, name, ifIndex FROM device_interfaces WHERE device_id=%s", (device_id,))
        interfaces = cursor.fetchall()

        traffic_rows = []

        if fake:
            # ---- DEMO MODE ----
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

            # fake performance metrics
            perf_row = {
                "device_ip": ip,
                "cpu_pct": round(random.uniform(5, 90), 1),
                "memory_pct": round(random.uniform(20, 95), 1),
                "uptime_secs": random.randint(1000, 1000000),
                "timestamp": datetime.utcnow(),
            }

        else:
            # ---- REAL SNMP MODE ----
            # get traffic metrics per interface
            try:
                metrics = await asyncio.to_thread(get_traffic_metrics, ip)
                # match each interface by ifIndex
                for iface in interfaces:
                    row = next((r for r in metrics if r["interface_index"] == iface["ifIndex"]), None)
                    if row:
                        row["interface_name"] = iface["name"]  # ensure DB name
                        traffic_rows.append(row)
            except Exception as e:
                logger.error(f"Traffic poll failed for {ip}: {e}")

            # get performance metrics
            perf_row = None
            try:
                perf_row = await asyncio.to_thread(get_performance_metrics, ip)
                if perf_row:
                    perf_row["timestamp"] = datetime.utcnow()
            except Exception as e:
                logger.error(f"Performance poll failed for {ip}: {e}")

        # save traffic metrics
        if traffic_rows:
            saved = save_traffic_metrics(traffic_rows)
            logger.info(f"Saved {saved} traffic rows for {ip}")

        # save performance metrics
        if perf_row:
            try:
                cursor.execute(
                    """
                    INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
                    VALUES (%s,%s,%s,%s,%s)
                    """,
                    (
                        perf_row["device_ip"],
                        perf_row["cpu_pct"],
                        perf_row["memory_pct"],
                        perf_row["uptime_secs"],
                        perf_row["timestamp"],
                    ),
                )
                conn.commit()
                logger.info(f"Saved performance metrics for {ip}")
            except Exception as e:
                logger.error(f"Failed to insert performance metrics for {ip}: {e}")

    except Exception as e:
        logger.error(f"Polling device {ip} failed: {e}")
    finally:
        cursor.close()
        conn.close()


async def poll_all_devices(fake=True):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ip FROM devices WHERE status='up'")
    devices = cursor.fetchall()
    cursor.close()
    conn.close()

    if not devices:
        logger.info("No devices marked 'up' to poll.")
        return

    # poll concurrently
    await asyncio.gather(*(poll_device(d, fake) for d in devices))


if __name__ == "__main__":
    env_mode = os.getenv("UNISYS_MODE", "fake").lower()

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--real", action="store_true", help="Run in real SNMP mode")
    args = parser.parse_args()

    fake_mode = not (args.real or env_mode == "real")
    logger.info(f"Poller starting in {'FAKE' if fake_mode else 'REAL'} mode")

    try:
        while True:
            asyncio.run(poll_all_devices(fake=fake_mode))
            time.sleep(30)
    except KeyboardInterrupt:
        logger.info("Poller stopped manually")
