import os
import sys
import mysql.connector

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.utils.db import get_db_connection

def verify():
    # Force host-based connection parameters
    os.environ["MYSQL_HOST"] = "127.0.0.1"
    os.environ["MYSQL_PORT"] = "3307"
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT tower_name, status, count(*) as count FROM devices GROUP BY tower_name, status ORDER BY tower_name")
        results = cursor.fetchall()
        
        print("--- Simulation Verification ---")
        for r in results:
            print(f"{r['tower_name']} | Status: {r['status']} | Count: {r['count']}")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify()
