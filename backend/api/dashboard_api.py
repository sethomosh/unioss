# backend/api/dashboard_api.py
import logging
from flask import Blueprint, jsonify, current_app
from backend.utils.db import get_db_connection

logger = logging.getLogger("dashboard_api")
dashboard_api = Blueprint("dashboard", __name__)

@dashboard_api.route("/metrics", methods=["GET"])
def get_dashboard_metrics():
    """
    Aggregate metrics for the main dashboard view.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        # 1. Device Counts
        cur.execute("SELECT COUNT(*) as total FROM devices")
        total_devices = cur.fetchone()["total"]
        
        cur.execute("SELECT COUNT(*) as up FROM devices WHERE status='up'")
        devices_up = cur.fetchone()["up"]
        
        # 2. Active Alerts count
        cur.execute("SELECT COUNT(*) as active FROM alerts WHERE acknowledged=0")
        active_alerts = cur.fetchone()["active"]

        # 3. Avg CPU/Memory (latest)
        cur.execute("""
            SELECT AVG(cpu_pct) as avg_cpu, AVG(memory_pct) as avg_mem
            FROM performance_metrics p
            JOIN (
                SELECT device_ip, MAX(timestamp) as ts
                FROM performance_metrics
                GROUP BY device_ip
            ) m ON p.device_ip = m.device_ip AND p.timestamp = m.ts
        """)
        avg_rows = cur.fetchone()
        avg_cpu = float(avg_rows["avg_cpu"] or 0)
        avg_mem = float(avg_rows["avg_mem"] or 0)

        return jsonify({
            "total_devices": total_devices,
            "devices_up": devices_up,
            "devices_down": total_devices - devices_up,
            "active_alerts": active_alerts,
            "avg_cpu": round(avg_cpu, 1),
            "avg_memory": round(avg_mem, 1),
            "total_throughput": 0, # Placeholder if needed
        }), 200

    except Exception as e:
        logger.exception("Dashboard metrics error: %s", e)
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
