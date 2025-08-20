#!/usr/bin/env python3
import logging
from flask import Blueprint, jsonify, request, current_app
from backend.modules.traffic import get_traffic_metrics
from backend.utils.db import get_db
import traceback
from datetime import datetime

logger = logging.getLogger("traffic_api")
traffic_bp = Blueprint("traffic", __name__)


@traffic_bp.route("/list", methods=["GET"])
def list_traffic():
    """
    Poll traffic metrics, persist into DB, and return results.
    """
    try:
        # poll devices via SNMP
        rows = get_traffic_metrics()
        conn = get_db()
        cur = conn.cursor()

        response = []

        for row in rows:
            # convert epoch/float timestamp -> MySQL DATETIME string
            try:
                ts = datetime.utcfromtimestamp(row["last_updated"]).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                # fallback: if already a string, try to clean it
                ts = str(row.get("last_updated", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")))

            iface_index = row.get("if_index") or row.get("interface_index")
            iface_name = row.get("if_descr") or row.get("iface_name") or ""
            in_kbps = float(row.get("in_bps", 0)) if row.get("in_bps", None) is not None else float(row.get("inbound_kbps", 0))
            out_kbps = float(row.get("out_bps", 0)) if row.get("out_bps", None) is not None else float(row.get("outbound_kbps", 0))
            in_errs = int(row.get("in_errors", 0))
            out_errs = int(row.get("out_errors", 0))
            errors = in_errs + out_errs

            # Use column names matching DB schema (MySQL %s param style)
            cur.execute(
                """
                INSERT INTO traffic_metrics
                (device_ip, interface_index, iface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    row.get("device_ip"),
                    iface_index,
                    iface_name,
                    in_kbps,
                    out_kbps,
                    in_errs,
                    out_errs,
                    errors,
                    ts,
                ),
            )

            response.append({
                "device_ip": row.get("device_ip"),
                "interface_index": iface_index,
                "iface_name": iface_name,
                "inbound_kbps": round(in_kbps, 3),
                "outbound_kbps": round(out_kbps, 3),
                "in_errors": in_errs,
                "out_errors": out_errs,
                "errors": errors,
                "timestamp": ts,
            })

        conn.commit()
        cur.close()
        conn.close()

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Traffic list error: {e}\n{traceback.format_exc()}")
        # also log to the Flask app logger if available
        try:
            current_app.logger.error(f"Traffic list error: {e}")
        except Exception:
            pass
        return jsonify({"error": "traffic list error"}), 500


@traffic_bp.route("/history", methods=["GET"])
def history():
    """
    Fetch recent traffic history for a device from DB.
    """
    try:
        device_ip = request.args.get("device_ip")
        if not device_ip:
            return jsonify({"error": "device_ip required"}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT device_ip, interface_index, iface_name,
                   inbound_kbps, outbound_kbps,
                   in_errors, out_errors, errors, timestamp
            FROM traffic_metrics
            WHERE device_ip=%s
            ORDER BY timestamp DESC
            LIMIT 50
            """,
            (device_ip,),
        )
        rows = [
            {
                "device_ip": r[0],
                "interface_index": r[1],
                "iface_name": r[2],
                "inbound_kbps": float(r[3]) if r[3] is not None else 0.0,
                "outbound_kbps": float(r[4]) if r[4] is not None else 0.0,
                "in_errors": int(r[5]) if r[5] is not None else 0,
                "out_errors": int(r[6]) if r[6] is not None else 0,
                "errors": int(r[7]) if r[7] is not None else (int(r[5] or 0) + int(r[6] or 0)),
                "timestamp": r[8],
            }
            for r in cur.fetchall()
        ]
        cur.close()
        conn.close()
        return jsonify(rows), 200

    except Exception as e:
        logger.error(f"Traffic history error: {e}\n{traceback.format_exc()}")
        try:
            current_app.logger.error(f"Traffic history error: {e}")
        except Exception:
            pass
        return jsonify({"error": "traffic history error"}), 500
