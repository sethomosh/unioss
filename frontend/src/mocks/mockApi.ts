import type { Device, Performance, Traffic, Alert, DashboardMetrics } from '../utils/api';

export const mockApi = {
  async getDevices(): Promise<Device[]> {
    return [
      { id: '1', ip: '192.168.1.1', status: 'up', hostname: 'router' },
      { id: '2', ip: '192.168.1.2', status: 'down', hostname: 'switch' },
    ];
  },

  async getPerformance(): Promise<Performance[]> {
    return [
      { cpu_pct: 30, memory_pct: 50, timestamp: new Date().toISOString(), },
      { cpu_pct: 70, memory_pct: 60, timestamp: new Date().toISOString(), },
    ];
  },

  async getTraffic(): Promise<Traffic[]> {
    return [
      { in_bps: 500, out_bps: 200, interface: 'eth0', timestamp: new Date().toISOString() },
      { in_bps: 300, out_bps: 100, interface: 'eth1', timestamp: new Date().toISOString() },
    ];
  },

  async getAlerts(): Promise<Alert[]> {
    return [
      { id: 'a1', message: 'CPU high', severity: 'critical', acknowledged: false, timestamp: new Date().toISOString() },
      { id: 'a2', message: 'Memory warning', severity: 'medium', acknowledged: true, timestamp: new Date().toISOString() },
    ];
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return {
      total_devices: 2,
      devices_up: 1,
      devices_down: 1,
      active_alerts: 1,
      avg_cpu: 50,
      total_throughput: 1100,
    };
  },
};
