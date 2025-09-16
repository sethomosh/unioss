# backend/modules/traffic.py
#!/usr/bin/env python3
import time
import logging
from datetime import datetime
from fastapi import APIRouter
from backend.utils.snmp_client import snmp_walk
from backend.utils.snmp_client import snmp_get_bulk

router = APIRouter()
logger = logging.getLogger("traffic")


@router.get("/traffic/{device_ip}")
def traffic_for_device(device_ip: str):
    """
    return traffic metrics for a single device
    """
    return get_traffic_metrics(device_ip)


# SNMP OIDs
IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"

# cache for last counters
_last_counters = {}


def _delta(new, old, bits, modulo):
    """calculate unsigned delta with counter wrap handling"""
    return (new - old) % modulo if new < old else new - old


def get_traffic_metrics(device_ip, community="public", version="2c", port=161):
    """
    Collect traffic counters for a device.
    Returns dict: { ifIndex: { 'name': ..., 'in_octets': ..., 'out_octets': ..., 'in_errors': ..., 'out_errors': ... } }
    """
    try:
        if_descr = dict(snmp_walk(device_ip, community, IF_DESCR_OID, port=port))
        if_in_octets = dict(snmp_walk(device_ip, community, IF_IN_OCTETS_OID, port=port))
        if_out_octets = dict(snmp_walk(device_ip, community, IF_OUT_OCTETS_OID, port=port))
        if_in_errors = dict(snmp_walk(device_ip, community, IF_IN_ERRORS_OID, port=port))
        if_out_errors = dict(snmp_walk(device_ip, community, IF_OUT_ERRORS_OID, port=port))
    except Exception as e:
        logger.error(f"SNMP error polling {device_ip}: {e}")
        return {}

    metrics = {}
    for oid, name in if_descr.items():
        idx = oid.split(".")[-1]  # take ifIndex from OID suffix
        metrics[idx] = {
            "name": name,
            "in_octets": if_in_octets.get(f"{IF_IN_OCTETS_OID}.{idx}"),
            "out_octets": if_out_octets.get(f"{IF_OUT_OCTETS_OID}.{idx}"),
            "in_errors": if_in_errors.get(f"{IF_IN_ERRORS_OID}.{idx}"),
            "out_errors": if_out_errors.get(f"{IF_OUT_ERRORS_OID}.{idx}"),
        }

    return metrics