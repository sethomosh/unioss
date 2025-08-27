#!/usr/bin/env python3
import logging
import random
import time
import os
import argparse

from backend.utils.db import get_db_connection
from backend.modules.traffic import get_traffic_metrics
from backend.modules.performance import get_performance_metrics

logger = logging.getLogger("unisys_poller")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def poll_all_devices(fake=True):
    """
    Poll all devices marked 'up' in DB.
    - if fake=True → generate random metrics for demo
    - if fake=False → use SNMP modules (traffic + performance)
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ip FROM devices WHERE status='up'")
    devices = cursor.fetchall()

    timestamp = int(time.time())

    for device in devices:
        device_id = device["id"]
        ip = device["ip"]
        try:
            # get interfaces for this device
            cursor.execute("SELECT id, name, ifIndex FROM device_interfaces WHERE device_id=%s", (device_id,))
            interfaces = cursor.fetchall()

            if fake:
                # ---- DEMO MODE ----
                for iface in interfaces:
                    in_kbps = round(random.uniform(10, 500), 2)
                    out_kbps = round(random.uniform(10, 500), 2)
                    in_err = random.randint(0, 5)
                    out_err = random.randint(0, 5)

                    cursor.execute(
                        """
                        INSERT INTO traffic_metrics
                        (device_ip, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, FROM_UNIXTIME(%s))
                        """,
                        (ip, iface["name"], in_kbps, out_kbps, in_err, out_err, in_err + out_err, timestamp),
                    )

                cpu = round(random.uniform(5, 90), 1)
                memory = round(random.uniform(20, 95), 1)
                uptime = random.randint(1000, 1000000)

                cursor.execute(
                    """
                    INSERT INTO performance_metrics
                    (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
                    VALUES (%s, %s, %s, %s, FROM_UNIXTIME(%s))
                    """,
                    (ip, cpu, memory, uptime, timestamp),
                )

                logger.info(f"[FAKE] polled {ip}: {len(interfaces)} ifaces, perf recorded")

            else:
                # ---- REAL SNMP MODE ----
                # traffic per interface
                for iface in interfaces:
                    metrics = get_traffic_metrics(ip, iface["ifIndex"])
                    if metrics:
                        cursor.execute(
                            """
                            INSERT INTO traffic_metrics
                            (device_ip, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, FROM_UNIXTIME(%s))
                            """,
                            (
                                ip,
                                iface["name"],
                                metrics["in_kbps"],
                                metrics["out_kbps"],
                                metrics["in_err"],
                                metrics["out_err"],
                                metrics["in_err"] + metrics["out_err"],
                                timestamp,
                            ),
                        )

                # performance metrics
                perf = get_performance_metrics(ip)
                if perf:
                    cursor.execute(
                        """
                        INSERT INTO performance_metrics
                        (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
                        VALUES (%s, %s, %s, %s, FROM_UNIXTIME(%s))
                        """,
                        (ip, perf["cpu_pct"], perf["memory_pct"], perf["uptime_seconds"], timestamp),
                    )

                logger.info(f"[REAL] polled {ip}: {len(interfaces)} ifaces, perf recorded")

        except Exception as e:
            logger.error(f"Polling failed for {ip}: {e}")

    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":
    # option 1: env var
    env_mode = os.getenv("UNISYS_MODE", "fake").lower()

    # option 2: cli flag
    parser = argparse.ArgumentParser()
    parser.add_argument("--real", action="store_true", help="Run in real SNMP mode")
    args = parser.parse_args()

    # precedence: cli flag > env var
    fake_mode = not (args.real or env_mode == "real")

    logger.info(f"Poller starting in {'FAKE' if fake_mode else 'REAL'} mode")
    poll_all_devices(fake=fake_mode)
