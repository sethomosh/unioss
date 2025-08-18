# backend/utils/snmp_client.py
from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd,
    nextCmd,
)
import logging
import time
import re

logger = logging.getLogger(__name__)

_NO_INSTANCE_STRS = ("No Such Instance", "No Such Object", "noSuchInstance", "noSuchObject")

def _normalize_value(val):
    if val is None:
        return None
    # pysnmp objects provide prettyPrint(), else str()
    s = val.prettyPrint() if hasattr(val, "prettyPrint") else str(val)
    # handle common SNMP 'noSuch' responses
    if any(tok in s for tok in _NO_INSTANCE_STRS):
        return None

    # try to reduce common typed outputs like:
    # "Timeticks: (12345678) 1 day, 10:11:12.34" -> return "12345678"
    # "Counter32: 100000" -> return "100000"
    import re
    m = re.search(r'\(?(\d{1,})\)?', s)
    if m and m.group(1):
        # prefer a pure digits string
        return m.group(1)

    # fallback: return raw string
    return s

def _numeric_oid_from_name(name_pretty: str) -> str:
    # e.g. "SNMPv2-SMI::mib-2.1.1.0" or "sysUpTime.0" or "1.3.6.1.2.1.1.3.0"
    m = re.search(r'(\d+(?:\.\d+)+)', name_pretty)
    if m:
        return m.group(1)
    # fallback: last part after ::
    return name_pretty.split("::")[-1]

def snmp_get(host: str, community: str, oid: str, port: int = 161, timeout: int = 2, retries: int = 1):
    """
    SNMP GET for single OID. Returns string value or None on "no such instance", raises on transport errors.
    """
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, port), timeout=timeout, retries=retries),
        ContextData(),
        ObjectType(ObjectIdentity(oid)),
    )

    errorIndication, errorStatus, errorIndex, varBinds = next(iterator)

    if errorIndication:
        raise Exception(f"SNMP GET error: {errorIndication}")
    if errorStatus:
        raise Exception(f"SNMP GET {errorStatus.prettyPrint()} at {errorIndex}")
    for name, val in varBinds:
        return _normalize_value(val)
    raise Exception("SNMP GET: no varBinds returned")


def snmp_walk(host, community, base_oid, port=161, timeout=2, retries=1):
    iterator = nextCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, port), timeout=timeout, retries=retries),
        ContextData(),
        ObjectType(ObjectIdentity(base_oid)),
        lexicographicMode=False,
    )

    for errorIndication, errorStatus, errorIndex, varBinds in iterator:
        if errorIndication:
            raise Exception(f"SNMP WALK error: {errorIndication}")
        if errorStatus:
            raise Exception(f"SNMP WALK {errorStatus.prettyPrint()} at {errorIndex}")
        for name, val in varBinds:
            yield (_numeric_oid_from_name(name.prettyPrint()), _normalize_value(val))


def snmp_get_bulk(
    host: str,
    community: str,
    oids: list[str],
    port: int = 161,
    timeout: int = 2,
    retries: int = 1
) -> dict:
    """
    GET several OIDs in one request. Returns dict numeric_oid -> (string|None)
    """
    attempt, delay = 0, 1
    last_error = None

    while attempt <= retries:
        types = [ObjectType(ObjectIdentity(oid)) for oid in oids]
        try:
            iterator = getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=1),
                UdpTransportTarget((host, port), timeout=timeout, retries=0),
                ContextData(),
                *types
            )
            errorIndication, errorStatus, _, varBinds = next(iterator)
        except Exception as e:
            last_error = str(e)
            logger.warning(
                f"snmp_get_bulk attempt {attempt+1} error invoking SNMP: {last_error}; retrying in {delay}s"
            )
            time.sleep(delay)
            delay *= 2
            attempt += 1
            continue

        if not errorIndication and not errorStatus:
            result = {}
            for name, val in varBinds:
                key = _numeric_oid_from_name(name.prettyPrint())
                result[key] = _normalize_value(val)
            return result

        last_error = errorIndication or (errorStatus.prettyPrint() if errorStatus else "unknown")
        logger.warning(
            f"snmp_get_bulk attempt {attempt+1} failed: {last_error}; retrying in {delay}s"
        )
        time.sleep(delay)
        delay *= 2
        attempt += 1

    raise Exception(f"snmp_get_bulk failed after {retries+1} attempts: {last_error}")
