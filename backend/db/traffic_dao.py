import logging
from datetime import datetime
from backend.utils.db import get_db_connection

logger = logging.getLogger(__name__)


def save_traffic_metrics(rows):
    """
    Insert list of traffic metric dicts into traffic_metrics table.

    Each row may contain:
      - device_ip (required)
      - interface_index (optional, defaults to 0)
      - interface_name (optional, defaults to '')
      - inbound_kbps (optional, defaults 0)
      - outbound_kbps (optional, defaults 0)
      - in_errors (optional, defaults 0)
      - out_errors (optional, defaults 0)
      - errors (optional, defaults 0)
      - timestamp (optional, datetime or ISO string; if missing DB default will apply)
    """
    if not rows:
        return 0

    sql = """
        INSERT INTO traffic_metrics
        (device_ip, interface_index, interface_name, inbound_kbps, outbound_kbps,
         in_errors, out_errors, errors, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        data = []
        for r in rows:
            device_ip = r.get("device_ip")
            if not device_ip:
                logger.warning("Skipping row without device_ip: %s", r)
                continue

            interface_index = int(r.get("interface_index", r.get("if_index", 0) or 0))
            interface_name = r.get("interface_name") or r.get("if_descr") or ""

            inbound = float(r.get("inbound_kbps", r.get("in_kbps", 0) or 0))
            outbound = float(r.get("outbound_kbps", r.get("out_kbps", 0) or 0))
            in_errors = int(r.get("in_errors", r.get("inErrors", 0) or 0))
            out_errors = int(r.get("out_errors", r.get("outErrors", 0) or 0))
            errors = int(r.get("errors", 0) or (in_errors + out_errors))

            ts = r.get("timestamp")
            if ts is None:
                ts_val = None
            elif isinstance(ts, str):
                try:
                    ts_val = datetime.fromisoformat(ts)
                except Exception:
                    ts_val = None
            elif isinstance(ts, datetime):
                ts_val = ts
            else:
                ts_val = None

            data.append((
                device_ip,
                interface_index,
                interface_name,
                inbound,
                outbound,
                in_errors,
                out_errors,
                errors,
                ts_val
            ))

        if not data:
            return 0

        cursor.executemany(sql, data)
        conn.commit()
        logger.debug("Inserted %d traffic metric rows", cursor.rowcount)
        return cursor.rowcount

    except Exception as e:
        logger.exception("Error inserting traffic metrics: %s", e)
        try:
            conn.rollback()
        except Exception:
            logger.exception("Failed rollback after insert error")
        return 0

    finally:
        try:
            cursor.close()
        except Exception:
            logger.exception("Failed to close cursor")
        try:
            conn.close()
        except Exception:
            logger.exception("Failed to close connection")
