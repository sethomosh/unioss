// src/utils/api.ts

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
  cpu?: string;
  memory?: string;
  uptime?: string;
  last_updated?: string;
}>> {
  const res = await fetch(`${BASE}/api/performance/devices`);
  if (!res.ok) throw new Error(`Performance failed: ${res.status}`);
  return res.json();
}

/** Traffic */
export async function listTraffic(): Promise<Array<{
  device_ip: string;
  interface_index: number;
  inbound_kbps: string;
  outbound_kbps: string;
  errors: number;
  timestamp: string;
}>> {
  const res = await fetch(`${BASE}/api/traffic/interfaces`);
  if (!res.ok) throw new Error(`Traffic failed: ${res.status}`);
  return res.json();
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
  const res = await fetch(`${BASE}/snmp/get?${params}`);
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
  cpu?: string;
  memory?: string;
  uptime?: string;
  last_updated?: string;
}

export interface Traffic {
  device_ip: string;
  interface_index: number;
  inbound_kbps: string;
  outbound_kbps: string;
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