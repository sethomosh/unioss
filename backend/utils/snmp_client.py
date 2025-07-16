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

def snmp_get_bulk(host: str, community: str, oids: list[str], port: int = 161, timeout: int = 2, retries: int = 1):
    """
    Perform an SNMPv2c GET for multiple OIDs in one request.
    Returns a dict { oid_str: value_str } or raises Exception on error/timeout.
    """
    object_types = [ ObjectType(ObjectIdentity(oid)) for oid in oids ]
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, port), timeout=timeout, retries=retries),
        ContextData(),
        *object_types
    )
    errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
    if errorIndication:
        raise Exception(f"SNMP BULK error: {errorIndication}")
    elif errorStatus:
        raise Exception(f"SNMP BULK {errorStatus.prettyPrint()} at {errorIndex}")
    result = {}
    for name, val in varBinds:
        # strip off any textual MIB name so keys are pure numeric
        numeric_oid = name.prettyPrint().split("::")[-1]
        result[numeric_oid] = val.prettyPrint()
    return result