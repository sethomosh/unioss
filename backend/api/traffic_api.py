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
    Poll traffic metrics, persist into DB (bulk insert), and return results.
    """
    try:
        rows = get_traffic_metrics()
        response = []

        with get_db_dict_cursor() as (conn, cur):
            bulk_values = []

            for row in rows:
                ts = row.get("last_updated")
                if isinstance(ts, (int, float)):
                    ts = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
                else:
                    ts = str(ts or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))

                iface_name = row.get("if_descr") or row.get("iface_name") or ""
                in_kbps = float(row.get("in_bps") or row.get("inbound_kbps") or 0)
                out_kbps = float(row.get("out_bps") or row.get("outbound_kbps") or 0)
                in_errs = int(row.get("in_errors") or 0)
                out_errs = int(row.get("out_errors") or 0)
                errors = in_errs + out_errs

                bulk_values.append((
                    row.get("device_ip"),
                    iface_name,
                    in_kbps,
                    out_kbps,
                    in_errs,
                    out_errs,
                    errors,
                    ts,
                ))

                response.append({
                    "device_ip": row.get("device_ip"),
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
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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
