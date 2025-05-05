from pysnmp.hlapi import (
    SnmpEngine,            # SNMP engine instance :contentReference[oaicite:0]{index=0}
    CommunityData,         # Community string handler :contentReference[oaicite:1]{index=1}
    UdpTransportTarget,    # UDP transport target specification :contentReference[oaicite:2]{index=2}
    ContextData,           # Context data for SNMP v2c :contentReference[oaicite:3]{index=3}
    ObjectType,            # Wraps OID/value pairs :contentReference[oaicite:4]{index=4}
    ObjectIdentity,        # Represents an OID :contentReference[oaicite:5]{index=5}
    getCmd                 # High-level GET command generator :contentReference[oaicite:6]{index=6}
)

def snmp_get(host: str, community: str, oid: str) -> str:
    """
    Performs a single SNMP GET; returns the value or raises on error.
    """
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        UdpTransportTarget((host, 161)),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )
    error_indication, error_status, error_index, var_binds = next(iterator)
    if error_indication or error_status:
        # Agent or engine error—raise with details
        raise Exception(f'{error_status.prettyPrint()} at {error_index}')
    # var_binds[0] is a tuple (ObjectIdentity, value); extract and return the value
    return var_binds[0].prettyPrint().split('=', 1)[1].strip()
