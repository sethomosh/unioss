# backend/utils/snmp_helpers.py  
import socket
import logging

logger = logging.getLogger(__name__)

_PLACEHOLDER_HOSTS = {"ip", "host", "<ip>", "<host>", ""}

def is_valid_remote_host(host: str) -> bool:
    """
    Return True if host looks like a real host/IP we should attempt to reach.
    Rejects common placeholders and unresolved names.
    """
    if not host:
        return False
    h = str(host).strip()
    if h.lower() in _PLACEHOLDER_HOSTS:
        logger.debug("Skipping placeholder host: %s", h)
        return False

    try:
        # quick resolution check
        socket.getaddrinfo(h, None)
        return True
    except Exception as exc:
        logger.debug("Host not resolvable/skipping: %s (%s)", h, exc)
        return False
