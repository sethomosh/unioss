# scripts/run_one_poll.py
import os, asyncio, sys
sys.path.insert(0, os.getcwd())

from backend.poller import poll_device   # adjust import path if file named differently

async def main():
    device = {"id": 1, "ip": "127.0.0.1", "vendor": "ubiquiti", "vendor_key":"ubiquiti"}
    await poll_device(device, fake=False)

if __name__ == "__main__":
    asyncio.run(main())
