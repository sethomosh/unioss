#!/usr/bin/env python3
import time
import logging
from backend.utils.snmp_client import snmp_get_bulk

logger = logging.getLogger("traffic")

# SNMP OIDs for traffic
IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"

# cache for last counters
_last_counters = {}


def get_traffic_metrics(device_ip, community="public", version="2c", port=161):
    """
    Poll SNMP device for traffic metrics. 
    Returns a list of dicts, one per interface.
    Includes: inbound_kbps, outbound_kbps, in_errors, out_errors.
    """

    try:
        # fetch values from device
        if_descr = snmp_get_bulk(device_ip, community, version, port, IF_DESCR_OID)
        if_in_octets = snmp_get_bulk(device_ip, community, version, port, IF_IN_OCTETS_OID)
        if_out_octets = snmp_get_bulk(device_ip, community, version, port, IF_OUT_OCTETS_OID)
        if_in_errors = snmp_get_bulk(device_ip, community, version, port, IF_IN_ERRORS_OID)
        if_out_errors = snmp_get_bulk(device_ip, community, version, port, IF_OUT_ERRORS_OID)

        now = time.time()
        rows = []

        for if_index, name in if_descr.items():
            in_octets = int(if_in_octets.get(if_index, 0))
            out_octets = int(if_out_octets.get(if_index, 0))
            in_errs = int(if_in_errors.get(if_index, 0))
            out_errs = int(if_out_errors.get(if_index, 0))

            # key for counter tracking
            key = f"{device_ip}:{if_index}"
            prev = _last_counters.get(key)

            inbound_kbps = outbound_kbps = 0
            if prev:
                delta_t = now - prev["timestamp"]
                if delta_t > 0:
                    in_delta = (in_octets - prev["in_octets"]) % (2**32)
                    out_delta = (out_octets - prev["out_octets"]) % (2**32)
                    # bits per second → kilobits per second
                    inbound_kbps = (in_delta * 8) / (delta_t * 1000)
                    outbound_kbps = (out_delta * 8) / (delta_t * 1000)

            # update cache
            _last_counters[key] = {
                "timestamp": now,
                "in_octets": in_octets,
                "out_octets": out_octets,
            }

            rows.append({
                "device_ip": device_ip,
                "if_index": if_index,
                "if_descr": name,
                "inbound_kbps": round(inbound_kbps, 2),
                "outbound_kbps": round(outbound_kbps, 2),
                "in_errors": in_errs,
                "out_errors": out_errs,
                "last_updated": now,
            })

        return rows

    except Exception as e:
        logger.exception("Traffic poll failed for %s", device_ip)
        return []
