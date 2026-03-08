#!/usr/bin/env python3
import requests
import mysql.connector
from datetime import datetime
import os
import sys

# --- config ---
API_BASE = os.getenv("API_BASE", "http://localhost:5000")
PERF_ENDPOINT = os.getenv("PERF_ENDPOINT", "/performance/devices")
TRAFFIC_ENDPOINT = os.getenv("TRAFFIC_ENDPOINT", "/traffic/interfaces")

# --- db connection ---
db_config = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "port": int(os.getenv("MYSQL_PORT", 3306)),
    "database": os.getenv("MYSQL_DB", "unioss"),
    "user": os.getenv("MYSQL_USER", "unioss_user"),
    "password": os.getenv("MYSQL_PASSWORD", "StrongP@ssw0rd")
}

def fetch_latest_db(table, device_ip=None):
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)
    rows = []
    try:
        if table == "performance_metrics":
            cursor.execute("""
                SELECT device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp
                FROM performance_metrics
                WHERE timestamp = (
                    SELECT MAX(timestamp) FROM performance_metrics
                )
            """)
            rows = cursor.fetchall()
        elif table == "traffic_metrics":
            if device_ip:
                cursor.execute("""
                    SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, timestamp
                    FROM traffic_metrics
                    WHERE device_ip=%s
                    ORDER BY timestamp DESC LIMIT 1
                """, (device_ip,))
            else:
                cursor.execute("""
                    SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, timestamp
                    FROM traffic_metrics
                    ORDER BY timestamp DESC
                """)
            rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()
    return rows

def fetch_api(path):
    url = API_BASE.rstrip("/") + "/" + path.lstrip("/")
    try:
        resp = requests.get(url, timeout=5)
    except Exception as e:
        print(f"ERROR: API request to {url} failed: {e}")
        return None, None
    if resp.status_code != 200:
        print(f"API {url} returned status {resp.status_code}")
        # print a short body for diagnostics
        print(resp.text[:1000])
        return resp.status_code, None
    try:
        return 200, resp.json()
    except Exception as e:
        print(f"ERROR: Could not parse JSON from {url}: {e}")
        print(resp.text[:2000])
        return resp.status_code, None

def verify_performance():
    print("=== Performance Metrics Verification ===")
    status, api_rows = fetch_api(PERF_ENDPOINT)
    if status != 200 or api_rows is None:
        print(f"Skipping performance verification: API not available at {API_BASE + PERF_ENDPOINT} (status={status})")
        return
    db_rows = fetch_latest_db("performance_metrics")
    if not db_rows:
        print("No rows in performance_metrics table (DB).")
        return

    for db_row in db_rows:
        match = next((r for r in api_rows if r.get("ip") == db_row["device_ip"]), None)
        api_ts = match.get("last_updated") if match else "MISSING"
        print(f"Device {db_row['device_ip']}: DB ts={db_row['timestamp']}, API ts={api_ts}")

def verify_traffic():
    print("\n=== Traffic Metrics Verification ===")
    status, api_rows = fetch_api(TRAFFIC_ENDPOINT)
    if status != 200 or api_rows is None:
        print(f"Skipping traffic verification: API not available at {API_BASE + TRAFFIC_ENDPOINT} (status={status})")
        return
    db_rows = fetch_latest_db("traffic_metrics")
    if not db_rows:
        print("No rows in traffic_metrics table (DB).")
        return

    for db_row in db_rows:
        match = next(
            (r for r in api_rows if r.get("device_ip") == db_row["device_ip"] and r.get("if_descr") == db_row.get("interface_name")),
            None
        )
        api_in = match.get("inbound_kbps") if match else "MISSING"
        api_out = match.get("outbound_kbps") if match else "MISSING"
        print(f"Device {db_row['device_ip']} iface {db_row['interface_name']}: DB kbps={db_row['inbound_kbps']}/{db_row['outbound_kbps']}, API kbps={api_in}/{api_out}")

if __name__ == "__main__":
    verify_performance()
    verify_traffic()
