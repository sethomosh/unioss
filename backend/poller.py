#!/usr/bin/env python3
"""
unisys poller (finalized)

- async poll loop that runs blocking snmp/db calls in executor
- computes traffic kbps from octet counters with wrap handling
- syncs device_interfaces table from IF-MIB (so frontend has interface info)
- only writes performance rows when cpu/memory/uptime change
- only writes traffic rows when inbound/outbound/errors change beyond thresholds
- defensive DB handling and robust SNMP/walk integration
"""
import os
import time
import logging
import asyncio
import math
from decimal import Decimal
from datetime import datetime as _dt, datetime
from typing import Dict, Any, Optional, List, Tuple

from backend.utils.db import get_db_connection
from backend.utils.snmp_client import snmp_get, snmp_walk
from backend.db.traffic_dao import save_traffic_metrics

logger = logging.getLogger("unisys_poller")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# configurable via env
MAX_CONCURRENT_POLLS = int(os.getenv("UNISYS_MAX_CONCURRENT_POLLS", "20"))
POLL_INTERVAL_SECONDS = int(os.getenv("UNISYS_POLL_INTERVAL", "30"))

# optional backfill on start (opt-in)
BACKFILL_ON_START = os.getenv("UNISYS_BACKFILL_ON_START", "false").lower() in ("1", "true", "yes")

# thresholds for deciding "significant change" (traffic in kbps)
TRAFFIC_DELTA_KBPS_THRESHOLD = float(os.getenv("UNISYS_TRAFFIC_KBPS_THRESHOLD", "1.0"))

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
# key: f"{device_ip}:{if_index}" -> {"in_kbps": float, "out_kbps": float, "in_errors": int, "out_errors": int}
_last_saved_traffic: Dict[str, Dict[str, Any]] = {}


def _compute_kbps(new_octets: int, old_octets: int, elapsed_seconds: float) -> float:
    """
    compute kbps from octet delta.
    handle simple counter-wrap for 32-bit counters:
      if new < old: assume wrap and add 2**32
    """
    if elapsed_seconds <= 0:
        return 0.0
    delta = int(new_octets) - int(old_octets)
    if delta < 0:
        # assume 32-bit wrap as common case
        delta += 2 ** 32
    kbps = (delta * 8) / float(elapsed_seconds) / 1000.0
    return float(kbps)


def _should_save_traffic(key: str, inbound_kbps: float, outbound_kbps: float, in_errors: int, out_errors: int) -> bool:
    last = _last_saved_traffic.get(key)
    if not last:
        return True
    if abs(last["in_kbps"] - inbound_kbps) >= TRAFFIC_DELTA_KBPS_THRESHOLD:
        return True
    if abs(last["out_kbps"] - outbound_kbps) >= TRAFFIC_DELTA_KBPS_THRESHOLD:
        return True
    if int(last["in_errors"]) != int(in_errors) or int(last["out_errors"]) != int(out_errors):
        return True
    return False


def _record_saved_traffic(key: str, inbound_kbps: float, outbound_kbps: float, in_errors: int, out_errors: int):
    _last_saved_traffic[key] = {
        "in_kbps": float(inbound_kbps),
        "out_kbps": float(outbound_kbps),
        "in_errors": int(in_errors),
        "out_errors": int(out_errors),
    }


# ---- SNMP helpers (sync wrappers; executed in threadpool) ----
def _poll_snmp_traffic(device_ip: str, community: str = "public", port: int = 161) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    return five dicts mapping full numeric OID -> value for IF_DESCR, IF_IN_OCTETS, IF_OUT_OCTETS, IN_ERRORS, OUT_ERRORS
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


def _poll_snmp_performance(device_ip: str, community: str = "public", port: int = 161) -> Tuple[Optional[float], Optional[int], Optional[int]]:
    """
    poll cpu/memory/uptime via common UCD OIDs
    returns tuple (cpu_pct_or_none, memory_kb_or_none, uptime_seconds_or_none)
    """
    cpu_oids = [
        "1.3.6.1.4.1.2021.11.10.0",  # laLoad.1 (present in snmpsim)
        "1.3.6.1.4.1.2021.11.11.0",  # laLoad.2
        "1.3.6.1.4.1.2021.11.9.0",   # fallback
    ]
    mem_oid = "1.3.6.1.4.1.2021.4.6.0"  # avail mem in KB
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
        try:
            val = snmp_get(device_ip, oid, port=port)
        except Exception:
            val = None
        if val is not None:
            try:
                cpu = float(val)
            except Exception:
                try:
                    cpu = float(str(val))
                except Exception:
                    cpu = None
            if cpu is not None:
                break

    mem_val = None
    try:
        mem_val = snmp_get(device_ip, mem_oid, port=port)
    except Exception:
        mem_val = None

    mem_kb = None
    if mem_val is not None:
        mem_kb = safe_cast_int(mem_val)

    uptime_ticks = None
    try:
        uptime_ticks = snmp_get(device_ip, uptime_oid, port=port)
    except Exception:
        uptime_ticks = None

    uptime_seconds = None
    if uptime_ticks is not None:
        t = safe_cast_int(uptime_ticks)
        if t is not None:
            uptime_seconds = int(t / 100)

    return cpu, mem_kb, uptime_seconds


# ---- DB helpers used by interface sync / performance ----
def _get_device_id_by_ip(conn, ip: str) -> Optional[int]:
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM devices WHERE ip = %s", (ip,))
        r = cur.fetchone()
        return r[0] if r else None
    finally:
        try:
            cur.close()
        except Exception:
            pass


def _ensure_device_exists(conn, ip: str, hostname: Optional[str] = None, description: Optional[str] = None) -> int:
    """
    ensure a row exists in devices and return device_id
    """
    cur = conn.cursor()
    try:
        dev_id = _get_device_id_by_ip(conn, ip)
        if dev_id:
            return dev_id
        cur.execute("INSERT INTO devices (ip, hostname, description) VALUES (%s, %s, %s)", (ip, hostname or ip, description or ""))
        conn.commit()
        return cur.lastrowid
    finally:
        try:
            cur.close()
        except Exception:
            pass


def _upsert_device_interface(conn, device_id: int, if_index: int, name: str):
    """
    Insert or update a device_interfaces row. Because schema may not have a unique constraint,
    we check existence then insert/update.
    """
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, name FROM device_interfaces WHERE device_id = %s AND interface_index = %s",
            (device_id, if_index),
        )
        existing = cur.fetchone()
        if existing:
            # update if name changed
            existing_name = existing[1]
            if (existing_name or "") != (name or ""):
                cur.execute(
                    "UPDATE device_interfaces SET name = %s WHERE id = %s",
                    (name, existing[0]),
                )
                conn.commit()
        else:
            cur.execute(
                "INSERT INTO device_interfaces (device_id, interface_index, name) VALUES (%s, %s, %s)",
                (device_id, if_index, name),
            )
            conn.commit()
    finally:
        try:
            cur.close()
        except Exception:
            pass


def sync_device_interfaces(device_ip: str, community: str = "public", port: int = None) -> int:
    """
    Walk IF-MIB.ifDescr and upsert into device_interfaces.
    Returns number of interfaces synced.
    """
    if port is None:
        # default 1161 for local snmpsim, 161 otherwise
        port = 1161 if device_ip in ("snmpsim", "localhost", "127.0.0.1") else 161

    logger.debug("sync_device_interfaces: starting for %s:%d", device_ip, port)
    try:
        raw = snmp_walk(device_ip, community, "1.3.6.1.2.1.2.2.1.2", port=port)
        if_descrs = dict(raw)
        print(f"[DEBUG] snmp_walk returned type {type(raw)} with {len(if_descrs)} entries")
        for k, v in if_descrs.items():
            print(f"[DEBUG] {k} -> {v}")
    except Exception as e:
        print(f"[ERROR] snmp_walk failed: {e}")
        if_descrs = {}


    conn = None
    try:
        conn = get_db_connection()
        # get device_id; create device record if missing
        device_id = _get_device_id_by_ip(conn, device_ip)
        if not device_id:
            device_id = _ensure_device_exists(conn, device_ip)

        synced = 0
        for full_oid, descr in if_descrs.items():
            # full_oid looks like "1.3.6.1.2.1.2.2.1.2.1" -> index is last component
            try:
                idx = int(full_oid.split(".")[-1])
            except Exception:
                logger.debug("Unable to parse interface index from OID %s for %s", full_oid, device_ip)
                continue
            if_descr = str(descr) if descr is not None else ""
            _upsert_device_interface(conn, device_id, idx, if_descr)
            synced += 1

        logger.info("synced %d interfaces for %s (device_id=%s)", synced, device_ip, device_id)
        return synced
    except Exception as e:
        logger.exception("sync_device_interfaces failed for %s: %s", device_ip, e)
        return 0
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

# ---- performance insertion (defensive) ----
def save_performance_metrics_row(row: Dict[str, Any]) -> bool:
    """
    Insert performance row only if cpu_pct, memory_pct, or uptime_seconds changed
    compared to most recent DB row for device.
    Defensive: never insert NULL for cpu_pct (MySQL schema enforces NOT NULL).
    """
    conn = None
    cur = None
    try:
        device_ip = str(row.get("device_ip") or row.get("ip") or "")
        cpu_safe = _to_finite_float(row.get("cpu_pct", row.get("cpu")), 0.0)
        mem_safe = _to_finite_float(row.get("memory_pct", row.get("memory")), 0.0)
        uptime_safe = _to_int(row.get("uptime_seconds", row.get("uptime")), 0)

        # fetch last row
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
            last = cur.fetchone()
            cur.close()
            conn.close()
            conn = None
        except Exception:
            last = None
            if cur:
                try:
                    cur.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            conn = None

        if last:
            last_cpu = _to_finite_float(last.get("cpu_pct"))
            last_mem = _to_finite_float(last.get("memory_pct"))
            last_uptime = _to_int(last.get("uptime_seconds"))
            if last_cpu == cpu_safe and last_mem == mem_safe and last_uptime == uptime_safe:
                logger.debug("no perf change for %s - skipping insert", device_ip)
                return False

        ts = row.get("timestamp") or row.get("time") or _dt.utcnow()
        if isinstance(ts, str):
            try:
                ts = _dt.fromisoformat(ts)
            except Exception:
                ts = _dt.utcnow()

        # ensure we have a connection for insert
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
        logger.debug("inserted perf row for %s (cpu=%s mem=%s uptime=%s)", device_ip, cpu_safe, mem_safe, uptime_safe)
        return True
    except Exception as e:
        logger.exception("failed to insert perf row for %s: %s", row.get("device_ip"), e)
        try:
            if conn:
                conn.rollback()
        except Exception:
            pass
        return False
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ---- core poll logic ----
async def poll_device(device: Dict[str, Any], fake: bool = True):
    """
    poll a single device for traffic + performance.
    device is a dict with at least 'id' and 'ip'.
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
            logger.info("Polling device %s (fake=%s)", ip, fake)

            if fake:
                # deterministic fake metrics to populate frontend quickly
                inbound_kbps = round(100.0 + (hash(ip) % 200) * 0.5, 2)
                outbound_kbps = round(50.0 + (hash(ip[::-1]) % 150) * 0.4, 2)
                in_errors = (hash(ip) % 5)
                out_errors = (hash(ip[::-1]) % 3)

                cpu = float((hash(ip) % 20) + 1)
                mem = float(1024 * ((hash(ip) % 50) + 50))  # dummy kb
                uptime_secs = 3600 * ((hash(ip) % 100) + 1)

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

            # --- REAL SNMP mode ---
            # first, sync interfaces for device_interfaces table (non-blocking in executor)
            try:
                await loop.run_in_executor(None, sync_device_interfaces, ip, os.getenv("SNMP_COMMUNITY", "public"), int(os.getenv("SNMP_PORT", "161")))
            except Exception as e:
                logger.debug("interface sync failed for %s: %s", ip, e)

            # poll traffic counters (blocking) in executor
            try:
                descr, in_oct, out_oct, in_err, out_err = await loop.run_in_executor(
                    None, _poll_snmp_traffic, ip, os.getenv("SNMP_COMMUNITY", "public"), int(os.getenv("SNMP_PORT", "161"))
                )
            except Exception as e:
                logger.debug("snmp traffic poll failed for %s: %s", ip, e)
                descr, in_oct, out_oct, in_err, out_err = {}, {}, {}, {}, {}

            now_ts = time.time()
            rows_to_insert: List[Dict[str, Any]] = []

            for oid_full, if_descr in descr.items():
                # get last component as index (safe parse)
                idx_comp = oid_full.split(".")[-1]
                try:
                    idx = int(idx_comp)
                except Exception:
                    logger.debug("invalid ifIndex %s for %s, skipping", idx_comp, ip)
                    continue

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
                    elapsed = now_ts - last.get("ts", now_ts) if last.get("ts") else POLL_INTERVAL_SECONDS
                    inbound_kbps = _compute_kbps(new_in_oct, last.get("in", 0), elapsed)
                    outbound_kbps = _compute_kbps(new_out_oct, last.get("out", 0), elapsed)
                else:
                    # first observation: we don't create kbps estimate until we have previous counter,
                    # but still record counters so next poll can compute deltas.
                    inbound_kbps = 0.0
                    outbound_kbps = 0.0

                # update last counters
                _last_counters[key] = {"in": int(new_in_oct), "out": int(new_out_oct), "ts": now_ts}

                if _should_save_traffic(key, inbound_kbps, outbound_kbps, new_in_err, new_out_err):
                    rows_to_insert.append({
                        "device_ip": ip,
                        "interface_index": int(idx),
                        "interface_name": str(if_descr) if if_descr is not None else "",
                        "inbound_kbps": round(inbound_kbps, 2),
                        "outbound_kbps": round(outbound_kbps, 2),
                        "in_errors": int(new_in_err),
                        "out_errors": int(new_out_err),
                        "errors": int(new_in_err) + int(new_out_err),
                        "timestamp": _dt.utcnow()
                    })
                    _record_saved_traffic(key, inbound_kbps, outbound_kbps, new_in_err, new_out_err)

            if rows_to_insert:
                try:
                    await loop.run_in_executor(None, save_traffic_metrics, rows_to_insert)
                    logger.debug("wrote %d traffic rows for %s", len(rows_to_insert), ip)
                except Exception as e:
                    logger.exception("failed to save traffic rows for %s: %s", ip, e)

            # poll performance metrics
            try:
                cpu_val, mem_kb, uptime_secs = await loop.run_in_executor(None, _poll_snmp_performance, ip, os.getenv("SNMP_COMMUNITY", "public"), int(os.getenv("SNMP_PORT", "161")))
            except Exception as e:
                logger.debug("snmp performance poll failed for %s: %s", ip, e)
                cpu_val, mem_kb, uptime_secs = None, None, None

            perf_row = {
                "device_ip": ip,
                # ensure no None -> DB integrity
                "cpu_pct": 0.0 if cpu_val is None else float(cpu_val),
                "memory_pct": 0.0 if mem_kb is None else float(mem_kb),
                "uptime_seconds": 0 if uptime_secs is None else int(uptime_secs),
                "timestamp": _dt.utcnow(),
            }

            # save perf row only if changed
            try:
                await loop.run_in_executor(None, save_performance_metrics_row, perf_row)
            except Exception as e:
                logger.exception("failed to save perf row for %s: %s", ip, e)

        except Exception as e:
            logger.exception("poll_device(%s) failed: %s", ip, e)
        finally:
            elapsed = time.time() - start
            logger.debug("poll_device(%s) finished in %.2fs", ip, elapsed)


async def poll_all_devices(fake: bool = True):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, ip FROM devices WHERE status='up'")
        devices = cursor.fetchall() or []
        cursor.close()
        conn.close()
    except Exception as e:
        logger.exception("failed to fetch devices list: %s", e)
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        return

    if not devices:
        logger.info("no devices marked 'up' to poll.")
        return

    tasks = [asyncio.create_task(poll_device(d, fake)) for d in devices]
    await asyncio.gather(*tasks)


async def poll_loop(fake: bool = True, interval: int = POLL_INTERVAL_SECONDS):
    logger.info("starting poll loop (interval=%s seconds) - mode=%s", interval, "FAKE" if fake else "REAL")
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
