# backend/modules/alerter.py
import os
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from ..utils.db import run_query

logger = logging.getLogger("unisys.alerter")

# thresholds (can override with env vars)
CPU_CRITICAL = float(os.getenv("ALERT_CPU_CRITICAL", "90"))
CPU_HIGH = float(os.getenv("ALERT_CPU_HIGH", "75"))
CPU_WARN = float(os.getenv("ALERT_CPU_WARN", "60"))

MEM_CRITICAL = float(os.getenv("ALERT_MEM_CRITICAL", "90"))
MEM_HIGH = float(os.getenv("ALERT_MEM_HIGH", "80"))
MEM_WARN = float(os.getenv("ALERT_MEM_WARN", "70"))

RSSI_CRITICAL = float(os.getenv("ALERT_RSSI_CRITICAL", "10"))
RSSI_HIGH = float(os.getenv("ALERT_RSSI_HIGH", "25"))
RSSI_WARN = float(os.getenv("ALERT_RSSI_WARN", "40"))

TRAFFIC_HIGH_KBPS = float(os.getenv("ALERT_TRAFFIC_HIGH_KBPS", "10000"))  # 10 Mbps default
TRAFFIC_DROP_PCT = float(os.getenv("ALERT_TRAFFIC_DROP_PCT", "80"))  # percent drop

ERRORS_CRITICAL_DELTA = int(os.getenv("ALERT_ERRORS_CRITICAL_DELTA", "100"))
ERRORS_WARN_DELTA = int(os.getenv("ALERT_ERRORS_WARN_DELTA", "10"))

# dedupe window in minutes
DEDUPE_MINUTES = int(os.getenv("ALERT_DEDUPE_MINUTES", "15"))


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


def _insert_alert(device_ip: str, severity: str, message: str, category: Optional[str] = None) -> bool:
    try:
        q = """
        INSERT INTO alerts (device_ip, severity, message, timestamp, category)
        VALUES (%s, %s, %s, %s, %s)
        """
        run_query(q, params=(device_ip, severity, message, datetime.utcnow(), category), fetch=False, commit=True)
        logger.info("inserted alert: %s %s %s", device_ip, severity, category)
        return True
    except Exception:
        logger.exception("failed inserting alert for %s", device_ip)
        return False


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


def evaluate_signal_and_maybe_alert(device_ip: str, interface_index: int, rssi_pct: Optional[float], snr_db: Optional[float]) -> None:
    try:
        iface = f"if{interface_index}"
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

        # optionally snr checks here
    except Exception:
        logger.exception("evaluate_signal_and_maybe_alert failed for %s", device_ip)
