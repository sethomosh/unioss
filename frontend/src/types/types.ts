export interface Device {
  device_ip: string;
  hostname: string;
  vendor: string;
  os: string;
  status: 'up' | 'down' | 'unknown';
  last_seen: string;
  interfaces?: Interface[];
}

export interface Interface {
  interface_name: string;
  description: string;
  status: 'up' | 'down' | 'admin-down';
  speed?: number;
  duplex?: string;
}

export interface PerformanceMetrics {
  device_ip: string;
  cpu_pct: number;
  memory_pct: number;
  timestamp: string;
}

export interface PerformanceHistory {
  device_ip: string;
  history: Array<{
    timestamp: string;
    cpu_pct: number;
    memory_pct: number;
  }>;
}

export interface TrafficData {
  device_ip: string;
  interface_name: string;
  in_octets: number;
  out_octets: number;
  in_packets: number;
  out_packets: number;
  timestamp: string;
}

export interface TrafficHistory {
  device_ip: string;
  interface_name: string;
  history: Array<{
    timestamp: string;
    in_octets: number;
    out_octets: number;
    in_packets: number;
    out_packets: number;
  }>;
}

export interface Session {
  session_id: string;
  device_ip: string;
  username: string;
  start_time: string;
  last_activity: string;
  protocol: string;
  status: 'active' | 'idle' | 'disconnected';
}

export interface Alert {
  id: string;
  device_ip: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  category: string;
}

export interface SNMPData {
  sysdescr?: string;
  sysobjectid?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    [service: string]: 'up' | 'down';
  };
}

export interface DashboardMetrics {
  total_devices: number;
  devices_up: number;
  devices_down: number;
  active_alerts: number;
  avg_cpu: number;
  total_throughput: number;
}

export interface TimeRange {
  label: string;
  value: string;
  hours: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  loading: boolean;
}
