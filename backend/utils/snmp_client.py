# backend/utils/snmp_client.py
import os
import re

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

SNMP_OVERRIDE_HOST = os.getenv("SNMP_HOST") or os.getenv("SNMP_TARGET")
SNMP_TIMEOUT = int(os.getenv("SNMP_TIMEOUT", "2"))    
SNMP_RETRIES = int(os.getenv("SNMP_RETRIES", "3"))


logger = logging.getLogger(__name__)

_NO_INSTANCE_STRS = ("No Such Instance", "No Such Object", "noSuchInstance", "noSuchObject")


def _resolve_host(host):
    """If SNMP_OVERRIDE_HOST set, use it instead of the passed host.
       Keeps backward compatibility during local testing with snmpsim.
    """
    return SNMP_OVERRIDE_HOST if SNMP_OVERRIDE_HOST else host



def parse_snmp_target(raw_target: str, default_port: int | None = 161) -> tuple[str, int]:
    if not raw_target:
        raise ValueError("empty SNMP target")

    rt = str(raw_target).strip()
    if rt.lower() in {"ip", "host", "<ip>", "<host>"}:
        raise ValueError(f"SNMP target looks like a placeholder: {rt!r}")

    host = rt
    port = default_port or 161  # hard fallback

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
            port = default_port or 161

    # final fallback before conversion
    if port is None:
        port = default_port or 161

    try:
        socket.getaddrinfo(host, None)
    except Exception as exc:
        raise ValueError(f"SNMP host {host!r} is not resolvable: {exc}")

    return host, int(port)


def make_udp_transport_target(raw_target: str, default_port: int | None = 161, timeout: int = 1, retries: int = 3):
    from pysnmp.hlapi import UdpTransportTarget
    raw_target = _resolve_host(raw_target)
    # ensure valid default_port
    print(f"[DEBUG] make_udp_transport_target: raw_target={raw_target!r}, default_port={default_port!r}, timeout={timeout}, retries={retries}")
    if default_port is None or not isinstance(default_port, (int, float)):
        default_port = 161
    host, port = parse_snmp_target(raw_target, default_port=int(default_port or 161))
    logger.debug("UDP transport target -> %s:%s (timeout=%s, retries=%s)", host, port, timeout, retries)
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



def snmp_get(host: str, community: str = None, oid: str = None, port: int = None, timeout: int = None, retries: int = None):
    """
    Backwards-compatible snmp_get:
      - callers can call snmp_get(host, community, oid)  (new)
      - OR call snmp_get(host, oid) (old); community will be taken from env SNMP_COMMUNITY or 'public'
    """
    # handle defaults
    timeout = SNMP_TIMEOUT if timeout is None else timeout
    retries = SNMP_RETRIES if retries is None else retries
    # honor SNMP_PORT env when caller didn't pass port
    if port is None:
        try:
            port = int(os.getenv("SNMP_PORT", "161"))
        except Exception:
            port = 161
    # backward-compat: if oid is None we assume caller used (host, oid)
    if oid is None:
        oid = community
        community = os.getenv("SNMP_COMMUNITY", "public")

    # resolve host override for local testing (e.g., SNMP_HOST=snmpsim)
    host = _resolve_host(host)

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


def snmp_walk(host, community=None, base_oid=None, port=1161, timeout=None, retries=None):
    timeout = SNMP_TIMEOUT if timeout is None else timeout
    retries = SNMP_RETRIES if retries is None else retries

    if base_oid is None and community is None:
        raise ValueError("snmp_walk requires base_oid (and optional community).")
    # support old callers snmp_walk(host, base_oid)
    if base_oid is None:
        base_oid = community
        community = os.getenv("SNMP_COMMUNITY", "public")

    host = _resolve_host(host)

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


def snmp_get_bulk(host: str, community: str, oids: list[str], port: int = 1161, timeout: int = None, retries: int = None) -> dict:
    # default values and host override
    timeout = SNMP_TIMEOUT if timeout is None else timeout
    retries = SNMP_RETRIES if retries is None else retries

    # allow community omitted as second arg (compat)
    if isinstance(community, list):  # unlikely but safe-guard
        # caller used (host, oids)
        oids = community
        community = os.getenv("SNMP_COMMUNITY", "public")

    host = _resolve_host(host)
    
    logger.debug("snmp_get_bulk target host=%s port=%s community=%s oids=%s timeout=%s retries=%s",
             host, port, community, oids, timeout, retries)



    attempt, delay = 0, 1
    last_error = None

    while attempt <= retries:
        types = [ObjectType(ObjectIdentity(oid)) for oid in oids]
        try:
            transport = make_udp_transport_target(host, default_port=port, timeout=timeout, retries=0)
            logger.debug("creating UdpTransportTarget to %s:%s (timeout=%s retries=%s)", host, port, timeout, retries)
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