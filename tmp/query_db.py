import os
import sys

# Add backend directory to sys.path to import utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.utils.db import get_db_connection

def main():
    try:
        conn = get_db_connection()
        # Override port for host access if needed, but get_db_connection uses env.
        # I'll just set the env var before calling it.
        os.environ["MYSQL_PORT"] = "3307"
        os.environ["MYSQL_HOST"] = "127.0.0.1"
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        print("--- TOWERS ---")
        cursor.execute("SELECT * FROM towers")
        towers = cursor.fetchall()
        for t in towers:
            print(t)
            
        print("\n--- DEVICES ---")
        cursor.execute("SELECT ip, hostname, vendor, status, tower_id FROM devices")
        devices = cursor.fetchall()
        for d in devices:
            print(d)
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
