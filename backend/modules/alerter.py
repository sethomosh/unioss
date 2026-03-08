# backend/modules/alerter.py
import os
import logging
import json
import re
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional, Dict, Any, List

from ..utils.db import run_query

logger = logging.getLogger("unioss.alerter")

# thresholds (can override with env vars)
CPU_CRITICAL = float(os.getenv("ALERT_CPU_CRITICAL", "90"))
CPU_HIGH = float(os.getenv("ALERT_CPU_HIGH", "75"))
CPU_WARN = float(os.getenv("ALERT_CPU_WARN", "60"))

MEM_CRITICAL = float(os.getenv("ALERT_MEM_CRITICAL", "90"))
MEM_HIGH = float(os.getenv("ALERT_MEM_HIGH", "80"))
MEM_WARN = float(os.getenv("ALERT_MEM_WARN", "70"))

RSSI_CRITICAL = float(os.getenv("ALERT_RSSI_CRITICAL", "5"))
RSSI_HIGH = float(os.getenv("ALERT_RSSI_HIGH", "15"))
RSSI_WARN = float(os.getenv("ALERT_RSSI_WARN", "25"))

TRAFFIC_HIGH_KBPS = float(os.getenv("ALERT_TRAFFIC_HIGH_KBPS", "10000"))  # 10 Mbps default
TRAFFIC_DROP_PCT = float(os.getenv("ALERT_TRAFFIC_DROP_PCT", "95"))  # percent drop

ERRORS_CRITICAL_DELTA = int(os.getenv("ALERT_ERRORS_CRITICAL_DELTA", "500"))
ERRORS_WARN_DELTA = int(os.getenv("ALERT_ERRORS_WARN_DELTA", "50"))

# dedupe window in minutes
DEDUPE_MINUTES = int(os.getenv("ALERT_DEDUPE_MINUTES", "15"))



try:
    _os_rules = json.loads(os.getenv("ALERT_OS_RULES_JSON", "{}")) or {}
except Exception:
    _os_rules = {}

DEFAULT_OS_RULES = {
    "ubiquiti": {"warn_version": "1.10.0", "critical_below": "1.8.0"},
    "cisco": {"warn_version": "16.9.0", "critical_below": "12.4.0"},
    "mikrotik": {"warn_version": "6.45.0", "critical_below": "6.40.0"},
}
for k, v in DEFAULT_OS_RULES.items():
    if k not in _os_rules:
        _os_rules[k] = v

_version_re = re.compile(r"(\d+(?:\.\d+)+)")

def _parse_version_from_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = _version_re.search(str(text))
    if m:
        return m.group(1)
    return None

def _cmp_version(a: str, b: str) -> int:
    """
    compare dotted numeric versions loosely.
    returns -1 if a<b, 0 if equal, +1 if a>b
    """
    try:
        aa = [int(x) for x in re.findall(r'\d+', str(a))]
        bb = [int(x) for x in re.findall(r'\d+', str(b))]
        n = max(len(aa), len(bb))
        aa += [0] * (n - len(aa))
        bb += [0] * (n - len(bb))
        for ai, bi in zip(aa, bb):
            if ai < bi: return -1
            if ai > bi: return 1
        return 0
    except Exception:
        if str(a) == str(b): return 0
        return -1 if str(a) < str(b) else 1

def evaluate_os_and_maybe_alert(device_ip: str, sysdescr: Optional[str] = None, sysobject: Optional[str] = None, vendor_key: Optional[str] = None, model: Optional[str] = None) -> None:
    """
    Evaluate OS/version and insert alerts if device runs an OS below configured thresholds.
    - vendor_key: normalized vendor key (lowercase) if known
    - sysdescr: raw sysDescr (string) from SNMP
    - sysobject: sysObjectID (string) from SNMP
    - model: optional model hint
    """
    try:
        vendor = (vendor_key or "").strip().lower() or None
        parsed_version = _parse_version_from_text(sysdescr) or _parse_version_from_text(sysobject)

        # select rule
        rule = None
        if vendor and vendor in _os_rules:
            rule = _os_rules[vendor]
        else:
            if model:
                mk = model.lower()
                for vk, rv in _os_rules.items():
                    if vk in mk:
                        rule = rv
                        break

        if not rule:
            return

        warn_v = rule.get("warn_version")
        crit_v = rule.get("critical_below")
        cat = f"os.{vendor or 'unknown'}"

        if not parsed_version:
            # cannot parse numeric version — alert so operator inspects raw sysDescr
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "warning", f"unable to parse os version from sysDescr; sysDescr='{str(sysdescr)[:120]}'", cat)
            return

        if crit_v and _cmp_version(parsed_version, crit_v) < 0:
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "critical", f"os version {parsed_version} is below critical threshold ({crit_v}) for vendor={vendor}", cat)
            return

        if warn_v and _cmp_version(parsed_version, warn_v) < 0:
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "warning", f"os version {parsed_version} is below warning threshold ({warn_v}) for vendor={vendor}", cat)
            return

    except Exception:
        logger.exception("evaluate_os_and_maybe_alert failed for %s", device_ip)



def _recent_alert_exists(device_ip: str, category: Optional[str], window_minutes: int = DEDUPE_MINUTES) -> bool:
    try:
        q = """
        SELECT id FROM alerts
        WHERE device_ip = %s AND category = %s
          AND timestamp > DATE_SUB(NOW(), INTERVAL %s MINUTE)
        LIMIT 1
        """
        rows = run_query(q, params=(device_ip, category, window_minutes), fetch=True, dict_cursor=True) or []
        return len(rows) > 0
    except Exception:
        logger.exception("failed checking recent_alert_exists")
        return False


def _notify_webhook(device_ip: str, severity: str, message: str, category: Optional[str] = None):
    webhook_url = os.getenv("ALERT_WEBHOOK_URL")
    if not webhook_url:
        return
        
    # Only notify for critical or high
    if severity.lower() not in ["critical", "high"]:
        return
        
    payload = {
        "text": f"*{severity.upper()} Alert* on `{device_ip}`\n*Category:* {category}\n*Message:* {message}"
    }
    
    try:
        req = urllib.request.Request(
            webhook_url, 
            data=json.dumps(payload).encode('utf-8'), 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            logger.info("Sent webhook notification for alert on %s (%d)", device_ip, response.getcode())
    except Exception as e:
        logger.error("Failed to send webhook notification for %s: %s", device_ip, str(e))


def _insert_alert(device_ip: str, severity: str, message: str, category: Optional[str] = None) -> bool:
    try:
        q = """
        INSERT INTO alerts (device_ip, severity, message, timestamp, category)
        VALUES (%s, %s, %s, %s, %s)
        """
        run_query(q, params=(device_ip, severity, message, datetime.utcnow(), category), fetch=False, commit=True)
        logger.info("inserted alert: %s %s %s", device_ip, severity, category)
        
        # trigger external notification
        _notify_webhook(device_ip, severity, message, category)
        
        return True
    except Exception:
        logger.exception("failed inserting alert for %s", device_ip)
        return False

def _get_thresholds_from_db(device_ip: str, interface_index: int):
    try:
        rows = run_query(
            "SELECT warn_dbm, high_dbm, critical_dbm FROM signal_thresholds WHERE device_ip=%s AND interface_index=%s LIMIT 1",
            params=(device_ip, interface_index),
            fetch=True,
            dict_cursor=True
        ) or []
        if rows:
            r = rows[0]
            return (r.get("warn_dbm"), r.get("high_dbm"), r.get("critical_dbm"))
    except Exception:
        logger.exception("failed reading signal_thresholds for %s iface %s", device_ip, interface_index)
    return (None, None, None)

def evaluate_performance_and_maybe_alert(device_ip: str, new_row: Dict[str, Any], prev_row: Optional[Dict[str, Any]] = None) -> None:
    """
    new_row example: {"cpu_pct": 12.3, "memory_pct": 34.1, "uptime_seconds": 1234}
    prev_row optional: same shape, used for delta checks.
    """
    try:
        cpu = float(new_row.get("cpu_pct") or 0.0)
        mem = float(new_row.get("memory_pct") or 0.0)
        uptime = int(new_row.get("uptime_seconds") or 0)

        # offline / reboot detection
        if uptime < 60:
            cat = "uptime"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "critical", f"device uptime very low ({uptime}s). possible reboot/offline", cat)
            return

        # cpu thresholds
        if cpu >= CPU_CRITICAL:
            cat = "cpu"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "critical", f"cpu {cpu}% (>= {CPU_CRITICAL}%)", cat)
            return
        if cpu >= CPU_HIGH:
            cat = "cpu"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "high", f"cpu {cpu}% (>= {CPU_HIGH}%)", cat)
        elif cpu >= CPU_WARN:
            cat = "cpu"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "warning", f"cpu {cpu}% (>= {CPU_WARN}%)", cat)

        # memory thresholds
        if mem >= MEM_CRITICAL:
            cat = "memory"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "critical", f"memory {mem}% (>= {MEM_CRITICAL}%)", cat)
            return
        if mem >= MEM_HIGH:
            cat = "memory"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "high", f"memory {mem}% (>= {MEM_HIGH}%)", cat)
        elif mem >= MEM_WARN:
            cat = "memory"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "warning", f"memory {mem}% (>= {MEM_WARN}%)", cat)

    except Exception:
        logger.exception("evaluate_performance_and_maybe_alert failed for %s", device_ip)


def evaluate_traffic_and_maybe_alert(device_ip: str, interface_index: int, new_in_kbps: float, new_out_kbps: float, prev_in_kbps: Optional[float] = None, prev_out_kbps: Optional[float] = None, in_errors: int = 0, out_errors: int = 0) -> None:
    try:
        iface = f"if{interface_index}"
        # high absolute throughput
        if new_in_kbps >= TRAFFIC_HIGH_KBPS or new_out_kbps >= TRAFFIC_HIGH_KBPS:
            cat = f"traffic.{iface}.high"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "high", f"high traffic on {iface}: in={new_in_kbps:.1f}kbps out={new_out_kbps:.1f}kbps", cat)

        # sudden drop
        if prev_in_kbps is not None:
            if prev_in_kbps > 0 and (1 - (new_in_kbps / prev_in_kbps)) * 100.0 >= TRAFFIC_DROP_PCT:
                cat = f"traffic.{iface}.drop"
                if not _recent_alert_exists(device_ip, cat):
                    _insert_alert(device_ip, "warning", f"sudden inbound drop on {iface}: from {prev_in_kbps:.1f}kbps -> {new_in_kbps:.1f}kbps", cat)
        if prev_out_kbps is not None:
            if prev_out_kbps > 0 and (1 - (new_out_kbps / prev_out_kbps)) * 100.0 >= TRAFFIC_DROP_PCT:
                cat = f"traffic.{iface}.drop"
                if not _recent_alert_exists(device_ip, cat):
                    _insert_alert(device_ip, "warning", f"sudden outbound drop on {iface}: from {prev_out_kbps:.1f}kbps -> {new_out_kbps:.1f}kbps", cat)

        # errors delta
        if in_errors >= ERRORS_CRITICAL_DELTA or out_errors >= ERRORS_CRITICAL_DELTA:
            cat = f"traffic.{iface}.errors"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "critical", f"errors spike on {iface}: in_errors={in_errors} out_errors={out_errors}", cat)
        elif in_errors >= ERRORS_WARN_DELTA or out_errors >= ERRORS_WARN_DELTA:
            cat = f"traffic.{iface}.errors"
            if not _recent_alert_exists(device_ip, cat):
                _insert_alert(device_ip, "warning", f"errors increased on {iface}: in_errors={in_errors} out_errors={out_errors}", cat)

    except Exception:
        logger.exception("evaluate_traffic_and_maybe_alert failed for %s", device_ip)


def evaluate_signal_and_maybe_alert(device_ip: str, interface_index: int, rssi_pct: Optional[float], snr_db: Optional[float], rssi_dbm: Optional[float] = None) -> None:
    """
    prefer absolute dbm thresholds from DB per-device/interface;
    fallback to env percent thresholds when dbm is not available.

    arguments:
      - rssi_dbm: absolute dBm when available (preferred)
      - rssi_pct: percent-normalized value (old behavior)
    """
    try:
        iface = f"if{interface_index}"
        # read per-interface thresholds from DB
        warn_dbm, high_dbm, crit_dbm = _get_thresholds_from_db(device_ip, interface_index)

        # fallback env default DBM thresholds if DB has no row
        # negative dBm values (e.g. -70) are expected
        try:
            crit_dbm = float(crit_dbm) if crit_dbm is not None else float(os.getenv("ALERT_RSSI_CRITICAL_DBM", "-90"))
            high_dbm = float(high_dbm) if high_dbm is not None else float(os.getenv("ALERT_RSSI_HIGH_DBM", "-85"))
            warn_dbm = float(warn_dbm) if warn_dbm is not None else float(os.getenv("ALERT_RSSI_WARN_DBM", "-80"))
        except Exception:
            # safe defaults if conversion fails
            crit_dbm, high_dbm, warn_dbm = -90.0, -85.0, -80.0

        # if we have a dbm value prefer it
        if rssi_dbm is not None:
            try:
                dbm = float(rssi_dbm)
            except Exception:
                dbm = None
            if dbm is not None:
                # note: more negative -> worse signal
                if dbm <= crit_dbm:
                    cat = f"signal.{iface}"
                    if not _recent_alert_exists(device_ip, cat):
                        _insert_alert(device_ip, "critical", f"rssi very low {dbm} dBm on {iface}", cat)
                    return
                if dbm <= high_dbm:
                    cat = f"signal.{iface}"
                    if not _recent_alert_exists(device_ip, cat):
                        _insert_alert(device_ip, "high", f"rssi low {dbm} dBm on {iface}", cat)
                elif dbm <= warn_dbm:
                    cat = f"signal.{iface}"
                    if not _recent_alert_exists(device_ip, cat):
                        _insert_alert(device_ip, "warning", f"rssi moderate {dbm} dBm on {iface}", cat)
                return

        # fallback: percent-based behavior (keeps backwards compatibility)
        if rssi_pct is not None:
            if rssi_pct <= RSSI_CRITICAL:
                cat = f"signal.{iface}"
                if not _recent_alert_exists(device_ip, cat):
                    _insert_alert(device_ip, "critical", f"rssi very low {rssi_pct}% on {iface}", cat)
                return
            if rssi_pct <= RSSI_HIGH:
                cat = f"signal.{iface}"
                if not _recent_alert_exists(device_ip, cat):
                    _insert_alert(device_ip, "high", f"rssi low {rssi_pct}% on {iface}", cat)
            elif rssi_pct <= RSSI_WARN:
                cat = f"signal.{iface}"
                if not _recent_alert_exists(device_ip, cat):
                    _insert_alert(device_ip, "warning", f"rssi moderate {rssi_pct}% on {iface}", cat)
    except Exception:
        logger.exception("evaluate_signal_and_maybe_alert failed for %s", device_ip)

def evaluate_unauthenticated_clients() -> None:
    try:
        q = """
        SELECT s.mac, IFNULL(s.device_ip, s.ip) as dev_ip
        FROM access_sessions s
        LEFT JOIN client_acl a ON s.mac = a.mac_address AND (s.device_ip = a.device_ip OR s.ip = a.device_ip) AND a.status = 'allowed'
        WHERE a.id IS NULL AND s.logout_time IS NULL AND s.mac IS NOT NULL
        """
        rows = run_query(q, fetch=True, dict_cursor=True) or []
        for r in rows:
            mac = r.get("mac")
            dev_ip = r.get("dev_ip", "unknown")
            cat = f"auth.unauthenticated.{mac}"
            if not _recent_alert_exists(dev_ip, cat, window_minutes=60):
                _insert_alert(dev_ip, "warning", f"Unauthenticated client session detected: {mac}", cat)
    except Exception:
        logger.exception("evaluate_unauthenticated_clients failed")