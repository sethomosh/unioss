import os
import random
from datetime import datetime, timedelta, timezone
from backend.utils.db import get_db_connection
from backend.utils.snmp_client import snmp_get


def _to_datetime_safe(v):
    """
    Safely convert various datetime/str inputs to a naive UTC datetime.
    Returns None if conversion fails.
    """
    if not v:
        return None

    if isinstance(v, datetime):
        # strip tzinfo for consistency
        return v.replace(tzinfo=None)

    try:
        # handle possible "Z" suffix and offset-aware formats
        if isinstance(v, str):
            v = v.strip()
            if v.endswith("Z"):
                v = v[:-1] + "+00:00"
            dt = datetime.fromisoformat(v)
            return dt.replace(tzinfo=None)
    except Exception:
        return None

    return None


# default guess total memory (KB) per vendor for graceful KB->% fallback
# these are conservative common defaults; adjust for your fleet if you know different sizes
_DEFAULT_TOTAL_MEMORY_KB = {
    "ubiquiti": 262144,   # 256 MB
    "ubnt": 262144,
    "mikrotik": 131072,   # 128 MB
    "mktk": 131072,
    "cisco": 262144,      # 256 MB
    "default": 262144,
}


def _kb_value_to_percent(mb_kb_value, vendor_name):
    """
    If performance.metrics.memory_pct contains a KB number (i.e. >100),
    convert it to an estimated percent using vendor default total_kb.
    mb_kb_value: numeric KB (available KB from SNMP) OR numeric KB total (fallback)
    vendor_name: string vendor from device row
    """
    try:
        kb_val = float(mb_kb_value)
    except Exception:
        return None

    # if kb_val looks like a percentage already, bail out
    if 0 <= kb_val <= 100:
        # already percentage
        return round(kb_val, 1)

    v = (vendor_name or "").strip().lower()
    total_kb = _DEFAULT_TOTAL_MEMORY_KB.get(v, _DEFAULT_TOTAL_MEMORY_KB["default"])

    # interpret kb_val as "available KB" (memAvail). used = total - avail
    used_kb = max(0.0, float(total_kb) - kb_val)
    percent = round((used_kb / float(total_kb)) * 100.0, 1)
    # sanity clamp
    if percent < 0:
        percent = 0.0
    if percent > 100:
        percent = 100.0
    return percent


def get_device_inventory():
    """
    Pulls devices from `devices` table including status/vendor/os_version/last_seen,
    enriches with latest performance snapshot and session counts and returns list[dict].
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT id, ip,
               hostname AS db_hostname,
               description AS db_description,
               status AS db_status,
               vendor AS db_vendor,
               os_version AS db_os_version,
               last_seen AS db_last_seen,
               offline_reason AS db_offline_reason
        FROM devices
        """
    )
    rows = cursor.fetchall() or []

    devices = []

    for row in rows:
        ip = row.get("ip")
        if not ip:
            continue

        # prefer db values; set sane defaults
        hostname = row.get("db_hostname") or f"mock-{ip.split('.')[-1]}"
        description = row.get("db_description") or f"device at {ip}"
        vendor = row.get("db_vendor") or None
        os_version = row.get("db_os_version") or None
        status = row.get("db_status") or None
        last_seen_raw = row.get("db_last_seen")
        offline_reason = row.get("db_offline_reason")

        error = None
        sessions_count = 0

        try:
            # latest performance snapshot
            cursor.execute(
                """
                SELECT cpu_pct, memory_pct, uptime_seconds, timestamp
                FROM performance_metrics
                WHERE device_ip=%s
                ORDER BY timestamp DESC
                LIMIT 1
                """,
                (ip,),
            )
            perf = cursor.fetchone()

            if perf:
                def _num_cast(v, typ=float, default=0.0):
                    try:
                        if v is None:
                            return default
                        return typ(v)
                    except Exception:
                        return default

                cpu_pct = _num_cast(perf.get("cpu_pct"), float, 0.0)
                memory_pct_raw = perf.get("memory_pct")
                uptime_seconds = _num_cast(perf.get("uptime_seconds"), int, 0)
                perf_ts = perf.get("timestamp")
            else:
                cpu_pct = round(20 + 60 * random.random(), 1)
                memory_pct_raw = round(30 + 50 * random.random(), 1)
                uptime_seconds = 3600 + int(100000 * random.random())
                perf_ts = None

            # if memory_pct_raw looks like a raw KB value (too large for a percent),
            # convert to estimated percent using vendor defaults
            memory_pct = None
            try:
                if memory_pct_raw is None:
                    memory_pct = None
                else:
                    mem_val = float(memory_pct_raw)
                    if mem_val > 100.0:
                        # KB-ish value detected -> convert to percent using vendor defaults
                        memory_pct = _kb_value_to_percent(mem_val, vendor or hostname)
                    else:
                        # already a percentage
                        memory_pct = round(mem_val, 1)
            except Exception:
                memory_pct = None

            # session count
            try:
                cursor.execute("SELECT COUNT(*) AS session_count FROM access_sessions WHERE ip=%s", (ip,))
                sessions_count = cursor.fetchone().get("session_count", 0) or 0
            except Exception:
                try:
                    cursor.execute("SELECT COUNT(*) AS session_count FROM sessions WHERE device_ip=%s", (ip,))
                    sessions_count = cursor.fetchone().get("session_count", 0) or 0
                except Exception:
                    sessions_count = 0

            # last_seen: prefer explicit devices.last_seen, else performance timestamp
            last_seen_dt = _to_datetime_safe(last_seen_raw)
            perf_dt = _to_datetime_safe(perf_ts)
            if not last_seen_dt and perf_dt:
                last_seen_dt = perf_dt

            last_seen_str = last_seen_dt.isoformat() if last_seen_dt else None

        except Exception as e:
            status = status or "down"
            error = str(e)
            cpu_pct = 0.0
            memory_pct = 0.0
            uptime_seconds = 0
            last_seen_str = str(last_seen_raw) if last_seen_raw else None

        # normalize status and boolean field
        normalized_status = str(status).strip().lower() if status else None
        online_bool = normalized_status == "up"

        # ---------------------------------------------------------
        # auto-fill vendor and os_version for missing values (keeps your previous behavior)
        # ---------------------------------------------------------
        if not vendor or vendor.strip() == "":
            hn = hostname.lower()

            if any(x in hn for x in ["ubnt", "ubiquiti", "ubntt", "ubnt-"]):
                vendor = "Ubiquiti"
            elif any(x in hn for x in ["mktk", "mikrotik", "mtk"]):
                vendor = "Mikrotik"
            elif any(x in hn for x in ["cisco", "csco"]):
                vendor = "Cisco"
            elif "tower" in hn:
                vendor = "Ubiquiti"  # default chosen
            else:
                vendor = random.choice(["Cisco", "Mikrotik", "Ubiquiti"])

        # keep previous os selection logic
        if not os_version or os_version.strip() == "":
            if vendor == "Cisco":
                os_version = random.choice(["v4.1.1", "v4.2.1", "v3.3.1.230138", "v2.3.1.138", "v4.3.1"])
            elif vendor == "Mikrotik":
                os_version = random.choice(["v2.2", "v3.4", "v5.1", "v2.1","v5.5", "v3.1"])
            elif vendor == "Ubiquiti":
                os_version = random.choice(["v7.3.1", "v8.1"])

        device_dict = {
            "ip": ip,
            "device_ip": ip,
            "hostname": hostname,
            "description": description,
            "vendor": vendor,
            "os_version": os_version,
            "status": normalized_status,
            "online": online_bool,
            "error": error,
            "cpu_pct": cpu_pct,
            "memory_pct": memory_pct,
            "uptime_seconds": uptime_seconds,
            "sessions": sessions_count,
            "last_seen": last_seen_str,
            "offline_reason": offline_reason,
        }

        devices.append(device_dict)
        print(f"[discovery] added device: {ip} status: {normalized_status} cpu: {cpu_pct} mem: {memory_pct}")

    cursor.close()
    conn.close()
    return devices
