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
export async function listDevices(): Promise<Array<{
  ip: string;
  hostname: string;
  description: string;
  vendor?: string;
  os_version?: string;
  status?: string;
  error?: string;
}>> {
  const res = await fetch(`${BASE}/api/discovery/devices`);
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

/** Performance */
export async function listPerformance(): Promise<Array<{
  ip: string;
  cpu?: number | null;
  memory?: number | null;
  uptime?: string | null;
  last_updated?: string;
}>> {
  const res = await fetch(`${BASE}/api/performance/devices`);
  if (!res.ok) throw new Error(`Performance failed: ${res.status}`);
  return res.json();
}


/** Fetch historical Performance metrics */
export async function listPerformanceHistory(): Promise<Array<{
  device_ip: string;
  timestamp: string;
  cpu_pct: number;
  memory_pct: number;
  uptime_secs: number;
}>> {
  const res = await fetch(`${BASE}/api/performance/history`)
  if (!res.ok) throw new Error(`Perf history failed: ${res.status}`)
  return res.json()
}


/** Traffic */
export async function listTraffic(): Promise<Array<{
  device_ip: string;
  interface_index: number;
  inbound_kbps: number | null;
  outbound_kbps: number | null;
  iface_name: string;          // ← we’ve added iface_name here
  errors: number;
  timestamp: string;
}>> {
  const res = await fetch(`${BASE}/api/traffic/interfaces`);
  if (!res.ok) throw new Error(`Traffic failed: ${res.status}`);
  return res.json();
}



export async function listTrafficHistory(): Promise<Array<{
  device_ip: string;
  interface_index: number;
  timestamp: string;
  inbound_kbps: number | null;
  outbound_kbps: number | null;
  errors: number;
}>> {
  const res = await fetch(`${BASE}/api/traffic/history`)
  if (!res.ok) throw new Error(`Traffic history failed: ${res.status}`)
  return res.json()
}

/** Access sessions */
export async function listSessions(): Promise<Array<{
  user: string;
  ip: string;
  mac: string;
  login_time: string;
  logout_time: string | null;
  duration: number | null;
  authenticated_via: string;
}>> {
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
  //   ↓ we must prepend BASE if your proxy is “/api/snmp/...”
  //    but since vite.config proxies “/snmp” → Flask, this is OK:
  const res = await fetch(`${BASE}/api/snmp/get?${params}`);   
  if (!res.ok) throw new Error(`SNMP GET failed: ${res.status}`);
  return res.json();
}

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
  iface_name: string;           // ← must match what backend now returns
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

/** Get performance info for a single device (by filtering listPerformance) */
export async function getDevicePerformance(
  ip: string
): Promise<Performance | null> {
  const all = await listPerformance();
  return all.find((p) => p.ip === ip) ?? null;
}

/** Get traffic rows for exactly this device_ip */
export async function getDeviceTraffic(ip: string): Promise<Traffic[]> {
  const all = await listTraffic();
  return all.filter((t) => t.device_ip === ip);
}

/** SNMP sysDescr (via /api/snmp/sysdescr) */
export async function getSysDescr(host: string): Promise<string> {
  const res = await fetch(
    `${BASE}/api/snmp/sysdescr?host=${encodeURIComponent(host)}&port=1161`
  );
  if (!res.ok) throw new Error(`SNMP sysDescr failed: ${res.status}`);
  const data = (await res.json()) as { sysdescr: string };
  return data.sysdescr;
}

/** SNMP sysObjectID (via /api/snmp/sysobjectid) */
export async function getSysObjectId(host: string): Promise<string> {
  const res = await fetch(
    `${BASE}/api/snmp/sysobjectid?host=${encodeURIComponent(host)}&port=1161`
  );
  if (!res.ok) throw new Error(`SNMP sysObjectID failed: ${res.status}`);
  const data = (await res.json()) as { sysobjectid: string };
  return data.sysobjectid;
}
