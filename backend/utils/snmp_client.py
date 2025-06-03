# backend/utils/snmp_client.py

from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd,
    bulkCmd,
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


def snmp_walk(host: str, community: str, base_oid: str, port: int = 161, timeout: int = 2, retries: int = 1):
    """
    Perform an SNMP WALK (GetBulk) under base_oid.
    Yields tuples: (oid_string, value_string) for each returned variable.
    """
    iterator = bulkCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, port), timeout=timeout, retries=retries),
        ContextData(),
        0, 25,  # non-repeaters, max-repetitions
        ObjectType(ObjectIdentity(base_oid)),
        lexicographicMode=False,
    )

    for errorIndication, errorStatus, errorIndex, varBindTable in iterator:
        if errorIndication:
            raise Exception(f"SNMP WALK error: {errorIndication}")
        elif errorStatus:
            raise Exception(f"SNMP WALK {errorStatus.prettyPrint()} at {errorIndex}")
        else:
            # varBindTable is a list of rows; each row is a list of (ObjectIdentity, value)
            for varBindRow in varBindTable:
                for name, val in varBindRow:
                    yield (name.prettyPrint(), val.prettyPrint())
