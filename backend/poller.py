#!/usr/bin/env python3
"""
unisys poller (patched)

- async poll loop that runs blocking snmp/db calls in executor
- computes traffic kbps from octet counters with wrap handling
- only writes performance rows when cpu/memory/uptime change
- only writes traffic rows when inbound/outbound/errors change beyond thresholds
- small, well-documented, defensive code
"""
import os
import time
import logging
import asyncio
import math
from decimal import Decimal
from datetime import datetime as _dt
from datetime import datetime
from typing import Dict, Any, Optional

from backend.utils.db import get_db_connection
from backend.utils.snmp_client import snmp_get, snmp_walk
from backend.db.traffic_dao import save_traffic_metrics
# note: we deliberately do NOT call backend.modules.performance.get_performance_metrics
# because we want to control insertion (only on change). we'll do direct snmp_get here.

logger = logging.getLogger("unisys_poller")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# configurable via env
MAX_CONCURRENT_POLLS = int(os.getenv("UNISYS_MAX_CONCURRENT_POLLS", "20"))
POLL_INTERVAL_SECONDS = int(os.getenv("UNISYS_POLL_INTERVAL", "30"))

# optional backfill on start (opt-in)
BACKFILL_ON_START = os.getenv("UNISYS_BACKFILL_ON_START", "false").lower() in ("1", "true", "yes")

# thresholds for deciding "significant change" (traffic in kbps)
TRAFFIC_DELTA_KBPS_THRESHOLD = float(os.getenv("UNISYS_TRAFFIC_KBPS_THRESHOLD", "1.0"))
# errors change: any change triggers write
# for performance we require exact change in stored numeric fields (cpu/mem/uptime)

_poll_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _poll_semaphore
    if _poll_semaphore is None:
        _poll_semaphore = asyncio.Semaphore(MAX_CONCURRENT_POLLS)
    return _poll_semaphore


def _to_finite_float(val, default=0.0) -> float:
    if val is None:
        return float(default)
    try:
        if isinstance(val, Decimal):
            v = float(val)
        else:
            v = float(val)
    except Exception:
        return float(default)
    return float(v) if math.isfinite(v) else float(default)


def _to_int(val, default=0) -> int:
    if val is None:
        return int(default)
    try:
        return int(val)
    except Exception:
        try:
            return int(float(val))
        except Exception:
            return int(default)


# in-memory caches that persist while the poller runs.
# _last_counters stores raw octet counters + timestamp per device+ifIndex
# key: f"{device_ip}:{if_index}" -> {"in": int, "out": int, "ts": float}
_last_counters: Dict[str, Dict[str, Any]] = {}

# _last_saved_traffic stores last values that were inserted into DB, so we avoid duplicate inserts
# key: f"{device_ip}:{if_index}" -> {"in_kbps": float, "out_kbps": float, "in_errors": int, "out_errors": int, "errors": int}
_last_saved_traffic: Dict[str, Dict[str, Any]] = {}

# helper: get last performance row from DB (for change comparison)
def _get_last_performance_row(device_ip: str):
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT cpu_pct, memory_pct, uptime_seconds
            FROM performance_metrics
            WHERE device_ip = %s
            ORDER BY timestamp DESC
            LIMIT 1
            """,
            (device_ip,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row
    except Exception as e:
        logger.exception("failed to fetch last performance row for %s: %s", device_ip, e)
        return None


def _compute_kbps(new_octets: int, old_octets: int, elapsed_seconds: float) -> float:
    """
    compute kbps from octet delta.
    handle simple counter-wrap for 32-bit counters:
      if new < old: assume wrap and add 2**32
    """
    if elapsed_seconds <= 0:
        return 0.0
    delta = new_octets - old_octets
    if delta < 0:
        # assume 32-bit wrap as common case; if counters are 64-bit this will rarely be seen
        delta += 2 ** 32
    # bits per second = (octets * 8) / seconds; convert to kilobits per second
    kbps = (delta * 8) / elapsed_seconds / 1000.0
    return float(kbps)


def _should_save_traffic(key: str, inbound_kbps: float, outbound_kbps: float, in_errors: int, out_errors: int) -> bool:
    last = _last_saved_traffic.get(key)
    if not last:
        return True
    # if either kbps moves by more than threshold OR errors changed -> save
    if abs(last["in_kbps"] - inbound_kbps) >= TRAFFIC_DELTA_KBPS_THRESHOLD:
        return True
    if abs(last["out_kbps"] - outbound_kbps) >= TRAFFIC_DELTA_KBPS_THRESHOLD:
        return True
    if last["in_errors"] != in_errors or last["out_errors"] != out_errors:
        return True
    return False


def _record_saved_traffic(key: str, inbound_kbps: float, outbound_kbps: float, in_errors: int, out_errors: int):
    _last_saved_traffic[key] = {
        "in_kbps": float(inbound_kbps),
        "out_kbps": float(outbound_kbps),
        "in_errors": int(in_errors),
        "out_errors": int(out_errors),
    }


# sync wrapper helpers (we'll run these in executor)
def _poll_snmp_traffic(device_ip: str, community: str = "public", port: int = 161):
    """
    return dict mapping full OID -> value for IF_DESCR, IF_IN_OCTETS, IF_OUT_OCTETS, IN_ERRORS, OUT_ERRORS
    uses snmp_walk (blocking)
    """
    IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
    IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
    IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
    IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
    IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"

    descr = dict(snmp_walk(device_ip, community, IF_DESCR_OID, port=port))
    in_oct = dict(snmp_walk(device_ip, community, IF_IN_OCTETS_OID, port=port))
    out_oct = dict(snmp_walk(device_ip, community, IF_OUT_OCTETS_OID, port=port))
    in_err = dict(snmp_walk(device_ip, community, IF_IN_ERRORS_OID, port=port))
    out_err = dict(snmp_walk(device_ip, community, IF_OUT_ERRORS_OID, port=port))

    return descr, in_oct, out_oct, in_err, out_err


def _poll_snmp_performance(device_ip: str, community: str = "public", port: int = 161):
    """
    poll cpu/memory/uptime via common UCD OIDs
    returns tuple (cpu_pct_or_none, memory_kb_or_none, uptime_seconds_or_none)
    """
    # candidate cpu OIDs (UCD-SNMP-MIB)
    cpu_oids = [
        "1.3.6.1.4.1.2021.11.10.0",  # laLoad.1
        "1.3.6.1.4.1.2021.11.11.0",  # laLoad.2
        "1.3.6.1.4.1.2021.11.9.0",
    ]
    mem_oid = "1.3.6.1.4.1.2021.4.6.0"  # avail mem in KB (common)
    uptime_oid = "1.3.6.1.2.1.1.3.0"  # timeticks

    def safe_cast_int(v):
        try:
            return int(v)
        except Exception:
            try:
                return int(float(v))
            except Exception:
                return None

    cpu = None
    for oid in cpu_oids:
        val = snmp_get(device_ip, oid, port=port)
        if val is not None:
            # some devices return string like "10" or "10.0"
            try:
                cpu = float(val)
            except Exception:
                try:
                    cpu = float(str(val))
                except Exception:
                    cpu = None
            if cpu is not None:
                break

    mem_val = snmp_get(device_ip, mem_oid, port=port)
    mem_kb = None
    if mem_val is not None:
        mem_kb = safe_cast_int(mem_val)

    uptime_ticks = snmp_get(device_ip, uptime_oid, port=port)
    uptime_seconds = None
    if uptime_ticks is not None:
        t = safe_cast_int(uptime_ticks)
        if t is not None:
            # timeticks are hundredths of a second
            uptime_seconds = int(t / 100)

    return cpu, mem_kb, uptime_seconds


def save_performance_metrics_row(row: Dict[str, Any]) -> bool:
    """
    Insert performance row only if cpu_pct, memory_pct, or uptime_seconds changed
    compared to most recent DB row for device.
    """
    try:
        device_ip = str(row.get("device_ip") or row.get("ip") or "")
        cpu_safe = _to_finite_float(row.get("cpu_pct", row.get("cpu")), 0.0)
        mem_safe = _to_finite_float(row.get("memory_pct", row.get("memory")), 0.0)
        uptime_safe = _to_int(row.get("uptime_seconds", row.get("uptime")), 0)

        last = _get_last_performance_row(device_ip)

        if last:
            last_cpu = _to_finite_float(last.get("cpu_pct"))
            last_mem = _to_finite_float(last.get("memory_pct"))
            last_uptime = _to_int(last.get("uptime_seconds"))
            # if nothing changed, skip insert
            if last_cpu == cpu_safe and last_mem == mem_safe and last_uptime == uptime_safe:
                logger.debug("no perf change for %s - skipping insert", device_ip)
                return False

        ts = row.get("timestamp") or row.get("time")
        if isinstance(ts, str):
            try:
                ts = _dt.fromisoformat(ts)
            except Exception:
                ts = None
        if not ts:
            ts = _dt.utcnow()

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (device_ip, cpu_safe, mem_safe, uptime_safe, ts),
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.debug("inserted perf row for %s", device_ip)
        return True
    except Exception as e:
        logger.exception("failed to insert perf row for %s: %s", row.get("device_ip"), e)
        try:
            conn.rollback()
        except Exception:
            pass
        return False


async def poll_device(device: Dict[str, Any], fake: bool = True):
    """
    poll a single device for traffic + performance.
    device is a dict with at least 'id' and 'ip'.
    the function runs blocking SNMP/db calls in executor to avoid blocking event loop.
    """
    ip = device.get("ip")
    if not ip:
        logger.warning("device without ip in poll list: %s", device)
        return

    sem = _get_semaphore()
    async with sem:
        start = time.time()
        loop = asyncio.get_running_loop()
        try:
            if fake:
                # generate deterministic fake-ish metrics so UI has something
                inbound_kbps = round(100.0 + (hash(ip) % 200) * 0.5, 2)
                outbound_kbps = round(50.0 + (hash(ip[::-1]) % 150) * 0.4, 2)
                in_errors = (hash(ip) % 5)
                out_errors = (hash(ip[::-1]) % 3)

                # fake performance
                cpu = float((hash(ip) % 20) + 1)
                mem = float(1024 * ((hash(ip) % 50) + 50))  # dummy kb
                uptime_secs = 3600 * ((hash(ip) % 100) + 1)

                # write fake data unconditionally (backends / debug)
                save_traffic_metrics([{
                    "device_ip": ip,
                    "interface_index": 1,
                    "interface_name": "eth0",
                    "inbound_kbps": inbound_kbps,
                    "outbound_kbps": outbound_kbps,
                    "in_errors": in_errors,
                    "out_errors": out_errors,
                    "errors": in_errors + out_errors,
                    "timestamp": _dt.utcnow()
                }])
                save_performance_metrics_row({
                    "device_ip": ip,
                    "cpu_pct": cpu,
                    "memory_pct": mem,
                    "uptime_seconds": uptime_secs,
                    "timestamp": _dt.utcnow()
                })
                return

            # ---- REAL SNMP mode ----
            # poll traffic counters (blocking) in executor
            descr, in_oct, out_oct, in_err, out_err = await loop.run_in_executor(
                None, _poll_snmp_traffic, ip, "public", 161
            )

            now_ts = time.time()

            rows_to_insert = []

            for oid_full, if_descr in descr.items():
                # oid_full like 1.3.6.1.2.1.2.2.1.2.<index>
                idx = oid_full.split(".")[-1]
                in_oid = f"1.3.6.1.2.1.2.2.1.10.{idx}"
                out_oid = f"1.3.6.1.2.1.2.2.1.16.{idx}"
                in_e_oid = f"1.3.6.1.2.1.2.2.1.14.{idx}"
                out_e_oid = f"1.3.6.1.2.1.2.2.1.20.{idx}"

                try:
                    new_in_oct = _to_int(in_oct.get(in_oid), 0)
                    new_out_oct = _to_int(out_oct.get(out_oid), 0)
                except Exception:
                    new_in_oct = 0
                    new_out_oct = 0

                new_in_err = _to_int(in_err.get(in_e_oid), 0)
                new_out_err = _to_int(out_err.get(out_e_oid), 0)

                key = f"{ip}:{idx}"
                last = _last_counters.get(key)
                if last:
                    elapsed = now_ts - last["ts"] if last.get("ts") else POLL_INTERVAL_SECONDS
                    inbound_kbps = _compute_kbps(new_in_oct, last["in"], elapsed)
                    outbound_kbps = _compute_kbps(new_out_oct, last["out"], elapsed)
                else:
                    # no previous counter: cannot compute delta; set kbps to 0 and store counters for next poll
                    inbound_kbps = 0.0
                    outbound_kbps = 0.0

                # update in-memory last counters (always)
                _last_counters[key] = {"in": new_in_oct, "out": new_out_oct, "ts": now_ts}

                # decide whether to save this interface's traffic row
                if _should_save_traffic(key, inbound_kbps, outbound_kbps, new_in_err, new_out_err):
                    rows_to_insert.append({
                        "device_ip": ip,
                        "interface_index": int(idx) if idx.isdigit() else 0,
                        "interface_name": str(if_descr) if if_descr is not None else "",
                        "inbound_kbps": round(inbound_kbps, 2),
                        "outbound_kbps": round(outbound_kbps, 2),
                        "in_errors": int(new_in_err),
                        "out_errors": int(new_out_err),
                        "errors": int(new_in_err) + int(new_out_err),
                        "timestamp": _dt.utcnow()
                    })
                    # update saved cache immediately so multiple interfaces don't cause races
                    _record_saved_traffic(key, inbound_kbps, outbound_kbps, new_in_err, new_out_err)

            # write traffic rows in executor (db io)
            if rows_to_insert:
                await loop.run_in_executor(None, save_traffic_metrics, rows_to_insert)
                logger.debug("wrote %d traffic rows for %s", len(rows_to_insert), ip)

            # poll performance metrics (blocking) in executor
            cpu_val, mem_kb, uptime_secs = await loop.run_in_executor(None, _poll_snmp_performance, ip, "public", 161)

            # normalize / prepare performance row
            perf_row = {
                "device_ip": ip,
                "cpu_pct": 0.0 if cpu_val is None else float(cpu_val),
                "memory_pct": 0.0 if mem_kb is None else float(mem_kb),
                "uptime_seconds": 0 if uptime_secs is None else int(uptime_secs),
                "timestamp": _dt.utcnow(),
            }

            # save perf row only if changed (runs blocking db insert in sync function)
            await loop.run_in_executor(None, save_performance_metrics_row, perf_row)

        except Exception as e:
            logger.exception("poll_device(%s) failed: %s", ip, e)
        finally:
            elapsed = time.time() - start
            logger.debug("poll_device(%s) finished in %.2fs", ip, elapsed)


async def poll_all_devices(fake: bool = True):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ip FROM devices WHERE status='up'")
    devices = cursor.fetchall()
    cursor.close()
    conn.close()

    if not devices:
        logger.info("no devices marked 'up' to poll.")
        return

    tasks = [asyncio.create_task(poll_device(d, fake)) for d in devices]
    await asyncio.gather(*tasks)


async def poll_loop(fake: bool = True, interval: int = POLL_INTERVAL_SECONDS):
    logger.info("starting poll loop (interval=%s seconds)", interval)
    if BACKFILL_ON_START:
        try:
            backfilled = backfill_missing_performance_rows()
            logger.info("backfilled %s missing performance rows at startup", backfilled)
        except Exception:
            logger.exception("backfill failed")

    while True:
        start = time.time()
        try:
            await poll_all_devices(fake=fake)
        except Exception:
            logger.exception("poll_all_devices raised an exception")
        elapsed = time.time() - start
        to_sleep = max(0, interval - elapsed)
        await asyncio.sleep(to_sleep)


def backfill_missing_performance_rows() -> int:
    """
    opt-in helper: insert a single synthetic performance row for each 'up' device that currently
    has no row in performance_metrics. useful for dashboards on first run.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO performance_metrics (device_ip, cpu_pct, memory_pct, uptime_seconds, timestamp)
        SELECT d.ip,
               ROUND(10 + (RAND() * 60), 1),
               ROUND(30 + (RAND() * 60), 1),
               3600,
               NOW()
        FROM devices d
        LEFT JOIN (
            SELECT DISTINCT device_ip FROM performance_metrics
        ) pm ON d.ip = pm.device_ip
        WHERE pm.device_ip IS NULL AND d.status = 'up'
        """
    )
    affected = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return affected


if __name__ == "__main__":
    env_mode = os.getenv("UNISYS_MODE", "fake").lower()
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--real", action="store_true", help="run in real snmp mode")
    parser.add_argument("--interval", type=int, help="poll interval seconds")
    args = parser.parse_args()

    fake_mode = not (args.real or env_mode == "real")
    if args.interval:
        POLL_INTERVAL_SECONDS = args.interval

    logger.info("poller starting in %s mode; concurrency=%s", "FAKE" if fake_mode else "REAL", MAX_CONCURRENT_POLLS)
    try:
        asyncio.run(poll_loop(fake=fake_mode, interval=POLL_INTERVAL_SECONDS))
    except KeyboardInterrupt:
        logger.info("poller stopped manually")
