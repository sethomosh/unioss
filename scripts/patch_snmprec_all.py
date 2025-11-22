#!/usr/bin/env python3
"""
patch_snmprec_all.py

idempotently ensure core, if-mib and vendor signal scalars exist in all .snmprec files.

usage:
    chmod +x scripts/patch_snmprec_all.py
    python3 scripts/patch_snmprec_all.py --dir snmp-sim/data --max-if 4 --add-vendor-scalars

- creates backups: <file>.bak.<utc-ts>
- detects current highest ifIndex in file and ensures entries up to max(detected, --max-if)
"""
from pathlib import Path
import argparse
import shutil
import re
from datetime import datetime

# core/perf oids (oid, type, value_template)
CORE_SCALARS = [
    ("1.3.6.1.2.1.1.1.0", "4", "simulated device"),   # sysDescr
    ("1.3.6.1.2.1.1.5.0", "4", "@variate(1,99,1)"),    # sysName placeholder (kept variable)
    ("1.3.6.1.2.1.1.6.0", "4", "site-placeholder"),   # sysLocation
    ("1.3.6.1.2.1.1.4.0", "4", "ops@example.net"),    # sysContact
    ("1.3.6.1.2.1.1.3.0", "4", "@uptime"),            # uptime sentinel (if present keep)
    # ucd perf candidates (we won't overwrite if present; script replaces matching OID lines)
    ("1.3.6.1.4.1.2021.11.10.0", "66", "@variate(1,20,1)"),
    ("1.3.6.1.4.1.2021.11.11.0", "66", "@variate(1,20,1)"),
    ("1.3.6.1.4.1.2021.11.9.0", "66", "@variate(1,20,1)"),
    ("1.3.6.1.4.1.2021.4.5.0", "66", "@variate(100000,800000,1024)"),
    ("1.3.6.1.4.1.2021.4.6.0", "66", "@variate(10000,600000,512)"),
]

# ubnt vendor scalars we will add/update (friendly names in comment only)
UBNT_SCALARS = [
    ("1.3.6.1.4.1.41112.1.1.1.0", "2", "@variate(-80,-30,1)"),   # rssi_dbm (negative dBm)
    ("1.3.6.1.4.1.41112.1.1.2.0", "2", "@variate(0,40,1)"),      # snr_db
    ("1.3.6.1.4.1.41112.1.1.3.0", "2", "@variate(0,100,1)"),     # link_quality_pct
    ("1.3.6.1.4.1.41112.1.1.4.0", "66", "@variate(0,300,1)"),    # tx_rate_mbps (optional)
    ("1.3.6.1.4.1.41112.1.1.5.0", "66", "@variate(0,300,1)"),    # rx_rate_mbps (optional)
    ("1.3.6.1.4.1.41112.1.1.6.0", "66", "@variate(2412,5825,1)"),# frequency_mhz (optional)
]

IF_BASE = "1.3.6.1.2.1.2.2.1"

def backup(p: Path):
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    bak = p.with_name(p.name + f".bak.{ts}")
    shutil.copy2(p, bak)
    return bak

def read(p: Path):
    return p.read_text(encoding="utf-8", errors="ignore").splitlines()

def write(p: Path, lines):
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")

def replace_or_append(lines, oid, typ, valtpl):
    patt = re.compile(rf'^\s*{re.escape(oid)}\|.*$', flags=re.IGNORECASE)
    newline = f"{oid}|{typ}|{valtpl}"
    for i, ln in enumerate(lines):
        if patt.match(ln):
            lines[i] = newline
            return lines, True
    # not found -> append
    lines.append(newline)
    return lines, False

def detect_max_if(lines):
    patt = re.compile(rf'^{re.escape(IF_BASE)}\.(10|16|14|20|2|1|3|5|7|8)\.(\d+)\|', flags=re.IGNORECASE)
    max_idx = 0
    for ln in lines:
        m = patt.search(ln)
        if m:
            try:
                idx = int(m.group(2))
                if idx > max_idx:
                    max_idx = idx
            except Exception:
                pass
    return max_idx

def ensure_if_entries(lines, max_if):
    changed = False
    # for indexes 1..max_if create/replace these standard entries
    for idx in range(1, max_if+1):
        items = [
            (f"{IF_BASE}.1.{idx}", "2", str(idx)),                      # ifIndex
            (f"{IF_BASE}.2.{idx}", "4", f"eth{idx}"),                    # ifDescr
            (f"{IF_BASE}.3.{idx}", "2", "6"),                           # ifType (ethernetCsmacd)
            (f"{IF_BASE}.5.{idx}", "2", "100000000"),                   # ifSpeed
            (f"{IF_BASE}.7.{idx}", "2", "1"),                           # admin up
            (f"{IF_BASE}.8.{idx}", "2", "1"),                           # oper up
            (f"{IF_BASE}.10.{idx}", "65", f"@variate({1000*idx},{10000000},{100*idx})"),  # in octets
            (f"{IF_BASE}.16.{idx}", "65", f"@variate({500*idx},{8000000},{80*idx})"),     # out octets
            (f"{IF_BASE}.14.{idx}", "2", "0"),                          # in errors
            (f"{IF_BASE}.20.{idx}", "2", "0"),                          # out errors
        ]
        for oid, typ, val in items:
            lines, appended = replace_or_append(lines, oid, typ, val)
            if appended:
                changed = True
    return lines, changed

def patch_file(p: Path, min_if):
    print(f"patching {p.name}")
    orig = read(p)
    lines = list(orig)

    # detect highest if index present
    detected_max = detect_max_if(lines)
    target_max = max(detected_max, min_if or 0) or min_if or 4

    ch = False
    # core scalars
    for oid, typ, val in CORE_SCALARS:
        lines, appended = replace_or_append(lines, oid, typ, val)
        if appended:
            ch = True

    # ensure if entries up to target_max
    lines, if_changed = ensure_if_entries(lines, target_max)
    if if_changed:
        ch = True

    # ubnt vendor scalars (always add/update when --add-vendor-scalars)
    # will be controlled by cli flag
    return orig, lines, ch, target_max

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", "-d", type=str, default="snmp-sim/data")
    ap.add_argument("--max-if", type=int, default=4, help="minimum number of interfaces to ensure (script will also detect higher)")
    ap.add_argument("--ext", type=str, default=".snmprec")
    ap.add_argument("--add-vendor-scalars", action="store_true", help="also add/update ubnt vendor scalar OIDs")
    args = ap.parse_args()

    base = Path(args.dir)
    if not base.exists() or not base.is_dir():
        print("directory not found:", base)
        return

    files = sorted([p for p in base.iterdir() if p.is_file() and p.suffix == args.ext and ".bak." not in p.name and not p.name.endswith(".bak")])
    if not files:
        print("no files to patch")
        return

    changed_count = 0
    for f in files:
        try:
            orig, lines, ch, target_max = patch_file(f, args.max_if)

            # optionally add vendor scalars now that we know max_if
            if args.add_vendor_scalars:
                for oid, typ, val in UBNT_SCALARS:
                    lines, appended = replace_or_append(lines, oid, typ, val)
                    if appended:
                        ch = True

            if ch:
                bak = backup(f)
                write(f, lines)
                print(f"  backed up -> {bak.name}; written (ensured if up to {target_max})")
                changed_count += 1
            else:
                print("  no change needed")
        except Exception as e:
            print(f"  error patching {f.name}: {e}")

    print(f"done. changed {changed_count}/{len(files)} files")

if __name__ == "__main__":
    main()
