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
    if not raw_target:
        raise ValueError("empty SNMP target")

    rt = str(raw_target).strip()
    if rt.lower() in {"ip", "host", "<ip>", "<host>"}:
        raise ValueError(f"SNMP target looks like a placeholder: {rt!r}")

    host = rt
    port = default_port

    if "@" in rt:
        host, port_part = rt.split("@", 1)
        host = host.strip()
        try:
            port = int(port_part)
        except Exception:
            raise ValueError(f"Bad port in SNMP target: {rt!r}")
    elif ":" in rt:
        host, port_part = rt.rsplit(":", 1)
        host = host.strip()
        try:
            port = int(port_part)
        except Exception:
            port = default_port

    try:
        socket.getaddrinfo(host, None)
    except Exception as exc:
        raise ValueError(f"SNMP host {host!r} is not resolvable: {exc}")

    return host, int(port)


def make_udp_transport_target(raw_target: str, default_port: int = 161, timeout: int = 1, retries: int = 3):
    # import inside function to avoid top-level import failures on some pysnmp versions
    from pysnmp.hlapi import UdpTransportTarget
    host, port = parse_snmp_target(raw_target, default_port=default_port)
    return UdpTransportTarget((host, port), timeout=timeout, retries=retries)


def _normalize_value(val):
    if val is None:
        return None

    s = val.prettyPrint() if hasattr(val, "prettyPrint") else str(val)
    if any(tok in s for tok in _NO_INSTANCE_STRS):
        return None

    # numeric extraction: prefer integer if pure digits, else string
    m = re.search(r'^\s*\(?(\d+)\)?\s*$', s)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return m.group(1)
    return s


def _numeric_oid_from_name(name_pretty: str) -> str:
    m = re.search(r'(\d+(?:\.\d+)+)', name_pretty)
    if m:
        return m.group(1)
    return name_pretty.split("::")[-1]


def snmp_get(host: str, community: str, oid: str, port: int = 161, timeout: int = 2, retries: int = 1):
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
    attempt, delay = 0, 1
    last_error = None

    while attempt <= retries:
        types = [ObjectType(ObjectIdentity(oid)) for oid in oids]
        try:
            transport = make_udp_transport_target(host, default_port=port, timeout=timeout, retries=0)
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
