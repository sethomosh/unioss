# backend/utils/uptime.py
import re

def parse_snmp_uptime(val):
    """
    accept numeric centiseconds/ticks or textual 'Timeticks' values and return seconds (float).
    returns None if unparsable.
    """
    if val is None:
        return None
    try:
        n = int(val)
        # heuristics: if extremely large treat as centiseconds -> convert to seconds
        if n > 10_000_000_000:
            return n / 100.0
        # assume ticks in hundredths of seconds (SNMP timeticks common), convert to seconds
        # but caller should confirm. we'll return seconds as float.
        return n / 100.0 if n > 1000 else float(n)
    except Exception:
        s = str(val)
        # try to extract number in parentheses (Timeticks: (12345))
        m = re.search(r'\(?(\d+)\)?', s)
        if m:
            return int(m.group(1)) / 100.0
    return None
