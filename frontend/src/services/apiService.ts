// src/services/apiService.ts

import {
  Device,
  Session,
  Alert,
  HealthStatus,
  PerformanceMetrics,
  PerformanceHistory,
  TrafficData,
  TrafficHistory,
  DashboardMetrics,
  SNMPData
} from '../types/types';

// API config
const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const USE_MOCK = import.meta.env.VITE_MOCK === 'true';
const SHORT_TTL_MS = 7000;
const _cache = new Map<string, { ts: number; data: any }>();
const _inflight = new Map<string, Promise<any>>();
// use env value for batching tower detail fetches (was added)
const TOWER_BATCH = Number(import.meta.env.VITE_TOWER_BATCH) || 6;

// Retry with exponential backoff
async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i === maxRetries) throw lastError;
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

async function cachedRequest<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
  const cached = cacheGet(cacheKey);
  if (cached) return cached as T;
  const inflight = _inflight.get(cacheKey);
  if (inflight) return inflight as Promise<T>;
  const p = (async () => {
    try {
      const res = await fn();
      cacheSet(cacheKey, res);
      return res;
    } finally {
      _inflight.delete(cacheKey);
    }
  })();
  _inflight.set(cacheKey, p);
  return p;
}

// Generic API request wrapper
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  return exponentialBackoff(async () => {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText} (${response.status})`);
    }
    return response.json();
  });
}


// helper: normalize tower key (used for grouping)
function normalizeTowerKey(raw?: any) {
  if (!raw) return 'ungrouped';
  const s = String(raw).trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return s;
}
function titleCase(s: string) {
  return s.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ');
}


// returns array of { name: string, device_count: number, devices: Device[] }
async function getTowers(): Promise<{ name: string; devices: Device[] }[]> {
  // reuse cached discovery list to avoid extra network I/O
  const devices = await apiService.getDevices();
  // determine tower name: prefer explicit tower field, else hostname starting with 'tower'
  const map = new Map<string, Device[]>();
  for (const d of devices) {
    const hn = (d.hostname || '').toString();
    let towerRaw = d['tower'] ?? null;
    if (!towerRaw) {
      const m = hn.match(/^(tower\s*\d+|tower-\d+|tower\d+)/i);
      if (m) towerRaw = m[0];
    }
    const key = normalizeTowerKey(towerRaw);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }

  // filter out the generic 'ungrouped' bucket so the widget only shows named towers
  const result = Array.from(map.entries())
    .filter(([key]) => key !== 'ungrouped')
    .map(([key, devs]) => ({ name: titleCase(key), devices: devs }));

  // debug: remove or comment out in production
  // eslint-disable-next-line no-console
  console.debug('[apiService.getTowers] towers:', result.map(r => ({ name: r.name, count: r.devices.length })));

  return result;
}

// ---------------------------
// ip / cidr helpers (ipv4 only)
// ---------------------------
function ipToInt(ip: string): number | null {
  if (!ip || typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(p => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 ? n : NaN;
  });
  if (nums.some(n => Number.isNaN(n))) return null;
  // convert to 32-bit integer
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

function parseCidr(cidr: string): { baseInt: number; maskLen: number } | null {
  if (!cidr || typeof cidr !== 'string') return null;
  const [base, mask] = cidr.trim().split('/');
  const baseInt = ipToInt(base);
  const maskLen = mask ? Number(mask) : 32;
  if (baseInt === null || !Number.isInteger(maskLen) || maskLen < 0 || maskLen > 32) return null;
  return { baseInt, maskLen };
}

function cidrMatch(ip: string, cidr: string): boolean {
  const ipInt = ipToInt(ip);
  const parsed = parseCidr(cidr);
  if (ipInt === null || !parsed) return false;
  const { baseInt, maskLen } = parsed;
  if (maskLen === 0) return true;
  const mask = maskLen === 32 ? 0xffffffff >>> 0 : (~0 << (32 - maskLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// ---------------------------
// getIPGroups: group devices by given cidr list or auto /24
// ---------------------------
/**
 * group devices by IP ranges.
 *
 * - ranges: array of either "10.0.1.0/24" strings or objects { name: 'site-a', cidr: '10.0.1.0/24' }
 * - when ranges is omitted or empty, function auto-buckets by /24 using device IPs (e.g. 10.0.2.5 -> '10.0.2.0/24')
 *
 * returns same shape as getTowers(): [{ name, devices }]
 */
async function getIPGroups(
  ranges?: Array<string | { name?: string; cidr: string }>
): Promise<{ name: string; devices: Device[] }[]> {
  const devices = await apiService.getDevices();

  // normalize ranges into consistent objects
  let buckets: { name: string; cidr: string }[] = [];
  if (Array.isArray(ranges) && ranges.length) {
    buckets = ranges.map(r => {
      if (typeof r === 'string') {
        return { name: r, cidr: r };
      } else {
        return { name: (r.name ?? r.cidr), cidr: r.cidr };
      }
    });
  } else {
    // auto bucket: build /24 buckets from devices
    const seen = new Set<string>();
    for (const d of devices) {
      const ip = d.device_ip ?? d.ip ?? '';
      const ipInt = ipToInt(ip);
      if (ipInt === null) continue;
      // extract first three octets to form x.y.z.0/24
      const parts = ip.trim().split('.');
      if (parts.length === 4) {
        const cidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        if (!seen.has(cidr)) {
          seen.add(cidr);
          buckets.push({ name: cidr, cidr });
        }
      }
    }
  }

  // create map for buckets
  const map = new Map<string, Device[]>();
  for (const b of buckets) map.set(b.name, []);

  // fallback ungrouped bucket
  map.set('ungrouped', []);

  // assign devices to first matching bucket (order matters)
  for (const d of devices) {
    const ip = d.device_ip ?? d.ip ?? '';
    let matched = false;
    for (const b of buckets) {
      try {
        if (cidrMatch(ip, b.cidr)) {
          map.get(b.name)!.push(d);
          matched = true;
          break;
        }
      } catch {
        // skip malformed cidr
      }
    }
    if (!matched) map.get('ungrouped')!.push(d);
  }

  // result: keep all buckets but move 'ungrouped' to the end
  const result: { name: string; devices: Device[] }[] = [];
  for (const b of buckets) {
    const devs = map.get(b.name) || [];
    // skip empty buckets optionally? keep non-empty only for now to match previous widget behaviour
    if (devs.length > 0) result.push({ name: b.name, devices: devs });
  }
  const un = map.get('ungrouped') || [];
  if (un.length > 0) result.push({ name: 'ungrouped', devices: un });

  // debug
  // eslint-disable-next-line no-console
  console.debug('[apiService.getIPGroups] buckets:', result.map(r => ({ name: r.name, count: r.devices.length })));

  return result;
}




// helper: robust extraction of throughput (kbps) from different backend shapes
function sampleThroughputKbps(sample: any) {
  // prefer explicit kbps fields
  const inKbps = sample.inbound_kbps ?? sample.in_kbps ?? sample.inbound ?? null;
  const outKbps = sample.outbound_kbps ?? sample.out_kbps ?? sample.outbound ?? null;
  if ((inKbps != null) || (outKbps != null)) {
    return (Number(inKbps || 0) + Number(outKbps || 0));
  }

  // fallback: if sample already reports octets for an interval, best-effort convert using a sensible default
  const inOctets = sample.in_octets ?? sample.in_bytes ?? null;
  const outOctets = sample.out_octets ?? sample.out_bytes ?? null;
  if ((inOctets != null) || (outOctets != null)) {
    // assume this sample represents total bytes for a reporting interval.
    // we don't know the interval; use 3600s as a safe fallback (kbps ~ kilobits-per-second).
    const seconds = sample.interval_seconds ?? 3600;
    const kbps = (((Number(inOctets || 0) + Number(outOctets || 0)) * 8) / (seconds * 1000)) || 0;
    return kbps;
  }

  // last-resort: if there are packet counters, return a small proportional value (not ideal)
  const inPackets = sample.in_packets ?? 0;
  const outPackets = sample.out_packets ?? 0;
  if (inPackets || outPackets) return (inPackets + outPackets) * 0.01;

  return 0;
}

// aggregated overview for a tower (lazy loads details for devices)
// changed default batchSize to use TOWER_BATCH constant
async function getTowerOverview(towerName: string, batchSize = TOWER_BATCH) {
  const towers = await getTowers();
  // try matching both title-cased and normalized names so callers like 'Tower 1' or 'tower 1' both work
  const normalizedTarget = normalizeTowerKey(towerName);
  const tower = towers.find(t => normalizeTowerKey(t.name) === normalizedTarget);
  if (!tower) return null;

  // batched lazy fetch details for devices in the tower (cached)
  const detailResults: any[] = [];
  for (let i = 0; i < tower.devices.length; i += batchSize) {
    const batch = tower.devices.slice(i, i + batchSize).map(d =>
      cachedRequest(`device::${d.device_ip}`, () => apiService.getDeviceDetails(d.device_ip))
    );
    // wait for this batch to finish before starting the next one
    // eslint-disable-next-line no-await-in-loop
    const resolved = await Promise.all(batch.map(p => p.catch(() => null)));
    detailResults.push(...resolved);
  }
  const details = detailResults;

  // small helper: compute a best-effort latest throughput (kbps) for a single device detail
  function computeLatestThroughput(det: any) {
    if (!det) return 0;
    // 1) latest_per_interface with explicit kbps
    if (Array.isArray(det.latest_per_interface) && det.latest_per_interface.length) {
      let sum = 0;
      for (const it of det.latest_per_interface) {
        const inK = Number(it.inbound_kbps ?? it.in_kbps ?? it.inbound ?? 0) || 0;
        const outK = Number(it.outbound_kbps ?? it.out_kbps ?? it.outbound ?? 0) || 0;
        if (inK || outK) { sum += inK + outK; continue; }

        // if only octets are present, convert using interval_seconds (fallback 3600s)
        const inOct = Number(it.in_octets ?? it.in_bytes ?? 0);
        const outOct = Number(it.out_octets ?? it.out_bytes ?? 0);
        if (inOct || outOct) {
          const secs = Number(it.interval_seconds ?? 3600) || 3600;
          sum += (((inOct + outOct) * 8) / (secs * 1000));
        }
      }
      if (sum) return sum;
    }

    // 2) traffic_history: take the latest sample with kbps fields or compute delta with previous
    if (Array.isArray(det.traffic_history) && det.traffic_history.length) {
      const hist = det.traffic_history.slice().sort((a: any, b: any) => {
        const ta = Date.parse(String(a.timestamp ?? a.ts ?? a.time)) || 0;
        const tb = Date.parse(String(b.timestamp ?? b.ts ?? b.time)) || 0;
        return ta - tb;
      });
      const last = hist[hist.length - 1];
      if (last) {
        const inK = Number(last.inbound_kbps ?? last.in_kbps ?? last.inbound ?? 0);
        const outK = Number(last.outbound_kbps ?? last.out_kbps ?? last.outbound ?? 0);
        if (inK || outK) return inK + outK;

        // try delta using previous sample
        const prev = hist.length > 1 ? hist[hist.length - 2] : null;
        const curBytes = Number(last.in_octets ?? last.in_bytes ?? 0) + Number(last.out_octets ?? last.out_bytes ?? 0);
        const prevBytes = prev ? (Number(prev.in_octets ?? prev.in_bytes ?? 0) + Number(prev.out_octets ?? prev.out_bytes ?? 0)) : NaN;
        if (!Number.isNaN(prevBytes) && prev) {
          const tcur = Date.parse(String(last.timestamp ?? last.ts ?? last.time)) || 0;
          const tprev = Date.parse(String(prev.timestamp ?? prev.ts ?? prev.time)) || 0;
          const deltaSec = Math.max(1, Math.floor((tcur - tprev) / 1000));
          const deltaBytes = Math.max(0, curBytes - prevBytes);
          return ((deltaBytes * 8) / (deltaSec * 1000)) || 0;
        }

        // fallback single-sample conversion assuming interval_seconds or 3600s
        const secs = Number(last.interval_seconds ?? 3600) || 3600;
        if (curBytes) return (((curBytes) * 8) / (secs * 1000)) || 0;
      }
    }

    // 3) snapshot or top-level throughput fields
    const snap = det?.snapshot ?? {};
    const inK = Number(snap.inbound_kbps ?? snap.in_kbps ?? snap.inbound ?? 0);
    const outK = Number(snap.outbound_kbps ?? snap.out_kbps ?? snap.outbound ?? 0);
    if (inK || outK) return inK + outK;

    // 4) last-resort: use any provided latest_throughput field if present
    if (typeof det.latest_throughput === 'number') return Number(det.latest_throughput);

    return 0;
  }

  // aggregate
  const counts = { total: 0, up: 0, down: 0 };
  let cpuSum = 0, cpuCnt = 0, memSum = 0, memCnt = 0, rssiSum = 0, rssiCnt = 0;
  const trafficSpark: { ts: string; throughput: number }[] = []; // small array of { ts, throughput }
  const deviceList: { device_ip: string; hostname: string; status: string }[] = [];

  for (const [i, d] of tower.devices.entries()) {
    const det = details[i];
    counts.total += 1;

    // resolve device status: prefer detail status/snapshot, fallback to top-level device keys
    const detStatus = det?.status ?? det?.snapshot?.status ?? null;
    const topStatus = d.status ?? (d.online ? 'up' : 'down');
    const status = (detStatus ?? topStatus) as string;

    if (status === 'up') counts.up += 1;
    else counts.down += 1;

    // cpu & memory from snapshot preferred, else top-level values
    if (det?.snapshot?.cpu_pct != null) { cpuSum += Number(det.snapshot.cpu_pct); cpuCnt++; }
    else if (typeof d.cpu_pct === 'number') { cpuSum += Number(d.cpu_pct); cpuCnt++; }

    if (det?.snapshot?.memory_pct != null) { memSum += Number(det.snapshot.memory_pct); memCnt++; }
    else if (typeof d.memory_pct === 'number') { memSum += Number(d.memory_pct); memCnt++; }

    // top-level signal or snapshot.signal
    const sig = det?.signal ?? det?.snapshot?.signal ?? d.signal ?? null;
    if (sig && sig.rssi_dbm != null) { rssiSum += Number(sig.rssi_dbm); rssiCnt++; }
    
    // compute and attach latest_throughput (kbps) to detail object for frontend consumption
    try {
      const latestKbps = computeLatestThroughput(det);
      if (det && typeof det === 'object') det.latest_throughput = latestKbps;
    } catch {
      /* noop - defensive */
    }

    // traffic sparkline: aggregate per-device traffic_history into a time-series (kbps)
    if (Array.isArray(det?.traffic_history) && det.traffic_history.length) {
      // sort ascending by time to allow delta calculations
      const hist = det.traffic_history.slice().map((s: any) => ({
        ...s,
        ts: s.timestamp ?? s.time ?? s.ts ?? null,
      })).filter((s: any) => s.ts).sort((a: any, b: any) => {
        const ta = Date.parse(String(a.ts)) || 0;
        const tb = Date.parse(String(b.ts)) || 0;
        return ta - tb;
      });

      // if the sample has kbps fields, use them directly; if only octet counters exist, compute delta between consecutive samples
      for (let j = 0; j < hist.length; j++) {
        const cur = hist[j];
        let throughput = 0;

        // if sample contains explicit kbps, use it
        const kbpsVal = sampleThroughputKbps(cur);
        if (kbpsVal && kbpsVal > 0) {
          throughput = kbpsVal;
        } else {
          // try delta method with previous sample when octet counters are present
          const prev = hist[j - 1];
          const curIn = Number(cur.in_octets ?? cur.in_bytes ?? NaN);
          const curOut = Number(cur.out_octets ?? cur.out_bytes ?? NaN);
          const prevIn = prev ? Number(prev.in_octets ?? prev.in_bytes ?? NaN) : NaN;
          const prevOut = prev ? Number(prev.out_octets ?? prev.out_bytes ?? NaN) : NaN;

          if (!Number.isNaN(curIn) && !Number.isNaN(prevIn) && (typeof cur.ts === 'string') && prev) {
            const ta = Date.parse(String(prev.ts)) || 0;
            const tb = Date.parse(String(cur.ts)) || 0;
            const deltaSec = Math.max(1, Math.floor((tb - ta) / 1000));
            const deltaBytes = Math.max(0, (curIn + curOut) - (prevIn + prevOut));
            throughput = ((deltaBytes * 8) / (deltaSec * 1000)) || 0; // kbps
          } else {
            // fallback single-sample approximation
            throughput = sampleThroughputKbps(cur);
          }
        }

        // bucket timestamp to hour (ISO hour) so devices align on the same time axis
        let bucketTs: string;
        try {
          const d = new Date(String(cur.ts));
          if (!isNaN(+d)) {
            bucketTs = d.toISOString().slice(0, 13) + ':00:00'; // YYYY-MM-DDTHH:00:00Z
          } else {
            bucketTs = String(cur.ts);
          }
        } catch {
          bucketTs = String(cur.ts);
        }

        const idx = trafficSpark.findIndex(t => t.ts === bucketTs);
        if (idx === -1) trafficSpark.push({ ts: bucketTs, throughput });
        else trafficSpark[idx].throughput += throughput;
      }
    } else if (Array.isArray(det?.latest_per_interface) && det.latest_per_interface.length) {
      // fallback: single-point samples from latest_per_interface - still include them but they may produce a flat line
      for (const lp of det.latest_per_interface) {
        const ts = lp.timestamp ? String(lp.timestamp) : new Date().toISOString();
        const throughput = (Number(lp.inbound_kbps || 0) + Number(lp.outbound_kbps || 0)) || sampleThroughputKbps(lp);
        const bucketTs = (() => {
          const d = new Date(String(ts));
          return isNaN(+d) ? String(ts) : d.toISOString().slice(0,13) + ':00:00';
        })();
        const idx = trafficSpark.findIndex(t => t.ts === bucketTs);
        if (idx === -1) trafficSpark.push({ ts: bucketTs, throughput });
        else trafficSpark[idx].throughput += throughput;
      }
    }

    deviceList.push({
      device_ip: d.device_ip,
      hostname: d.hostname ?? d.name ?? d.device_ip,
      status: status ?? 'unknown',
    });
  }

  const avgCpu = cpuCnt ? cpuSum / cpuCnt : null;
  const avgMemory = memCnt ? memSum / memCnt : null;
  const avgRssi = rssiCnt ? rssiSum / rssiCnt : null;

  // normalize sparkline array sorted by unix time when possible
  trafficSpark.sort((a, b) => {
    const ta = Date.parse(String(a.ts)) || 0;
    const tb = Date.parse(String(b.ts)) || 0;
    if (ta && tb) return ta - tb;
    return String(a.ts).localeCompare(String(b.ts));
  });

  // debug: log overview for troubleshooting
  // eslint-disable-next-line no-console
  console.debug('[apiService.getTowerOverview]', towerName, { counts, deviceListCount: deviceList.length, trafficPoints: trafficSpark.length });

  return { towerName: titleCase(normalizeTowerKey(towerName)), counts, avgCpu, avgMemory, avgRssi, trafficSpark, devices: tower.devices, details, deviceList };
}



// Mock data
const mockData = {
  devices: [
    {
      device_ip: '192.168.1.1',
      hostname: 'router-core-01',
      vendor: 'Cisco',
      os: 'IOS-XE',
      status: 'up',
      last_seen: new Date().toISOString(),
      cpu_pct: 45,
      memory_pct: 65,
      interfaces: [
        { interface_name: 'GigabitEthernet0/0', description: 'WAN Link', status: 'up', speed: 1000, duplex: 'full' },
        { interface_name: 'GigabitEthernet0/1', description: 'LAN Core', status: 'up', speed: 1000, duplex: 'full' },
      ],
    },
    {
      device_ip: '192.168.1.2',
      hostname: 'switch-access-01',
      vendor: 'Juniper',
      os: 'JunOS',
      status: 'up',
      last_seen: new Date().toISOString(),
      cpu_pct: 25,
      memory_pct: 40,
      interfaces: [
        { interface_name: 'ge-0/0/0', description: 'Uplink to Core', status: 'up', speed: 1000, duplex: 'full' },
        { interface_name: 'ge-0/0/1', description: 'Access Port 1', status: 'up', speed: 100, duplex: 'full' },
      ],
    },
  ] as Device[],

  performance: [
    { device_ip: '192.168.1.1', cpu_pct: 45, memory_pct: 65, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.2', cpu_pct: 25, memory_pct: 40, timestamp: new Date().toISOString() },
  ] as PerformanceMetrics[],

  traffic: [
    { device_ip: '192.168.1.1', interface_name: 'GigabitEthernet0/0', in_octets: 1250000, out_octets: 980000, in_packets: 12500, out_packets: 9800, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.2', interface_name: 'ge-0/0/0', in_octets: 800000, out_octets: 750000, in_packets: 8000, out_packets: 7500, timestamp: new Date().toISOString() },
  ] as TrafficData[],

  sessions: [
    { session_id: 'sess_001', device_ip: '192.168.1.1', username: 'admin', start_time: new Date(Date.now() - 3600000).toISOString(), last_activity: new Date().toISOString(), protocol: 'SSH', status: 'active', authenticated_via: 'ssh' },
  ] as Session[],

  alerts: [
    { id: '1', device_ip: '192.168.1.1', severity: 'critical', message: 'High CPU utilization', timestamp: new Date().toISOString(), acknowledged: false, category: 'performance' },
  ] as Alert[],

  health: {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: { discovery: 'up', performance: 'up', traffic: 'up', access: 'up', alerts: 'up' },
  } as HealthStatus,
};

// Normalizer to unify backend payloads
function normalizeDevice(d: any): Device {
  const ipVal = d.ip ?? d.device_ip ?? d.deviceIp ?? d.device ?? 'unknown';
  // normalize status to a simple lowercase value and prefer explicit online if present
  const rawStatus = (d.status ?? (typeof d.online === 'boolean' ? (d.online ? 'up' : 'down') : undefined));
  const statusNormalized = rawStatus ? String(rawStatus).trim().toLowerCase() : 'unknown';

  const lastSeenRaw = d.last_seen ?? d.lastSeen ?? d.timestamp ?? d.time ?? null;
  const lastSeen = lastSeenRaw && !isNaN(Date.parse(String(lastSeenRaw))) ? String(lastSeenRaw) : null;

  // signal extraction (support multiple possible backend shapes)
  const rssi_dbm = d.rssi_dbm ?? d.rssiDbm ?? d.rssi_db ?? d.signal?.rssi_dbm ?? d.signal_dbm ?? d.rssi ?? null;
  const rssi_pct = d.rssi_pct ?? d.rssiPct ?? d.signal?.rssi_pct ?? d.signal_pct ?? d.rssi_percent ?? null;
  const snr_db = d.snr_db ?? d.snrDb ?? d.signal?.snr_db ?? null;

  const signal = {
    rssi_dbm: typeof rssi_dbm === 'number' ? rssi_dbm : (rssi_dbm != null ? Number(rssi_dbm) : undefined),
    rssi_pct: typeof rssi_pct === 'number' ? rssi_pct : (rssi_pct != null ? Number(rssi_pct) : undefined),
    snr_db: typeof snr_db === 'number' ? snr_db : (snr_db != null ? Number(snr_db) : undefined),
  };

  return {
    ...d,
    // canonical keys the rest of the app expects
    ip: ipVal,
    device_ip: d.device_ip ?? ipVal,
    hostname: d.hostname ?? d.name ?? '—',
    vendor: d.vendor ?? d.manufacturer ?? '—',
    os: d.os ?? d.os_version ?? '—',
    status: statusNormalized,
    online: typeof d.online === 'boolean' ? d.online : (statusNormalized === 'up'),
    last_seen: lastSeen,
    lastSeen: lastSeen, // keep camelCase copy for components expecting it
    cpu_pct: d.cpu_pct ?? d.cpu ?? null,
    memory_pct: d.memory_pct ?? d.memory ?? null,
    signal,
  } as Device;
}

function cacheGet(key: string) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > SHORT_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return e.data;
}
function cacheSet(key: string, data: any) {
  _cache.set(key, { ts: Date.now(), data });
}

// small helper for ISO coercion
function toIsoStringSafe(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  try {
    const d = new Date(v);
    return isNaN(+d) ? '' : d.toISOString();
  } catch {
    return '';
  }
}

// API service
export const apiService = {
  // Devices
  async getDevices(): Promise<Device[]> {
    if (USE_MOCK) return mockData.devices.map(normalizeDevice);
    return cachedRequest('devices::list', async () => {
      const raw = await apiRequest<Device[]>('/discovery/devices');
      return raw.map(normalizeDevice);
    });
  },
  
  async getDeviceByIp(ip: string): Promise<Device | null> {
    if (USE_MOCK) {
      const dev = mockData.devices.find(d => d.device_ip === ip);
      return dev ? normalizeDevice(dev) : null;
    }
  const rawList = await cachedRequest('devices::list', async () => {
    const raw = await apiRequest<Device[]>('/discovery/devices');
    return raw;
  });
  const found = (rawList || []).find((x: any) => x.device_ip === ip || x.ip === ip);
  return found ? normalizeDevice(found) : null;
  },

  // Performance
  async getPerformance(): Promise<PerformanceMetrics[]> {
    return USE_MOCK ? mockData.performance : apiRequest<PerformanceMetrics[]>('/performance');
  },

  async getPerformanceHistory(deviceIp: string, hours = 24): Promise<PerformanceHistory> {
    if (USE_MOCK) {
      const history = [...Array(hours)].map((_, i) => ({
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        cpu_pct: 20 + Math.random() * 50,
        memory_pct: 40 + Math.random() * 40,
      }));
      return { device_ip: deviceIp, history };
    }
    return apiRequest<PerformanceHistory>(`/performance/history?device_ip=${deviceIp}&hours=${hours}`);
  },

  // Traffic
  async getTraffic(): Promise<TrafficData[]> {
    return USE_MOCK ? mockData.traffic : apiRequest<TrafficData[]>('/traffic');
  },

  async getTrafficHistory(deviceIp: string, iface: string, hours = 24): Promise<TrafficHistory> {
    if (USE_MOCK) {
      const history = [...Array(hours)].map((_, i) => ({
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        in_octets: 1000 * Math.random() * 1000,
        out_octets: 800 * Math.random() * 1000,
        in_packets: 100 * Math.random() * 100,
        out_packets: 80 * Math.random() * 100,
      }));
      return { device_ip: deviceIp, interface_name: iface, history };
    }
    return apiRequest<TrafficHistory>(`/traffic/history?device_ip=${deviceIp}&interface_name=${iface}&hours=${hours}`);
  },

  // Sessions
  async getSessions(): Promise<Session[]> {
    if (USE_MOCK) return mockData.sessions;

    // backend returns rows shaped like:
    // { user, ip, mac, login_time, logout_time, duration_seconds, authenticated_via, created_at, id }
    // but frontend expects: { session_id, device_ip, username, start_time, last_activity, protocol, status, authenticated_via }

    const raw: any[] = await apiRequest<any[]>('/access/sessions');

    const normalized: Session[] = (raw || []).map((r: any, idx: number) => {
      // change: robust normalization + fallback keys
      const startIso = toIsoStringSafe(r.start_time ?? r.login_time ?? r.login_time_iso ?? r.created_at ?? '');
      const lastIso = toIsoStringSafe(r.last_activity ?? r.logout_time ?? r.logout_time_iso ?? '');
      const status = r.status ?? (r.logout_time ? 'disconnected' : 'active');

      return {
        session_id: String(r.session_id ?? r.id ?? `sess_${idx}_${Math.random().toString(36).slice(2,8)}`),
        device_ip: String(r.device_ip ?? r.ip ?? r.deviceIp ?? ''),
        username: String(r.username ?? r.user ?? ''),
        start_time: startIso || '',
        last_activity: lastIso || '',
        protocol: String(r.protocol ?? r.method ?? ''),
        status: status,
        authenticated_via: r.authenticated_via ?? r.method ?? '',
      } as Session;
    });

    // change: dedupe sessions to prevent duplicate rows showing in UI (keeps the row with the latest last_activity)
    const byKey = new Map<string, Session>();
    for (const s of normalized) {
      const key = (s.session_id && s.session_id !== '') ? s.session_id : `${s.device_ip}|${s.username}|${s.start_time}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, s);
      } else {
        // prefer the entry with later last_activity if available
        const eTime = existing.last_activity ? new Date(existing.last_activity).getTime() : 0;
        const sTime = s.last_activity ? new Date(s.last_activity).getTime() : 0;
        if (sTime >= eTime) {
          byKey.set(key, s);
        }
      }
    }
    const deduped = Array.from(byKey.values());

    return deduped;
  },

  // Alerts
  async getAlerts(limit = 10): Promise<Alert[]> {
    if (USE_MOCK) return mockData.alerts;
    return apiRequest<Alert[]>(`/alerts/recent?limit=${encodeURIComponent(String(limit))}`);
  },

  async acknowledgeAlert(alertId: string): Promise<{ success: boolean }> {
    if (USE_MOCK) {
      const alert = mockData.alerts.find(a => a.id === alertId);
      if (alert) alert.acknowledged = true;
      return { success: true };
    }
    return apiRequest<{ success: boolean }>(`/alerts/${alertId}/acknowledge`, { method: 'POST' });
  },

  // Health
  async getHealth(): Promise<HealthStatus> {
    return USE_MOCK ? mockData.health : apiRequest<HealthStatus>('/health');
  },

  // SNMP
  async getSNMPData(deviceIp: string, oid: string): Promise<SNMPData> {
    if (USE_MOCK) return { sysdescr: `Mock SNMP response for ${oid}`, sysobjectid: oid };
    return apiRequest<SNMPData>(`/snmp/get?device_ip=${deviceIp}&oid=${oid}`);
  },

  async walkSNMP(deviceIp: string, oid: string): Promise<SNMPData> {
    if (USE_MOCK) return { sysobjectid: oid, sysdescr: 'Mock SNMP walk data' };
    return apiRequest<SNMPData>(`/snmp/walk?device_ip=${deviceIp}&oid=${oid}`);
  },

  // Dashboard
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    if (USE_MOCK) {
      const total = mockData.devices.length;
      const up = mockData.devices.filter(d => d.status === 'up').length;
      return {
        total_devices: total,
        devices_up: up,
        devices_down: total - up,
        active_alerts: mockData.alerts.filter(a => !a.acknowledged).length,
        avg_cpu: Math.round(mockData.performance.reduce((s, p) => s + p.cpu_pct, 0) / mockData.performance.length),
        total_throughput: 0,
      };
    }
    return apiRequest<DashboardMetrics>('/dashboard/metrics');
  },

  async getDeviceDetails(deviceIp: string) {
    if (USE_MOCK) {
      const device = mockData.devices.find(d => d.device_ip === deviceIp);
      return device ? {
        device_ip: device.device_ip,
        // add top-level signal plus snapshot-level signal
        signal: {
          rssi_dbm: -60 + Math.floor(Math.random() * 10), // mock -60..-51
          rssi_pct: 70 + Math.floor(Math.random() * 20),  // mock 70..89
          snr_db: 30 + Math.floor(Math.random() * 5),
        },
        snapshot: {
          cpu_pct: Math.round(Math.random() * 100),
          memory_pct: Math.round(Math.random() * 100),
          uptime_seconds: Math.floor(Math.random() * 100000),
          timestamp: new Date().toISOString(),
          signal: {
            rssi_dbm: -60 + Math.floor(Math.random() * 10),
            rssi_pct: 70 + Math.floor(Math.random() * 20),
            snr_db: 30 + Math.floor(Math.random() * 5),
          },
        },
        latest_per_interface: device.interfaces.map(i => ({
          device_ip: device.device_ip,
          interface_name: i.interface_name,
          inbound_kbps: Math.round(Math.random() * 1000),
          outbound_kbps: Math.round(Math.random() * 1000),
          errors: Math.floor(Math.random() * 3),
          timestamp: new Date().toISOString(),
          signal: {
            rssi_dbm: -70 + Math.floor(Math.random() * 15),
            rssi_pct: 50 + Math.floor(Math.random() * 40),
          },
        })),
        performance_history: [...Array(24)].map((_, idx) => ({
          timestamp: new Date(Date.now() - idx * 3600000).toISOString(),
          cpu_pct: Math.random() * 100,
          memory_pct: Math.random() * 100,
        })),
        traffic_history: [...Array(24)].map((_, idx) => ({
          timestamp: new Date(Date.now() - idx * 3600000).toISOString(),
          interface_name: device.interfaces[0].interface_name,
          inbound_kbps: Math.random() * 1000,
          outbound_kbps: Math.random() * 1000,
          errors: Math.floor(Math.random() * 3),
        })),
      } : null;
    }

  const encoded = encodeURIComponent(deviceIp);
  return cachedRequest(`device::${deviceIp}`, async () => {
    const resp = await fetch(`${API_BASE}/devices/${encoded}/details`);
    if (!resp.ok) throw new Error(`Failed to fetch device details: ${resp.statusText}`);
    return resp.json();
  });
  },
  // tower helpers (added)
  getTowers,
  getTowerOverview,
  getIPGroups,
};
