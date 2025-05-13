# backend/utils/snmp_client.py
import logging 
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

def snmp_get(host: str, community: str, oid: str) -> str:
    # ignore the `host` parameter—always talk to the sim container
    target = (getenv("SNMP_HOST", "snmpsim"),
              int(getenv("SNMP_PORT", 1161)))
    
    
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, 1161), timeout=5, retries=2),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )

    # Pull off the single response tuple
    try:
        error_indication, error_status, error_index, var_binds = next(iterator)
    except Exception as ex:
        logger.error(f"SNMP GET generator exception for {host}, {oid}: {ex}")
        raise


    if error_indication or error_status:
        # Safely build an error message without assuming .prettyPrint()
        ei = str(error_indication) if error_indication else None
        es = (error_status.prettyPrint()
              if hasattr(error_status, 'prettyPrint')
              else str(error_status))
        # Prefer the engine’s indication, otherwise status
        msg = ei or es
        raise Exception(f'{msg} at {error_index}')
 
    # ——— EDIT 1: unpack the first varBind into (oid, value) ———
    _, value = var_binds[0]

    # ——— EDIT 2: support both PySNMP types and plain Python types ———
    if hasattr(value, 'prettyPrint'):
        # PySNMP will give you an object with prettyPrint()
        result = value.prettyPrint()
    else:
        # Sometimes you get back a raw int or str
        result = str(value)

    # ——— EDIT 3: strip whitespace and return clean text ———
    return result.strip()
