# backend/db/signal_dao.py
from backend.utils.db import get_db_connection
from datetime import datetime
from backend.utils.db import run_query
import logging
import json


logger = logging.getLogger(__name__)

def get_latest_per_interface(device_ip: str):
    """
    return latest signal_metrics row per interface for given device_ip
    """
    sql = """
        SELECT t.device_ip, t.interface_index, t.interface_name, t.rssi_dbm, t.rssi_pct, t.snr_db,
               t.tx_rate_mbps, t.rx_rate_mbps, t.link_quality_pct, t.frequency_mhz, t.raw_blob, t.timestamp
        FROM signal_metrics t
        JOIN (
            SELECT interface_index, MAX(timestamp) AS ts
            FROM signal_metrics
            WHERE device_ip = %s
            GROUP BY interface_index
        ) m ON t.interface_index = m.interface_index AND t.timestamp = m.ts
        WHERE t.device_ip = %s
        ORDER BY t.interface_index
    """
    return run_query(sql, (device_ip, device_ip), fetch=True, dict_cursor=True) or []

def get_recent_signals(limit: int = 50, offset: int = 0, device_ip: str = None):
    """
    return recent signal rows; optional filter by device_ip
    """
    sql = """
        SELECT device_ip, interface_index, interface_name, rssi_dbm, rssi_pct, snr_db,
               tx_rate_mbps, rx_rate_mbps, link_quality_pct, frequency_mhz, raw_blob, timestamp
        FROM signal_metrics
        WHERE 1=1
    """
    params = []
    if device_ip:
        sql += " AND device_ip = %s"
        params.append(device_ip)
    sql += " ORDER BY timestamp DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    return run_query(sql, tuple(params), fetch=True, dict_cursor=True) or []

def get_latest_signals(limit: int = 50):
    """
    return latest N signal rows across all devices (global recent)
    """
    sql = """
        SELECT device_ip, interface_index, interface_name, rssi_dbm, rssi_pct, snr_db,
               tx_rate_mbps, rx_rate_mbps, link_quality_pct, frequency_mhz, raw_blob, timestamp
        FROM signal_metrics
        ORDER BY timestamp DESC
        LIMIT %s
    """
    return run_query(sql, (limit,), fetch=True, dict_cursor=True) or []

def save_signal_metrics(rows):
    """
    rows: list[dict] with keys:
      device_ip, interface_index, interface_name, rssi_dbm, rssi_pct,
      snr_db, tx_rate_mbps, rx_rate_mbps, link_quality_pct, frequency_mhz, raw_blob, timestamp
    """
    if not rows:
        return 0

    sql = """
    INSERT INTO signal_metrics
      (device_ip, interface_index, interface_name, rssi_dbm, rssi_pct, snr_db,
       tx_rate_mbps, rx_rate_mbps, link_quality_pct, frequency_mhz, raw_blob, timestamp)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        params = []
        for r in rows:
            raw_blob = r.get("raw_blob")
            if raw_blob is not None and not isinstance(raw_blob, str):
                try:
                    raw_blob = json.dumps(raw_blob)
                except Exception:
                    raw_blob = str(raw_blob)
            params.append((
                r.get("device_ip"),
                int(r.get("interface_index", 0)),
                r.get("interface_name") or "",
                r.get("rssi_dbm"),
                r.get("rssi_pct"),
                r.get("snr_db"),
                r.get("tx_rate_mbps"),
                r.get("rx_rate_mbps"),
                r.get("link_quality_pct"),
                r.get("frequency_mhz"),
                raw_blob,
                r.get("timestamp") or datetime.utcnow()
            ))
        cur.executemany(sql, params)
        conn.commit()
        inserted = cur.rowcount
        logger.debug("saved %d signal rows", inserted)
        return inserted
    except Exception as e:
        logger.exception("failed to save signal metrics: %s", e)
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return 0
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass
