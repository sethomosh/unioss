# backend/scripts/init_traffic_polling.py

import time
from modules.traffic import poll_traffic

if __name__ == "__main__":
    while True:
        poll_traffic()
        time.sleep(30)  # adjust as needed
