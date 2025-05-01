from pysnmp.hlapi import CommunityData, UdpTransportTarget, SnmpEngine, getCmd, ObjectType, ObjectIdentity

def snmp_get(host, community, oid):
    """
    Performs a single SNMP GET; returns the value or raises on error.
    """
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((host, 161)),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )
    error_indication, error_status, error_index, var_binds = next(iterator)
    if error_indication:
        raise Exception(error_indication)
    if error_status:
        raise Exception(f'{error_status.prettyPrint()} at {error_index}')
    # return the first value
    return var_binds[0].prettyPrint().split('=')[-1].strip()
