// src/services/apiService.ts
// ready to replace file — changes marked with `// change:` comments

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
  return {
    ...d,
    os: d.os ?? d.os_version ?? '—',
    hostname: d.hostname ?? '—',
    vendor: d.vendor ?? '—',
    status: d.status ?? (d.online != null ? (d.online ? 'up' : 'down') : 'unknown'),
    last_seen: d.last_seen && !isNaN(Date.parse(d.last_seen))
      ? d.last_seen
      : (d.timestamp && !isNaN(Date.parse(d.timestamp)) ? d.timestamp : null),
    cpu_pct: d.cpu_pct ?? null,
    memory_pct: d.memory_pct ?? null,
  };
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
    const raw = await apiRequest<Device[]>('/discovery/devices');
    return raw.map(normalizeDevice);
  },

  async getDeviceByIp(ip: string): Promise<Device | null> {
    if (USE_MOCK) {
      const dev = mockData.devices.find(d => d.device_ip === ip);
      return dev ? normalizeDevice(dev) : null;
    }
    const d = await apiRequest<Device>(`/discovery/devices/${ip}`);
    return normalizeDevice(d);
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
        authenticated_via: r.authenticated_via ?? r.authenticated_via ?? '',
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
  async getAlerts(limit = 100): Promise<Alert[]> {
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
        snapshot: {
          cpu_pct: Math.random() * 100,
          memory_pct: Math.random() * 100,
          uptime_seconds: Math.floor(Math.random() * 100000),
          timestamp: new Date().toISOString(),
        },
        latest_per_interface: device.interfaces.map(i => ({
          device_ip: device.device_ip,
          interface_name: i.interface_name,
          inbound_kbps: Math.random() * 1000,
          outbound_kbps: Math.random() * 1000,
          errors: Math.floor(Math.random() * 3),
          timestamp: new Date().toISOString(),
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
    const resp = await fetch(`${API_BASE}/devices/${encoded}/details`);
    if (!resp.ok) throw new Error(`Failed to fetch device details: ${resp.statusText}`);
    return resp.json();
  },
};
