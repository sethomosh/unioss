#!/usr/bin/env python3
import time
import logging
from backend.modules.traffic import get_traffic_metrics
from backend.db.traffic_dao import save_traffic_metrics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("init_traffic_polling")

# configure your devices here
DEVICES = [
    {"ip": "127.0.0.1", "community": "public", "version": "2c", "port": 161},
    # add more devices as needed
]

POLL_INTERVAL = 5  # seconds

def main():
    logger.info("Starting traffic polling...")
    try:
        while True:
            for dev in DEVICES:
                ip = dev["ip"]
                try:
                    rows = get_traffic_metrics(
                        device_ip=ip,
                        community=dev.get("community", "public"),
                        version=dev.get("version", "2c"),
                        port=dev.get("port", 161)
                    )
                    if rows:
                        count = save_traffic_metrics(rows)
                        logger.info("Inserted %d rows for device %s", count, ip)
                    else:
                        logger.info("No traffic metrics for device %s", ip)
                except Exception as e:
                    logger.exception("Error polling device %s: %s", ip, e)
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("Polling stopped by user")

if __name__ == "__main__":
    main()
