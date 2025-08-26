import {
  Device,
  Session,
  Alert,
  HealthStatus
} from '../types/types';

// Define interfaces for Performance and Traffic data
interface Performance {
  device_ip: string;
  cpu_pct: number;
  memory_pct: number;
  timestamp: string;
}

interface Traffic {
  device_ip: string;
  interface_name: string;
  inbound_kbps: number;   
  outbound_kbps: number;  
  in_packets: number;
  out_packets: number;
  timestamp: string;
}
// API configuration
const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const USE_MOCK = import.meta.env.VITE_MOCK === 'true';

// Exponential backoff function
async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Generic API request function with retry logic
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  return exponentialBackoff(async () => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText} (${response.status})`);
    }
    
    return response.json();
  });
}

// Mock data for development
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
        { interface_name: 'GigabitEthernet0/2', description: 'DMZ', status: 'up', speed: 1000, duplex: 'full' }
      ]
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
        { interface_name: 'ge-0/0/2', description: 'Access Port 2', status: 'down', speed: 100, duplex: 'full' }
      ]
    },
    {
      device_ip: '192.168.1.3',
      hostname: 'firewall-edge-01',
      vendor: 'Palo Alto',
      os: 'PAN-OS',
      status: 'up',
      last_seen: new Date().toISOString(),
      interfaces: [
        { interface_name: 'ethernet1/1', description: 'Untrust Zone', status: 'up', speed: 1000, duplex: 'full' },
        { interface_name: 'ethernet1/2', description: 'Trust Zone', status: 'up', speed: 1000, duplex: 'full' }
      ]
    }
  ] as Device[],
  
  performance: [
    { device_ip: '192.168.1.1', cpu_pct: 45, memory_pct: 65, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.2', cpu_pct: 25, memory_pct: 40, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.3', cpu_pct: 35, memory_pct: 55, timestamp: new Date().toISOString() }
  ] as Performance[],
  
  traffic: [
    { device_ip: '192.168.1.1', interface_name: 'GigabitEthernet0/0', inbound_kbps: 1250000, outbound_kbps: 980000, in_packets: 12500, out_packets: 9800, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.1', interface_name: 'GigabitEthernet0/1', inbound_kbps: 2500000, outbound_kbps: 1800000, in_packets: 25000, out_packets: 18000, timestamp: new Date().toISOString() },
    { device_ip: '192.168.1.2', interface_name: 'ge-0/0/0', inbound_kbps: 800000, outbound_kbps: 750000, in_packets: 8000, out_packets: 7500, timestamp: new Date().toISOString() }
  ] as Traffic[],

  
  sessions: [
    { session_id: 'sess_001', device_ip: '192.168.1.1', username: 'admin', start_time: new Date(Date.now() - 3600000).toISOString(), last_activity: new Date().toISOString(), protocol: 'SSH', status: 'active' },
    { session_id: 'sess_002', device_ip: '192.168.1.2', username: 'operator', start_time: new Date(Date.now() - 1800000).toISOString(), last_activity: new Date().toISOString(), protocol: 'HTTPS', status: 'active' },
    { session_id: 'sess_003', device_ip: '192.168.1.3', username: 'viewer', start_time: new Date(Date.now() - 900000).toISOString(), last_activity: new Date().toISOString(), protocol: 'HTTPS', status: 'active' }
  ] as Session[],
  
  alerts: [
    { id: '1', device_ip: '192.168.1.1', severity: 'critical', message: 'High CPU utilization', timestamp: new Date(Date.now() - 300000).toISOString(), acknowledged: false, category: 'performance' },
    { id: '2', device_ip: '192.168.1.2', severity: 'warning', message: 'Interface ge-0/0/2 down', timestamp: new Date(Date.now() - 600000).toISOString(), acknowledged: true, category: 'connectivity' },
    { id: '3', device_ip: '192.168.1.3', severity: 'info', message: 'Backup completed successfully', timestamp: new Date(Date.now() - 3600000).toISOString(), acknowledged: false, category: 'system' }
  ] as Alert[],
  
  health: {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      discovery: 'up',
      performance: 'up',
      traffic: 'up',
      access: 'up',
      alerts: 'up'
    }
  } as HealthStatus
};

// API service functions
export const apiService = {
  // Device discovery
  async getDevices(): Promise<Device[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.devices);
    }
    
    return apiRequest<Device[]>('/discovery/devices');
  },
  
  async getDeviceByIp(ip: string): Promise<Device | null> {
    if (USE_MOCK) {
      const device = mockData.devices.find(d => d.device_ip === ip);
      return Promise.resolve(device || null);
    }
    
    return apiRequest<Device>(`/discovery/devices/${ip}`);
  },
  
  // Performance metrics
  async getPerformance(): Promise<Performance[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.performance);
    }
    
    return apiRequest<Performance[]>('/performance');
  },
  
  async getPerformanceHistory(deviceIp: string, hours: number = 24): Promise<Performance[]> {
    if (USE_MOCK) {
      // Generate mock historical data
      const data: Performance[] = [];
      const now = new Date();
      
      for (let i = hours; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
        const baseCpu = 20 + Math.sin(i / 6) * 30 + Math.random() * 10;
        const baseMemory = 40 + Math.cos(i / 8) * 20 + Math.random() * 15;
        
        data.push({
          device_ip: deviceIp,
          cpu_pct: Math.max(0, Math.min(100, baseCpu)),
          memory_pct: Math.max(0, Math.min(100, baseMemory)),
          timestamp: timestamp.toISOString()
        });
      }
      
      return Promise.resolve(data);
    }
    
    return apiRequest<Performance[]>(`/performance/history?device_ip=${deviceIp}&hours=${hours}`);
  },
  
  // Traffic data
  async getTraffic(): Promise<Traffic[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.traffic);
    }
    
    return apiRequest<Traffic[]>('/traffic');
  },
  
  async getTrafficHistory(deviceIp: string, interfaceName: string, hours: number = 24): Promise<Traffic[]> {
    if (USE_MOCK) {
      // Generate mock historical data
      const data: Traffic[] = [];
      const now = new Date();
      
      for (let i = hours; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
        const baseInbound = 50 + Math.sin(i / 4) * 30 + Math.random() * 20;
        const baseOutbound = 30 + Math.cos(i / 4) * 20 + Math.random() * 15;
        
        data.push({
          device_ip: deviceIp,
          interface_name: interfaceName,
          inbound_kbps: Math.max(0, baseInbound * 1000),
          outbound_kbps: Math.max(0, baseOutbound * 1000),
          in_packets: Math.max(0, baseInbound * 100),
          out_packets: Math.max(0, baseOutbound * 100),
          timestamp: timestamp.toISOString()
        });
      }
      
      return Promise.resolve(data);
    }
    
    return apiRequest<Traffic[]>(`/traffic/history?device_ip=${deviceIp}&interface_name=${interfaceName}&hours=${hours}`);
  },
  
  // Access sessions
  async getSessions(): Promise<Session[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.sessions);
    }
    
    return apiRequest<Session[]>('/access/sessions');
  },
  
  // Alerts
  async getAlerts(): Promise<Alert[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.alerts);
    }
    
    return apiRequest<Alert[]>('/alerts');
  },
  
  async acknowledgeAlert(alertId: string): Promise<{ success: boolean }> {
    if (USE_MOCK) {
      // Update mock data
      const alert = mockData.alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
      }
      return Promise.resolve({ success: true });
    }
    
    return apiRequest<{ success: boolean }>(`/alerts/${alertId}/acknowledge`, { method: 'POST' });
  },
  
  // Health status
  async getHealth(): Promise<HealthStatus> {
    if (USE_MOCK) {
      return Promise.resolve(mockData.health);
    }
    
    return apiRequest<HealthStatus>('/health');
  },
  
  // SNMP operations
  async getSNMPData(deviceIp: string, oid: string): Promise<{ device_ip: string; oid: string; value: string; timestamp: string }> {
    if (USE_MOCK) {
      return Promise.resolve({ 
        device_ip: deviceIp, 
        oid, 
        value: `Mock SNMP response for ${oid}`,
        timestamp: new Date().toISOString()
      });
    }
    
    return apiRequest(`/snmp/get?device_ip=${deviceIp}&oid=${oid}`);
  },
  
  async walkSNMP(deviceIp: string, oid: string): Promise<{ device_ip: string; results: Array<{ oid: string; value: string }>; timestamp: string }> {
    if (USE_MOCK) {
      return Promise.resolve({
        device_ip: deviceIp,
        results: [
          { oid: `${oid}.1`, value: 'Mock value 1' },
          { oid: `${oid}.2`, value: 'Mock value 2' },
          { oid: `${oid}.3`, value: 'Mock value 3' }
        ],
        timestamp: new Date().toISOString()
      });
    }
    
    return apiRequest(`/snmp/walk?device_ip=${deviceIp}&oid=${oid}`);
  },
  
  // Dashboard metrics
  async getDashboardMetrics(): Promise<{
    total_devices: number;
    devices_up: number;
    devices_down: number;
    active_alerts: number;
    avg_cpu: number;
    total_throughput: number;
  }> {
    if (USE_MOCK) {
      const devices = mockData.devices;
      const alerts = mockData.alerts;
      const performance = mockData.performance;
      
      const totalDevices = devices.length;
      const devicesUp = devices.filter(d => d.status === 'up').length;
      const activeAlerts = alerts.filter(a => !a.acknowledged).length;
      const avgCpu = performance.reduce((sum, p) => sum + p.cpu_pct, 0) / Math.max(1, performance.length);
      
      return Promise.resolve({
        total_devices: totalDevices,
        devices_up: devicesUp,
        devices_down: totalDevices - devicesUp,
        active_alerts: activeAlerts,
        avg_cpu: Math.round(avgCpu),
        total_throughput: 0 // Would calculate from traffic data
      });
    }
    
    return apiRequest<{
      total_devices: number;
      devices_up: number;
      devices_down: number;
      active_alerts: number;
      avg_cpu: number;
      total_throughput: number;
    }>('/dashboard/metrics');
  }
};