# backend/api/traffic_api.py
import logging
import traceback
import random
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app
from backend.utils.db import get_db_connection

logger = logging.getLogger("traffic_api")
traffic_bp = Blueprint("traffic", __name__)

IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"

def get_traffic_metrics(ip, community="public", port=1161):
    """
    Poller helper: returns list of dicts with raw SNMP counters or fake data.
    """
    # Use app context mode check
    mode = current_app.config.get("UNIOSS_MODE")
    if mode == "fake" or ip == "127.0.0.1":
        return [{
            "interface_index": 1,
            "interface_name": "eth0",
            "inbound_kbps": random.uniform(100, 5000),
            "outbound_kbps": random.uniform(50, 3000),
            "in_errors": random.randint(0, 2),
            "out_errors": random.randint(0, 1),
            "timestamp": datetime.utcnow()
        }]
    
    try:
        from backend.utils.snmp_client import snmp_walk
        descr = dict(snmp_walk(ip, community, IF_DESCR_OID, port=port))
        in_oct = dict(snmp_walk(ip, community, IF_IN_OCTETS_OID, port=port))
        out_oct = dict(snmp_walk(ip, community, IF_OUT_OCTETS_OID, port=port))
        
        results = []
        for oid, name in descr.items():
            idx = oid.split(".")[-1]
            results.append({
                "interface_index": int(idx),
                "interface_name": str(name),
                "inbound_kbps": float(in_oct.get(f"{IF_IN_OCTETS_OID}.{idx}", 0)) / 125,
                "outbound_kbps": float(out_oct.get(f"{IF_OUT_OCTETS_OID}.{idx}", 0)) / 125,
                "in_errors": 0,
                "out_errors": 0,
                "timestamp": datetime.utcnow()
            })
        return results
    except Exception as e:
        logger.error(f"SNMP traffic poll failed for {ip}: {e}")
        return []

@traffic_bp.route("", methods=["GET"])
def list_traffic():
    """
    Return the latest traffic record per device+interface from the DB.
    The poller writes to traffic_metrics; this endpoint just reads it.
    Never does live SNMP — that was causing request timeouts.
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        # Latest record per (device_ip, interface_name)
        cur.execute("""
            SELECT tm.device_ip, tm.interface_name,
                   tm.inbound_kbps, tm.outbound_kbps,
                   tm.in_errors, tm.out_errors, tm.errors, tm.timestamp
            FROM traffic_metrics tm
            JOIN (
                SELECT device_ip, interface_name, MAX(timestamp) AS maxts
                FROM traffic_metrics
                GROUP BY device_ip, interface_name
            ) latest
            ON tm.device_ip = latest.device_ip
               AND tm.interface_name = latest.interface_name
               AND tm.timestamp = latest.maxts
            ORDER BY tm.device_ip, tm.interface_name
        """)
        rows = cur.fetchall() or []

        response = []
        for r in rows:
            ts = r.get("timestamp")
            response.append({
                "device_ip":      r["device_ip"],
                "interface_name": r["interface_name"],
                "inbound_kbps":   round(float(r.get("inbound_kbps") or 0), 3),
                "outbound_kbps":  round(float(r.get("outbound_kbps") or 0), 3),
                "in_errors":      int(r.get("in_errors") or 0),
                "out_errors":     int(r.get("out_errors") or 0),
                "errors":         int(r.get("errors") or 0),
                "timestamp":      ts.isoformat() if isinstance(ts, datetime) else str(ts),
            })

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Traffic list error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@traffic_bp.route("/history", methods=["GET"])
def history():
    conn = None
    cur = None
    try:
        device_ip = request.args.get("device_ip")
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)

        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        sql = "SELECT id, device_ip, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp FROM traffic_metrics WHERE 1=1"
        params = []
        if device_ip:
            sql += " AND device_ip=%s"
            params.append(device_ip)
        
        sql += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []

        for r in rows:
            if isinstance(r.get("timestamp"), datetime):
                r["timestamp"] = r["timestamp"].isoformat()
        
        # Count total for frontend pagination
        count_sql = "SELECT COUNT(*) as total FROM traffic_metrics WHERE 1=1"
        count_params = []
        if device_ip:
            count_sql += " AND device_ip=%s"
            count_params.append(device_ip)
        cur.execute(count_sql, tuple(count_params))
        total = cur.fetchone().get("total", 0)

        return jsonify({
            "items": rows,
            "total": total,
            "limit": limit,
            "offset": offset
        }), 200
    except Exception as e:
        err_msg = f"Traffic history error: {e}\n{traceback.format_exc()}"
        logger.error(err_msg)
        return jsonify({"error": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()
