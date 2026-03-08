import os
import sys
import mysql.connector
import random

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.utils.db import get_db_connection

NAMES = [
    "Silas", "George", "Diana", "Nina", "Dave", "Rimon", "Alpha", "Leo", 
    "Sarah", "Elena", "Marcus", "Chloe", "Felix", "Zoe", "Victor", "Luna",
    "Oscar", "Mia", "Ivan", "Eva", "Karl", "Sara", "Hugo", "Yara",
    "Liam", "Noah", "Emma", "Olivia", "James", "Ava", "Logan", "Sophia",
    "Max", "Ruby", "Finn", "Maya", "Otis", "Iris", "Ezra", "Aria"
]

def get_logical_hostname(name_index, vendor):
    name = NAMES[name_index % len(NAMES)]
    return f"{name}-{vendor}".lower()

def simulate():
    # Force host-based connection parameters
    os.environ["MYSQL_HOST"] = "127.0.0.1"
    os.environ["MYSQL_PORT"] = "3307"
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        print("Starting CLEAN Refined Network Simulation...")
        
        # CLEAR EXISTING SIMULATION DATA to ensure exact counts
        print("Clearing existing devices for Towers 1-6...")
        cursor.execute("DELETE FROM devices WHERE tower_name IN ('Tower 1', 'Tower 2', 'Tower 3', 'Tower 4', 'Tower 5', 'Tower 6')")
        
        name_counter = 0
        vendors = ["ubnt", "mktk", "cisco"]
        vendor_full = {"ubnt": "Ubiquiti", "mktk": "Mikrotik", "cisco": "Cisco"}
        offline_reasons = ["High CPU / Overloaded", "SNMP Timeout / Unreachable", "OOM / High Memory", "Signal Drop"]

        # CONFIGURATION (Exact totals)
        # (Tower ID, Num UP, Num DOWN)
        config = [
            (1, 4, 3), 
            (2, 5, 2),
            (3, 4, 2),
            (4, 0, 4), # Completely offline
            (5, 6, 0), # Completely online
            (6, 10, 3) # EXACTLY 10 UP, 3 DOWN as requested
        ]

        for tower_id, num_up, num_down in config:
            tower_name = f"Tower {tower_id}"
            print(f"\nPopulating {tower_name}: {num_up} UP, {num_down} DOWN")
            
            # 1. Generate UP devices
            for i in range(num_up):
                v_short = vendors[name_counter % 3]
                vendor = vendor_full[v_short]
                hostname = get_logical_hostname(name_counter, v_short)
                ip = f"10.{tower_id}.10.{100 + i}"
                name_counter += 1
                
                cursor.execute("""
                    INSERT INTO devices (ip, hostname, vendor, status, tower_name, offline_reason)
                    VALUES (%s, %s, %s, 'up', %s, NULL)
                """, (ip, hostname, vendor, tower_name))
                
            # 2. Generate DOWN devices
            for i in range(num_down):
                v_short = vendors[name_counter % 3]
                vendor = vendor_full[v_short]
                hostname = get_logical_hostname(name_counter, v_short)
                ip = f"10.{tower_id}.20.{100 + i}"
                reason = "Tower Power Failure" if tower_id == 4 else offline_reasons[i % len(offline_reasons)]
                name_counter += 1
                
                cursor.execute("""
                    INSERT INTO devices (ip, hostname, vendor, status, tower_name, offline_reason)
                    VALUES (%s, %s, %s, 'down', %s, %s)
                """, (ip, hostname, vendor, tower_name, reason))

        conn.commit()
        print("\nClean Simulation Refinement Complete!")
        
    except Exception as e:
        print(f"\nError: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    simulate()
