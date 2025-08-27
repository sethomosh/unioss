#backend/api/traffic_api
#!/usr/bin/env python3
import logging
import traceback
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app
from backend.modules.traffic import get_traffic_metrics
from backend.utils.db import get_db_dict_cursor

logger = logging.getLogger("traffic_api")
traffic_bp = Blueprint("traffic", __name__)


@traffic_bp.route("/list", methods=["GET"])
def list_traffic():
    """
    Fetch traffic metrics for all 'up' devices, persist into DB, and return.
    """
    try:
        response = []
        bulk_values = []

        with get_db_dict_cursor() as (conn, cur):
            # get devices marked up
            cur.execute("SELECT id, ip FROM devices WHERE status='up'")
            devices = cur.fetchall()

            for device in devices:
                device_id = device["id"]
                ip = device["ip"]

                # get interface mapping for this device
                cur.execute(
                    "SELECT id, name, ifIndex FROM device_interfaces WHERE device_id=%s",
                    (device_id,),
                )
                interfaces = cur.fetchall()
                iface_map = {str(i["ifIndex"]): i["name"] for i in interfaces}

                # poll traffic
                rows = get_traffic_metrics(ip) or []

                for row in rows:
                    idx = str(row.get("interface_index") or "")
                    iface_name = iface_map.get(idx, row.get("interface_name", f"if{idx}"))

                    ts = row.get("timestamp")
                    if isinstance(ts, datetime):
                        ts = ts.strftime("%Y-%m-%d %H:%M:%S")

                    in_kbps = float(row.get("inbound_kbps") or 0)
                    out_kbps = float(row.get("outbound_kbps") or 0)
                    in_errs = int(row.get("in_errors") or 0)
                    out_errs = int(row.get("out_errors") or 0)
                    errors = in_errs + out_errs

                    bulk_values.append((
                        ip, iface_name, in_kbps, out_kbps,
                        in_errs, out_errs, errors, ts,
                    ))

                    response.append({
                        "device_ip": ip,
                        "interface_name": iface_name,
                        "inbound_kbps": round(in_kbps, 3),
                        "outbound_kbps": round(out_kbps, 3),
                        "in_errors": in_errs,
                        "out_errors": out_errs,
                        "errors": errors,
                        "timestamp": ts,
                    })

            if bulk_values:
                cur.executemany(
                    """
                    INSERT INTO traffic_metrics
                    (device_ip, interface_name, inbound_kbps, outbound_kbps,
                     in_errors, out_errors, errors, timestamp)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    bulk_values,
                )
                conn.commit()

        return jsonify(response), 200

    except Exception as e:
        err_msg = f"Traffic list error: {e}\n{traceback.format_exc()}"
        logger.error(err_msg)
        try:
            current_app.logger.error(err_msg)
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

        limit = int(request.args.get("limit", 50))
        if limit > 500:  # cap to prevent huge payloads
            limit = 500

        with get_db_dict_cursor() as (conn, cur):
            cur.execute(
                """
                SELECT device_ip, interface_name,
                       inbound_kbps, outbound_kbps,
                       in_errors, out_errors, errors, timestamp
                FROM traffic_metrics
                WHERE device_ip=%s
                ORDER BY timestamp DESC
                LIMIT %s
                """,
                (device_ip, limit),
            )
            rows = cur.fetchall()

        result = []
        for r in rows:
            in_kbps = float(r.get("inbound_kbps") or 0)
            out_kbps = float(r.get("outbound_kbps") or 0)
            in_errs = int(r.get("in_errors") or 0)
            out_errs = int(r.get("out_errors") or 0)
            errors = int(r.get("errors") or (in_errs + out_errs))

            result.append({
                "device_ip": r.get("device_ip"),
                "interface_name": r.get("interface_name"),
                "inbound_kbps": round(in_kbps, 3),
                "outbound_kbps": round(out_kbps, 3),
                "in_errors": in_errs,
                "out_errors": out_errs,
                "errors": errors,
                "timestamp": r.get("timestamp").strftime("%Y-%m-%d %H:%M:%S")
                            if isinstance(r.get("timestamp"), datetime)
                            else str(r.get("timestamp")),
            })

        return jsonify(result), 200

    except Exception as e:
        err_msg = f"Traffic history error: {e}\n{traceback.format_exc()}"
        logger.error(err_msg)
        try:
            current_app.logger.error(err_msg)
        except Exception:
            pass
        return jsonify({"error": "traffic history error"}), 500
