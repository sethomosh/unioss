# backend/api/towers_api.py
import logging
import re
from flask import Blueprint, jsonify
from backend.utils.db import get_db_connection

logger = logging.getLogger("towers_api")
towers_api = Blueprint("towers", __name__)

@towers_api.route("", methods=["GET"])
def get_towers_list():
    """
    List all towers and their devices.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("SELECT ip, hostname, tower_name, description FROM devices WHERE tower_name IS NOT NULL")
        rows = cur.fetchall() or []
        
        buckets = {}
        for r in rows:
            name = (r.get("tower_name") or "ungrouped").strip()
            if name not in buckets:
                buckets[name] = []
            buckets[name].append({
                "device_ip": r.get("ip"),
                "hostname": r.get("hostname"),
                "description": r.get("description")
            })
            
        out = [{"name": name, "devices": buckets[name]} for name in sorted(buckets.keys())]
        return jsonify(out), 200
    except Exception as e:
        logger.exception("Towers list error: %s", e)
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@towers_api.route("/overview", methods=["GET"])
def towers_overview():
    """
    Aggregate performance/status by tower.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        
        # Get all devices to group them
        cur.execute("SELECT ip, tower_name FROM devices")
        devices = cur.fetchall() or []
        
        towers = {}
        for d in devices:
            name = d.get("tower_name") or "ungrouped"
            towers.setdefault(name, []).append(d["ip"])
            
        out = []
        for name, ips in towers.items():
            if not ips: continue
            
            # Aggregate CPU for these IPs
            placeholders = ",".join(["%s"] * len(ips))
            q = f"""
                SELECT AVG(p.cpu_pct) as avg_cpu
                FROM performance_metrics p
                JOIN (
                    SELECT device_ip, MAX(timestamp) as ts
                    FROM performance_metrics
                    WHERE device_ip IN ({placeholders})
                    GROUP BY device_ip
                ) m ON p.device_ip = m.device_ip AND p.timestamp = m.ts
            """
            cur.execute(q, tuple(ips))
            res = cur.fetchone()
            avg_cpu = float(res["avg_cpu"] or 0)
            
            out.append({
                "name": name,
                "device_ips": ips,
                "avg_cpu": round(avg_cpu, 1)
            })
            
        return jsonify(out), 200
    except Exception as e:
        logger.exception("Towers overview error: %s", e)
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
