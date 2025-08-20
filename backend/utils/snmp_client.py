# backend/utils/snmp_client.py
from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd,
    nextCmd,
)
import socket
import logging
import time
import re

logger = logging.getLogger(__name__)

_NO_INSTANCE_STRS = ("No Such Instance", "No Such Object", "noSuchInstance", "noSuchObject")


def parse_snmp_target(raw_target: str, default_port: int = 161) -> tuple[str, int]:
    """
    Normalize different target formats into (host, port).
    Accepts:
      - "host"
      - "host:1161"
      - "host@1161"
    Returns (host, port) or raises ValueError for invalid targets.
    """
    if not raw_target:
        raise ValueError("empty SNMP target")

    rt = str(raw_target).strip()
    # Common development/test placeholders that must be rejected
    if rt.lower() in {"ip", "host", "<ip>", "<host>"}:
        raise ValueError(f"SNMP target looks like a placeholder: {rt!r}")

    host = rt
    port = default_port

    # accept either host@port or host:port
    if "@" in rt:
        host, port_part = rt.split("@", 1)
        host = host.strip()
        try:
            port = int(port_part)
        except Exception:
            raise ValueError(f"Bad port in SNMP target: {rt!r}")
    elif ":" in rt:
        # rsplit so IPv6-ish host:port works better
        host, port_part = rt.rsplit(":", 1)
        host = host.strip()
        try:
            port = int(port_part)
        except Exception:
            # If parsing failed, we'll keep default_port and validate host below
            port = default_port

    # quick DNS/IP validation
    try:
        # getaddrinfo will raise if host is not resolvable
        socket.getaddrinfo(host, None)
    except Exception as exc:
        raise ValueError(f"SNMP host {host!r} is not resolvable: {exc}")

    return host, int(port)


def make_udp_transport_target(raw_target: str, default_port: int = 161, timeout: int = 1, retries: int = 3):
    """
    Create a pysnmp UdpTransportTarget safely. Returns the target object.
    Raises ValueError on invalid target.
    """
    from pysnmp.hlapi.transport import UdpTransportTarget  # local import to avoid import-time issues
    host, port = parse_snmp_target(raw_target, default_port=default_port)
    return UdpTransportTarget((host, port), timeout=timeout, retries=retries)


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
    try:
        transport = make_udp_transport_target(host, default_port=port, timeout=timeout, retries=retries)
    except ValueError as e:
        raise Exception(f"Invalid SNMP target {host!r}: {e}")

    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        transport,
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
    try:
        transport = make_udp_transport_target(host, default_port=port, timeout=timeout, retries=retries)
    except ValueError as e:
        raise Exception(f"Invalid SNMP target {host!r}: {e}")

    iterator = nextCmd(
        SnmpEngine(),
        CommunityData(community, mpModel=1),
        transport,
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
            # for bulk use we prefer 0 retries at transport level and handle retries in our loop
            try:
                transport = make_udp_transport_target(host, default_port=port, timeout=timeout, retries=0)
            except ValueError as e:
                raise Exception(f"Invalid SNMP target {host!r}: {e}")

            iterator = getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=1),
                transport,
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
