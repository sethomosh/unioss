// frontend/src/utils/api.ts
const BASE = import.meta.env.VITE_API_BASE || '';

export interface JsonResponse {
  status?: string;
  [key: string]: unknown;
}

/** Health check */
export async function getHealth(): Promise<JsonResponse> {
  const res = await fetch(`${BASE}/api/health/`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/** Discovery */
export async function listDevices(): Promise<
  Array<{
    ip: string;
    hostname: string;
    description: string;
    vendor?: string;
    os_version?: string;
    status?: string;
    error?: string;
  }>
> {
  const res = await fetch(`${BASE}/api/discovery/devices`);
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

/** Performance (current metrics) */
export async function listPerformance(): Promise<
  Array<{
    ip: string;
    cpu?: number | null;
    memory?: number | null;
    uptime?: string | null;
    last_updated?: string;
  }>
> {
  const res = await fetch(`${BASE}/api/performance/metrics`);
  if (!res.ok) throw new Error(`Performance failed: ${res.status}`);
  return res.json();
}

/** --- Historical Performance --- */

/** Shape used by the frontend after normalization */
export interface HistoryPoint {
  ip: string;
  cpu?: number | null;
  memory?: number | null;
  timestamp: string;
}

/** Raw row from backend (unknown values) */
type RawRow = Record<string, unknown>;

/** Type guard: unknown -> RawRow[] */
function isRawRowArray(v: unknown): v is RawRow[] {
  if (!Array.isArray(v)) return false;
  return v.every((item) => typeof item === 'object' && item !== null);
}

/** Type guard: object with `history` property that is RawRow[] */
function isObjectWithHistory(v: unknown): v is { history: RawRow[] } {
  if (typeof v !== 'object' || v === null) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAny = v as Record<string, unknown>;
  return 'history' in asAny && isRawRowArray(asAny.history);
}

/** Parse unknown into number|null (handles numeric strings) */
function parseNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalize a raw row into HistoryPoint */
function normalizeRow(r: RawRow): HistoryPoint {
  // Prefer device_ip, fallback to ip, else 'unknown'
  const ip =
    typeof r.device_ip === 'string'
      ? r.device_ip
      : typeof r.ip === 'string'
      ? r.ip
      : 'unknown';

  const cpu = parseNumberOrNull(r.cpu_pct ?? r.cpu);
  const memory = parseNumberOrNull(r.memory_pct ?? r.memory);

  const timestamp =
    typeof r.timestamp === 'string'
      ? r.timestamp
      : typeof r.last_updated === 'string'
      ? r.last_updated
      : new Date().toISOString();

  return {
    ip,
    cpu,
    memory,
    timestamp,
  };
}

/**
 * Fetch and normalize historical performance data.
 *
 * Backend may return either:
 *   - an array of rows: [{ device_ip, cpu_pct, memory_pct, timestamp, ... }, ...]
 *   - or an envelope: { history: [ ...same rows... ] }
 *
 * This function handles both shapes and returns HistoryPoint[] with numeric cpu/memory.
 */
export async function listPerformanceHistory(): Promise<HistoryPoint[]> {
  console.log("api.listPerformanceHistory(): fetching", `${BASE}/api/performance/history`);
  const res = await fetch(`${BASE}/api/performance/history`);
  if (!res.ok) {
    throw new Error(`Performance history failed: ${res.status}`);
  }

  const raw = (await res.json()) as unknown;

  let rows: RawRow[] = [];

  if (isRawRowArray(raw)) {
    rows = raw;
  } else if (isObjectWithHistory(raw)) {
    rows = raw.history;
  } else {
    // unexpected shape — return empty array (defensive)
    return [];
  }

  return rows.map(normalizeRow);
}

/** Traffic */
export async function listTraffic(): Promise<
  Array<{
    device_ip: string;
    interface_index: number;
    inbound_kbps: number | null;
    outbound_kbps: number | null;
    iface_name: string;
    errors: number;
    timestamp: string;
  }>
> {
  const res = await fetch(`${BASE}/api/traffic/interfaces`);
  if (!res.ok) throw new Error(`Traffic failed: ${res.status}`);
  return res.json();
}

export async function listTrafficHistory(): Promise<
  Array<{
    device_ip: string;
    interface_index: number;
    timestamp: string;
    inbound_kbps: number | null;
    outbound_kbps: number | null;
    errors: number;
  }>
> {
  const res = await fetch(`${BASE}/api/traffic/history`);
  if (!res.ok) throw new Error(`Traffic history failed: ${res.status}`);
  return res.json();
}

/** Access sessions */
export async function listSessions(): Promise<
  Array<{
    user: string;
    ip: string;
    mac: string;
    login_time: string;
    logout_time: string | null;
    duration: number | null;
    authenticated_via: string;
  }>
> {
  const res = await fetch(`${BASE}/api/access/sessions`);
  if (!res.ok) throw new Error(`Access sessions failed: ${res.status}`);
  return res.json();
}

/** SNMP generic GET */
export async function snmpGet(
  host: string,
  oid: string,
  community?: string,
  port?: number
): Promise<{ oid: string; value: string }> {
  const params = new URLSearchParams({ host, oid });
  if (community) params.set('community', community);
  if (port) params.set('port', String(port));
  const res = await fetch(`${BASE}/api/snmp/get?${params}`);
  if (!res.ok) throw new Error(`SNMP GET failed: ${res.status}`);
  return res.json();
}

/** Helpers & explicit interfaces for other exports */

export interface Device {
  ip: string;
  hostname: string;
  description: string;
  vendor?: string;
  os_version?: string;
  status?: string;
  error?: string;
}

export interface Performance {
  ip: string;
  cpu?: number | null;
  memory?: number | null;
  uptime?: string | null;
  last_updated?: string;
}

export interface Traffic {
  device_ip: string;
  interface_index: number;
  iface_name: string;
  inbound_kbps: number | null;
  outbound_kbps: number | null;
  errors: number;
  timestamp: string;
}

export interface Session {
  user: string;
  ip: string;
  mac: string;
  login_time: string;
  logout_time: string | null;
  duration: number | null;
  authenticated_via: string;
}

export interface SnmpGetResult {
  oid: string;
  value: string;
}

/** Convenience helpers used elsewhere in the app */
export async function getDevicePerformance(
  ip: string
): Promise<Performance | null> {
  const all = await listPerformance();
  return all.find((p) => p.ip === ip) ?? null;
}

export async function getDeviceTraffic(ip: string): Promise<Traffic[]> {
  const all = await listTraffic();
  return all.filter((t) => t.device_ip === ip);
}

export async function getSysDescr(host: string): Promise<string> {
  const res = await fetch(
    `${BASE}/api/snmp/sysdescr?host=${encodeURIComponent(host)}&port=1161`
  );
  if (!res.ok) throw new Error(`SNMP sysDescr failed: ${res.status}`);
  const data = (await res.json()) as { sysdescr: string };
  return data.sysdescr;
}

export async function getSysObjectId(host: string): Promise<string> {
  const res = await fetch(
    `${BASE}/api/snmp/sysobjectid?host=${encodeURIComponent(host)}&port=1161`
  );
  if (!res.ok) throw new Error(`SNMP sysObjectID failed: ${res.status}`);
  const data = (await res.json()) as { sysobjectid: string };
  return data.sysobjectid;
}
