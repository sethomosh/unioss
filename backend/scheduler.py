#!/usr/bin/env python3
import time
import logging
from backend.poller import poll_all_devices  # your existing poller function

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scheduler")

INTERVAL = 60  # seconds between polls

def main():
    logger.info("Starting SNMP poller scheduler...")
    while True:
        try:
            poll_all_devices()
        except Exception as e:
            logger.exception("Polling error: %s", e)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
