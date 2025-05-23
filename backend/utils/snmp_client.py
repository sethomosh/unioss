# backend/utils/snmp_client.py
import logging 
import os
from os import getenv
from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd
)

logger = logging.getLogger(__name__)

def snmp_get(host: str, community: str, oid: str, port: int | None = None) -> str:
    # allow override of container vs. real device parameters
    target_host = os.getenv("SNMP_HOST", host)
    target_port = port or int(os.getenv("SNMP_PORT", 1161))          
    
    logger.debug(f"SNMP GET to {target_host}:{target_port}, OID {oid}")

    
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((target_host, target_port), timeout=5, retries=2),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )

    # Pull off the single response tuple
    try:
        error_indication, error_status, error_index, var_binds = next(iterator)
    except Exception as ex:
        logger.error(f"SNMP GET generator exception for {target_host}:{target_port}, OID {oid}: {ex}")
        raise


    if error_indication or error_status:
        ei = str(error_indication) if error_indication else None
        es = (error_status.prettyPrint()
              if hasattr(error_status, 'prettyPrint')
              else str(error_status))
        # Prefer the engine’s indication, otherwise status
        msg = ei or es
        raise Exception(f'{msg} at {error_index}')

    _, value = var_binds[0]
    result = value.prettyPrint() if hasattr(value, 'prettyPrint') else str(value)
    return result.strip()


def snmp_sysdescr(host: str, community: str = "public", port: int | None = None) -> str:
    return snmp_get(host, community, "1.3.6.1.2.1.1.1.0", port=port)


def snmp_sysobjectid(host: str, community: str = "public", port: int | None = None) -> str:
    return snmp_get(host, community, "1.3.6.1.2.1.1.2.0", port=port)
