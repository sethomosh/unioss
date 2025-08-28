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
const USE_MOCK = import.meta.env.VITE_MOCK === 'true'; // ✅ fixed toggle

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
    { session_id: 'sess_001', device_ip: '192.168.1.1', username: 'admin', start_time: new Date(Date.now() - 3600000).toISOString(), last_activity: new Date().toISOString(), protocol: 'SSH', status: 'active' },
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

// API service
export const apiService = {
  // Devices
  async getDevices(): Promise<Device[]> {
    return USE_MOCK ? mockData.devices : apiRequest<Device[]>('/discovery/devices');
  },

  async getDeviceByIp(ip: string): Promise<Device | null> {
    if (USE_MOCK) return mockData.devices.find(d => d.device_ip === ip) || null;
    return apiRequest<Device>(`/discovery/devices/${ip}`);
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
    return USE_MOCK ? mockData.sessions : apiRequest<Session[]>('/access/sessions');
  },

  // Alerts
  async getAlerts(): Promise<Alert[]> {
    return USE_MOCK ? mockData.alerts : apiRequest<Alert[]>('/alerts');
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
    if (USE_MOCK) {
      return { sysdescr: `Mock SNMP response for ${oid}`, sysobjectid: oid };
    }
    return apiRequest<SNMPData>(`/snmp/get?device_ip=${deviceIp}&oid=${oid}`);
  },

  async walkSNMP(deviceIp: string, oid: string): Promise<SNMPData> {
    if (USE_MOCK) {
      return { sysobjectid: oid, sysdescr: 'Mock SNMP walk data' };
    }
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
};
