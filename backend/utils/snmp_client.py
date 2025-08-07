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

logger = logging.getLogger(__name__)

def snmp_get(host: str, community: str, oid: str, port: int = 161, timeout: int = 2, retries: int = 1):
    """
    Perform an SNMPv2c GET for a single OID.
    Returns the value as a Python primitive (int, str, etc.), or raises Exception on timeout/error.
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
    elif errorStatus:
        raise Exception(f"SNMP GET {errorStatus.prettyPrint()} at {errorIndex}")
    else:
        # varBinds: list of (ObjectIdentity, value)
        for name, val in varBinds:
            # Return Python primitive (int, OctetString, etc.)
            return val.prettyPrint()
    raise Exception("SNMP GET: no varBinds returned")


def snmp_walk(host, community, base_oid, port=161, timeout=2, retries=1):
    """
    Perform an SNMP WALK under base_oid using GETNEXT.
    Yields tuples: (oid_string, value_string).
    """
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
            # yield *everything* we get back
            yield (name.prettyPrint(), val.prettyPrint())

def snmp_get_bulk(
    host: str,
    community: str,
    oids: list[str],
    port: int = 161,
    timeout: int = 2,
    retries: int = 1
) -> dict[str, str]:
    """
    Perform an SNMPv2c GET for multiple OIDs in one request with retry/backoff.
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
            # catch transport or name‐resolution errors
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
                key = name.prettyPrint().split("::")[-1]
                result[key] = val.prettyPrint()
            return result

        # SNMP returned an indication or status
        last_error = errorIndication or errorStatus.prettyPrint()
        logger.warning(
            f"snmp_get_bulk attempt {attempt+1} failed: {last_error}; retrying in {delay}s"
        )
        time.sleep(delay)
        delay *= 2
        attempt += 1

    # all attempts exhausted
    raise Exception(f"snmp_get_bulk failed after {retries+1} attempts: {last_error}")
