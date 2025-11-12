# backend/modules/traffic.py
#!/usr/bin/env python3
import time
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from backend.utils.snmp_client import snmp_walk
from backend.utils.db import run_query
from backend.utils.snmp_client import snmp_get_bulk

router = APIRouter()
logger = logging.getLogger("traffic")

IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"


def _iso(ts):
    if not ts:
        return None
    try:
        if isinstance(ts, datetime):
            return ts.isoformat() + "Z"
        return str(ts)
    except Exception:
        return None


# -----------------------
# db-backed endpoints (primary)
# prefix from main.py => /api/traffic
# -----------------------
@router.get("/", response_model=List[Dict[str, Any]])
def list_traffic(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    device_ip: Optional[str] = Query(None),
    min_errors: Optional[int] = Query(None),
    sort_by: str = Query("timestamp"),
    sort_order: str = Query("desc"),
):
    allowed_sort = {"inbound_kbps", "outbound_kbps", "errors", "timestamp", "device_ip", "interface_name"}
    if sort_by not in allowed_sort:
        raise HTTPException(status_code=400, detail=f"invalid sort_by. allowed: {allowed_sort}")
    if sort_order.lower() not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="sort_order must be 'asc' or 'desc'")

    sql = """
        SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp
        FROM traffic_metrics
        WHERE 1=1
    """
    params = []
    if device_ip:
        sql += " AND device_ip = %s"
        params.append(device_ip)
    if min_errors is not None:
        sql += " AND errors >= %s"
        params.append(min_errors)

    sql += f" ORDER BY {sort_by} {sort_order} LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    try:
        rows = run_query(sql, tuple(params), fetch=True, dict_cursor=True) or []
        for r in rows:
            if "timestamp" in r:
                r["timestamp"] = _iso(r["timestamp"])
        return rows
    except Exception as e:
        logger.exception("list_traffic failed")
        raise HTTPException(status_code=500, detail=f"error fetching traffic metrics: {e}")


@router.get("/{device_ip}", response_model=List[Dict[str, Any]])
def get_device_traffic(device_ip: str, limit: int = Query(50, ge=1, le=1000)):
    sql = """
        SELECT device_ip, interface_name, inbound_kbps, outbound_kbps, in_errors, out_errors, errors, timestamp
        FROM traffic_metrics
        WHERE device_ip = %s
        ORDER BY timestamp DESC
        LIMIT %s
    """
    try:
        rows = run_query(sql, (device_ip, limit), fetch=True, dict_cursor=True) or []
        for r in rows:
            if "timestamp" in r:
                r["timestamp"] = _iso(r["timestamp"])
        return rows
    except Exception as e:
        logger.exception("get_device_traffic failed for %s", device_ip)
        raise HTTPException(status_code=500, detail=f"error fetching device traffic: {e}")


@router.get("/{device_ip}/latest_per_interface", response_model=List[Dict[str, Any]])
def get_device_latest_per_interface(device_ip: str):
    sql = """
        SELECT t.device_ip, t.interface_name, t.inbound_kbps, t.outbound_kbps, t.in_errors, t.out_errors, t.errors, t.timestamp
        FROM traffic_metrics t
        JOIN (
            SELECT interface_name, MAX(timestamp) AS ts
            FROM traffic_metrics
            WHERE device_ip = %s
            GROUP BY interface_name
        ) m ON t.interface_name = m.interface_name AND t.timestamp = m.ts
        WHERE t.device_ip = %s
        ORDER BY t.interface_name
    """
    try:
        rows = run_query(sql, (device_ip, device_ip), fetch=True, dict_cursor=True) or []
        for r in rows:
            if "timestamp" in r:
                r["timestamp"] = _iso(r["timestamp"])
        return rows
    except Exception as e:
        logger.exception("get_device_latest_per_interface failed for %s", device_ip)
        raise HTTPException(status_code=500, detail=f"error fetching latest per-interface: {e}")


# -----------------------
# live SNMP helper endpoints (kept under /snmp to avoid collisions)
# -----------------------
@router.get("/snmp/{device_ip}", response_model=Dict[str, Dict[str, Any]])
def snmp_live_traffic(device_ip: str, community: str = "public", port: int = 161):
    """
    perform an snmp walk and return current counters (not converted to kbps).
    useful for debugging / comparison with traffic_metrics DB rows.
    """
    try:
        descr = dict(snmp_walk(device_ip, community, IF_DESCR_OID, port=port))
        in_oct = dict(snmp_walk(device_ip, community, IF_IN_OCTETS_OID, port=port))
        out_oct = dict(snmp_walk(device_ip, community, IF_OUT_OCTETS_OID, port=port))
        in_err = dict(snmp_walk(device_ip, community, IF_IN_ERRORS_OID, port=port))
        out_err = dict(snmp_walk(device_ip, community, IF_OUT_ERRORS_OID, port=port))
    except Exception as e:
        logger.exception("snmp_live_traffic failed for %s", device_ip)
        raise HTTPException(status_code=500, detail=f"snmp walk failed: {e}")

    metrics = {}
    for oid, name in descr.items():
        idx = oid.split(".")[-1]
        metrics[idx] = {
            "name": str(name),
            "in_octets": in_oct.get(f"{IF_IN_OCTETS_OID}.{idx}"),
            "out_octets": out_oct.get(f"{IF_OUT_OCTETS_OID}.{idx}"),
            "in_errors": in_err.get(f"{IF_IN_ERRORS_OID}.{idx}"),
            "out_errors": out_err.get(f"{IF_OUT_ERRORS_OID}.{idx}"),
        }
    return metrics