#!/usr/bin/env python3
import logging
from backend.utils.db import get_db_connection
from backend.modules.traffic import get_traffic_metrics
from backend.modules.performance import get_performance_metrics

logger = logging.getLogger("unisys_poller")

def poll_all_devices():
    """
    Poll all devices marked 'up' in DB, store traffic (kbps) and performance metrics.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT ip, snmp_community FROM devices WHERE status='up'")
    devices = cursor.fetchall()

    for device in devices:
        ip = device["ip"]
        community = device.get("snmp_community", "public")
        try:
            # traffic
            traffic_rows = get_traffic_metrics(ip, community)
            cur2 = conn.cursor()
            for row in traffic_rows:
                cur2.execute(
                    """
                    INSERT INTO traffic_metrics
                    (device_ip, if_index, iface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, FROM_UNIXTIME(%s))
                    """,
                    (
                        row["device_ip"],
                        row["if_index"],
                        row["if_descr"],
                        row.get("in_bps", 0),
                        row.get("out_bps", 0),
                        row.get("in_errors", 0),
                        row.get("out_errors", 0),
                        row["last_updated"],
                    ),
                )
            cur2.close()

            # performance
            perf_row = get_performance_metrics(ip)
            # get_performance_metrics already inserts into DB

            logger.info(f"Polled {ip}: {len(traffic_rows)} interfaces, performance recorded")
        except Exception as e:
            logger.error(f"Failed polling {ip}: {e}")

    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":
    poll_all_devices()
