# backend/modules/traffic.py
#!/usr/bin/env python3
import time
import logging
from datetime import datetime
from backend.utils.snmp_client import snmp_get_bulk

logger = logging.getLogger("traffic")

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
    try:
        # request the three OIDs as lists (snmp_get_bulk accepts list)
        if_descr = snmp_get_bulk(device_ip, community, [IF_DESCR_OID], port=port) or {}
        if_in_octets = snmp_get_bulk(device_ip, community, [IF_IN_OCTETS_OID], port=port) or {}
        if_out_octets = snmp_get_bulk(device_ip, community, [IF_OUT_OCTETS_OID], port=port) or {}
        if_in_errors = snmp_get_bulk(device_ip, community, [IF_IN_ERRORS_OID], port=port) or {}
        if_out_errors = snmp_get_bulk(device_ip, community, [IF_OUT_ERRORS_OID], port=port) or {}

        now = time.time()
        rows = []

        # keys returned by snmp_get_bulk are numeric OIDs as strings; the tests used mapping
        # in the simulated environment we saw earlier, the helper returns mapping of index -> value
        # so try to iterate keys of if_descr directly if it's mapping of "1.3.6...index" or "{index}".
        # To be robust: iterate items from if_descr (expected form: {'1': 'eth0', ...})
        for if_index, iface_name in if_descr.items():
            # ensure index is string numeric; normalize index key for lookups
            idx = str(if_index)

            in_octets = int(if_in_octets.get(idx, 0) or 0)
            out_octets = int(if_out_octets.get(idx, 0) or 0)
            in_errs = int(if_in_errors.get(idx, 0) or 0)
            out_errs = int(if_out_errors.get(idx, 0) or 0)

            key = f"{device_ip}:{idx}"
            prev = _last_counters.get(key)

            inbound_kbps = outbound_kbps = 0.0
            if prev:
                delta_t = now - prev["timestamp"]
                if delta_t > 0:
                    in_delta = _delta(in_octets, prev["in_octets"], 32, 2**32)
                    out_delta = _delta(out_octets, prev["out_octets"], 32, 2**32)
                    inbound_kbps = (in_delta * 8) / (delta_t * 1000)
                    outbound_kbps = (out_delta * 8) / (delta_t * 1000)

            _last_counters[key] = {
                "timestamp": now,
                "in_octets": in_octets,
                "out_octets": out_octets,
            }

            rows.append({
                "device_ip": device_ip,
                "interface_index": int(idx) if idx.isdigit() else 0,
                "interface_name": str(iface_name),
                "inbound_kbps": round(inbound_kbps, 2),
                "outbound_kbps": round(outbound_kbps, 2),
                "in_errors": in_errs,
                "out_errors": out_errs,
                "errors": in_errs + out_errs,
                "timestamp": datetime.utcnow(),
            })

        return rows

    except Exception:
        logger.exception("traffic poll failed for %s", device_ip)
        return []
