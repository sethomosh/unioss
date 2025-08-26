#!/usr/bin/env python3
import logging
import random
import time
from backend.utils.db import get_db_connection
from backend.modules.traffic import get_traffic_metrics
from backend.modules.performance import get_performance_metrics

logger = logging.getLogger("unisys_poller")

def poll_all_devices(fake=True):
    """
    Poll all devices marked 'up' in DB.
    If fake=True, generate random traffic/performance metrics for demo purposes.
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
            # generate fake traffic metrics per interface
            cursor.execute("SELECT id, name FROM device_interfaces WHERE device_id=%s", (device_id,))
            interfaces = cursor.fetchall()

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
                    (
                        ip,
                        iface["name"],
                        in_kbps,
                        out_kbps,
                        in_err,
                        out_err,
                        in_err + out_err,
                        timestamp,
                    ),
                )

            # generate fake performance metrics
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

            logger.info(f"Demo polled {ip}: {len(interfaces)} interfaces, perf recorded")

        except Exception as e:
            logger.error(f"Failed demo polling {ip}: {e}")

    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":
    poll_all_devices()