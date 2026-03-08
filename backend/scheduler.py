#!/usr/bin/env python3
import os
import time
import asyncio
import logging
from backend.poller import poll_all_devices

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("unioss_scheduler")

INTERVAL = int(os.getenv("POLL_INTERVAL", "60"))  # seconds between polls
ENV_MODE = os.getenv("UNIOSS_MODE", "fake").lower()
FAKE_MODE = ENV_MODE != "real"

async def scheduler_loop():
    while True:
        try:
            logger.info(f"Starting poll cycle (fake={FAKE_MODE})")
            await poll_all_devices(fake=FAKE_MODE)
            logger.info(f"Poll cycle completed, sleeping {INTERVAL} seconds")
        except Exception as e:
            logger.exception(f"Polling error: {e}")
        await asyncio.sleep(INTERVAL)

def main():
    try:
        logger.info("Starting SNMP poller scheduler...")
        asyncio.run(scheduler_loop())
    except KeyboardInterrupt:
        logger.info("Scheduler stopped manually")
    except Exception as e:
        logger.exception(f"Scheduler encountered an error: {e}")

if __name__ == "__main__":
    main()
