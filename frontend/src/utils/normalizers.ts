// defensive normalizers: map backend shapes to the frontend's canonical fields.
// keep small, easy to extend.

type AnyObj = Record<string, any>;

function asNumber(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIsoString(ts: any): string | null {
  if (ts === null || ts === undefined) return null;

  // already ISO-like
  if (typeof ts === 'string' && ts.includes('T')) return ts;

  // numeric seconds (10 digits) or ms (13+)
  if (typeof ts === 'number') {
    const s = String(ts).length;
    if (s <= 10) return new Date(ts * 1000).toISOString();
    return new Date(ts).toISOString();
  }

  // try Date coercion
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}

  // fallback to string
  return String(ts) || null;
}

// ---- device normalizer ----
export function normalizeDevice(raw: AnyObj) {
  return {
    device_ip: raw.device_ip || raw.ip || raw.ip_address || raw.host || raw.host_ip || null,
    hostname: raw.hostname || raw.host_name || raw.name || raw.device_name || '',
    vendor: raw.vendor || raw.manufacturer || '',
    os: raw.os || raw.os_version || raw.version || '',
    status: (raw.status || raw.state || raw.reachability || 'unknown').toLowerCase(),
    last_seen: toIsoString(raw.last_seen || raw.last_seen_ts || raw.last_seen_at || raw.last_updated || raw.timestamp || null),
    description: raw.description || raw.desc || ''
  };
}

export function normalizeDevicesArray(list: AnyObj[] = []) {
  return list.map(normalizeDevice);
}

// ---- performance normalizer ----
export function normalizePerformancePoint(p: AnyObj) {
  const cpu = p.cpu_pct ?? p.cpu ?? p.cpu_percent ?? p.cpu_usage ?? null;
  const memory = p.memory_pct ?? p.memory ?? p.mem ?? p.mem_pct ?? null;

  const ts = p.timestamp ?? p.time ?? p.ts ?? p.last_updated ?? p.last_updated_raw ?? p.created_at ?? null;

  return {
    device_ip: p.device_ip || p.ip || null,
    cpu_pct: asNumber(cpu),
    memory_pct: asNumber(memory),
    uptime_secs: asNumber(p.uptime_secs ?? p.uptime_seconds ?? p.uptime ?? p.uptime_seconds),
    timestamp: toIsoString(ts)
  };
}

export function normalizePerformanceArray(list: AnyObj[] = []) {
  return list.map(normalizePerformancePoint);
}

// ---- traffic normalizer ----
export function normalizeTrafficPoint(p: AnyObj) {
  let in_kbps = p.inbound_kbps ?? p.in_kbps ?? p.in_bps ?? p.in_bps_rate ?? p.in_bps_total ?? null;
  let out_kbps = p.outbound_kbps ?? p.out_kbps ?? p.out_bps ?? p.out_bps_rate ?? p.out_bps_total ?? null;

  const maybeInOctets = p.in_octets ?? p.inOctets ?? p.ifInOctets ?? null;
  const maybeOutOctets = p.out_octets ?? p.outOctets ?? p.ifOutOctets ?? null;

  if ((in_kbps === null || in_kbps === 0) && maybeInOctets) {
    // best-effort convert octets -> kilobits (octets * 8 / 1024)
    in_kbps = asNumber(maybeInOctets) * 8 / 1024;
  }
  if ((out_kbps === null || out_kbps === 0) && maybeOutOctets) {
    out_kbps = asNumber(maybeOutOctets) * 8 / 1024;
  }

  // if numbers are massive (bps or counters), apply a simple heuristic convert
  if (in_kbps && in_kbps > 1e6) in_kbps = in_kbps / 1024;
  if (out_kbps && out_kbps > 1e6) out_kbps = out_kbps / 1024;

  const ts = p.timestamp ?? p.time ?? p.ts ?? p.last_updated ?? p.last_seen ?? null;

  return {
    device_ip: p.device_ip || p.ip || null,
    interface_name: p.interface_name || p.iface_name || p.if_descr || p.iface || p.ifname || '',
    inbound_kbps: Number(in_kbps ?? 0),
    outbound_kbps: Number(out_kbps ?? 0),
    in_errors: asNumber(p.in_errors ?? p.inErrors ?? p.ifInErrors ?? 0),
    out_errors: asNumber(p.out_errors ?? p.outErrors ?? p.ifOutErrors ?? 0),
    errors: asNumber(p.errors ?? (p.in_errors ?? p.inErrors ?? 0) + (p.out_errors ?? p.outErrors ?? 0)),
    timestamp: toIsoString(ts)
  };
}

export function normalizeTrafficArray(list: AnyObj[] = []) {
  return list.map(normalizeTrafficPoint);
}

// ---- alerts normalizer ----
export function normalizeAlert(a: AnyObj) {
  return {
    id: a.id || a.alert_id || a.uuid || null,
    device_ip: a.device_ip || a.ip || a.host || null,
    message: a.message || a.msg || a.description || '',
    level: (a.level || a.severity || 'info').toLowerCase(),
    created_at: toIsoString(a.created_at || a.timestamp || a.created || null),
    acknowledged: !!(a.acknowledged || a.ack || a.acknowledged_at)
  };
}

export function normalizeAlertsArray(list: AnyObj[] = []) {
  return list.map(normalizeAlert);
}
