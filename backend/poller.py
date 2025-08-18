#!/usr/bin/env python3
import time
import os
import logging
from backend.modules.performance import get_performance_metrics

logging.basicConfig(level=logging.DEBUG)  # switched to DEBUG for more details
logger = logging.getLogger("poller")

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "60"))  # seconds

def run():
    logger.info("Starting poller; interval=%ss", POLL_INTERVAL)
    while True:
        try:
            rows = get_performance_metrics()
            logger.info("Polled %d devices", len(rows))

            # Detailed debug output for each device row (use keys returned by get_performance_metrics)
            for row in rows:
                logger.debug(
                    "INSERT DEBUG - IP: %s, CPU: %s, MEM: %s, UPTIME: %s, LAST_UPDATED: %s",
                    row.get("device_ip"),
                    row.get("cpu_pct"),
                    row.get("memory_pct"),
                    row.get("uptime_secs"),
                    row.get("last_updated"),
                )

        except Exception:
            logger.exception("Poller error")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    run()
