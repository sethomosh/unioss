# backend/api/discovery_api.py

from flask import Blueprint, jsonify, current_app
from backend.modules.discovery import get_device_inventory

discovery_api = Blueprint('discovery_api', __name__)

@discovery_api.route('/devices', methods=['GET'])
def list_devices():
    """
    GET /api/discovery/devices
    Returns a list of discovered tower devices.
    """
    try:
        raw = get_device_inventory()
        response = []
        for d in raw:
            response.append({
                "ip":          d.get("ip"),
                "hostname":    d.get("hostname", ""),
                "description": d.get("description", ""),
                "vendor":      d.get("vendor", ""),
                "os_version":  d.get("os_version", ""),
                "status":      d.get("status", "unknown"),
                "error":       d.get("error"),
                "cpu_pct":     d.get("cpu_pct", 0.0),
                "memory_pct":  d.get("memory_pct", 0.0),
                "uptime_seconds": d.get("uptime_seconds", 0),
                "sessions":    d.get("sessions", 0),
                "last_seen":   d.get("last_seen"),
                "offline_reason": d.get("offline_reason")
            })
        current_app.logger.info(f"Discovered {len(response)} devices")
        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Discovery error: {e}")
        return jsonify({"error": str(e)}), 500
@discovery_api.route('/devices/<device_ip>/details', methods=['GET'])
def device_details(device_ip):
    """
    Combined device details payload for the frontend.
    """
    from backend.utils.db import get_db_connection
    import datetime
    
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        # 1. Snapshot (latest perf)
        cur.execute("""
            SELECT cpu_pct, memory_pct, uptime_seconds, timestamp
            FROM performance_metrics
            WHERE device_ip = %s
            ORDER BY timestamp DESC
            LIMIT 1
        """, (device_ip,))
        snapshot = cur.fetchone()
        if snapshot and isinstance(snapshot["timestamp"], datetime.datetime):
            snapshot["timestamp"] = snapshot["timestamp"].isoformat()

        # 2. Performance History
        cur.execute("""
            SELECT timestamp, cpu_pct, memory_pct
            FROM performance_metrics
            WHERE device_ip = %s
            ORDER BY timestamp DESC
            LIMIT 50
        """, (device_ip,))
        perf_history = cur.fetchall() or []
        for p in perf_history:
            if isinstance(p["timestamp"], datetime.datetime):
                p["timestamp"] = p["timestamp"].isoformat()

        # 3. Traffic History
        cur.execute("""
            SELECT timestamp, interface_name, inbound_kbps, outbound_kbps, errors
            FROM traffic_metrics
            WHERE device_ip = %s
            ORDER BY timestamp DESC
            LIMIT 50
        """, (device_ip,))
        traffic_history = cur.fetchall() or []
        for t in traffic_history:
            if isinstance(t["timestamp"], datetime.datetime):
                t["timestamp"] = t["timestamp"].isoformat()

        # 4. Latest per-interface rows
        cur.execute("""
            SELECT t.interface_name, t.inbound_kbps, t.outbound_kbps, t.errors, t.timestamp
            FROM traffic_metrics t
            JOIN (
                SELECT interface_name, MAX(timestamp) AS ts
                FROM traffic_metrics
                WHERE device_ip = %s
                GROUP BY interface_name
            ) m ON t.interface_name = m.interface_name AND t.timestamp = m.ts
            WHERE t.device_ip = %s
        """, (device_ip, device_ip))
        latest_if = cur.fetchall() or []
        for i in latest_if:
            if isinstance(i["timestamp"], datetime.datetime):
                i["timestamp"] = i["timestamp"].isoformat()

        return jsonify({
            "device_ip": device_ip,
            "snapshot": snapshot,
            "performance_history": perf_history,
            "traffic_history": traffic_history,
            "latest_per_interface": latest_if
        }), 200

    except Exception as e:
        current_app.logger.exception(f"Error fetching device details for {device_ip}: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
