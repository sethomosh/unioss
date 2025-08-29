import type {
  Device,
  Performance,
  Traffic,
  Alert,
  DashboardMetrics,
  Session,
  HealthStatus,
} from '../utils/api';

export const mockApi = {
  async getDevices(): Promise<Device[]> {
    return [
      {
        id: '1',
        ip: '192.168.1.1',
        hostname: 'router',
        vendor: 'Cisco',
        model: 'ISR-4321',
        os: 'IOS-XE',
        status: 'up',
        lastSeen: new Date().toISOString(),
      },
      {
        id: '2',
        ip: '192.168.1.2',
        hostname: 'switch',
        vendor: 'HP',
        model: 'ProCurve 2920',
        os: 'ArubaOS',
        status: 'down',
        lastSeen: new Date().toISOString(),
      },
    ];
  },

  async getPerformance(_deviceId?: string): Promise<Performance[]> {
    const now = new Date().toISOString();
    return [
      { cpu_pct: 35, memory_pct: 55, disk_pct: 60, timestamp: now },
      { cpu_pct: 65, memory_pct: 70, disk_pct: 80, timestamp: now },
    ];
  },

  async getTraffic(_deviceId?: string): Promise<Traffic[]> {
    const now = new Date().toISOString();
    return [
      { in_bps: 800, out_bps: 350, interface: 'eth0', timestamp: now },
      { in_bps: 600, out_bps: 200, interface: 'eth1', timestamp: now },
    ];
  },

  async getAlerts(): Promise<Alert[]> {
    const now = new Date().toISOString();
    return [
      {
        id: 'a1',
        message: 'CPU utilization above 80%',
        severity: 'critical',
        acknowledged: false,
        timestamp: now,
      },
      {
        id: 'a2',
        message: 'Interface eth0 high input errors',
        severity: 'high',
        acknowledged: false,
        timestamp: now,
      },
      {
        id: 'a3',
        message: 'Memory usage warning',
        severity: 'medium',
        acknowledged: true,
        timestamp: now,
      },
    ];
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return {
      total_devices: 2,
      devices_up: 1,
      devices_down: 1,
      active_alerts: 2,
      avg_cpu: 50,
      total_throughput: 1750,
    };
  },

  async getSession(): Promise<Session> {
    return {
      user: 'admin',
      role: 'superuser',
      loginTime: new Date().toISOString(),
    };
  },

  async getHealth(): Promise<HealthStatus[]> {
    const now = new Date().toISOString();
    return [
      { status: 'ok', timestamp: now },
      { status: 'degraded', timestamp: now },
    ];
  },
};
