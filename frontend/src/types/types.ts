// frontend/src/types/types.ts

// ---------- Device & Interfaces ----------
export interface Interface {
  interface_name: string;
  description?: string;
  status?: 'up' | 'down' | 'admin-down';
  speed?: number;
  duplex?: string;
  inbound_kbps?: number;
  outbound_kbps?: number;
  errors?: number;
  signal?: Signal;
}

export interface Signal {
  rssi_dbm?: number | null; // e.g. -67
  rssi_pct?: number | null; // 0-100
  snr_db?: number | null;
}

export interface Device {
  id?: string;
  ip?: string;
  device_ip: string;
  hostname?: string;
  vendor?: string;
  model?: string;
  os?: string;
  os_version?: string;
  status?: 'up' | 'down' | 'unknown';
  last_seen?: string;   // backend ISO string
  lastSeen?: string;    // frontend camelCase copy
  description?: string;
  authenticated_via?: string;
  interfaces?: Interface[];
  uptime_seconds?: number;
  online?: boolean;
  error?: string;
  cpu_pct?: number;      
  memory_pct?: number;   
  signal?: Signal;
}

// ---------- Performance ----------
export interface PerformanceMetrics {
  device_ip: string;
  cpu_pct: number;
  memory_pct: number;
  timestamp: string; // ISO string
}

export interface PerformanceHistory {
  device_ip: string;
  history: Array<{
    timestamp: string;
    cpu_pct: number;
    memory_pct: number;
  }>;
}

// ---------- Traffic ----------
export interface TrafficRecord {
  device_ip: string;
  interface_name: string;
  inbound_kbps: number;
  outbound_kbps: number;
  in_packets: number;
  out_packets: number;
  errors: number;
  timestamp: number | string;
}

export interface TrafficData {
  device_ip: string;
  interface_name: string;
  // allow both raw counters and calculated throughput
  in_octets?: number;
  out_octets?: number;
  in_packets?: number;
  out_packets?: number;
  inbound_kbps?: number;
  outbound_kbps?: number;
  in_bps?: number;  // legacy fallback
  out_bps?: number; // legacy fallback
  timestamp?: string;
}

export interface TrafficHistoryPoint {
  timestamp: number | string;
  inbound_kbps?: number;
  outbound_kbps?: number;
  in_bps?: number;  // legacy fallback
  out_bps?: number; // legacy fallback
}

export interface TrafficHistory {
  device_ip: string;
  interface_name: string;
  history: TrafficHistoryPoint[];
}

// ---------- Sessions ----------
export interface Session {
  session_id: string;
  device_ip: string;
  username: string;
  start_time: string;
  last_activity: string;
  protocol: string;
  status: 'active' | 'idle' | 'disconnected' | string;
  authenticated_via?: string;
  duration?: number | null; 
}

// ---------- Alerts ----------
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'low' | 'medium' | 'high';

export interface Alert {
  id: string;
  device_ip?: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  category?: string;
  title?: string;
}

// ---------- SNMP / Health ----------
export interface SNMPData {
  sysdescr?: string;
  sysobjectid?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: { [service: string]: 'up' | 'down' };
}

// ---------- Dashboard ----------
export interface DashboardMetrics {
  total_devices: number;
  devices_up: number;
  devices_down: number;
  active_alerts: number;
  avg_cpu: number;
  total_throughput: number;
}

// ---------- Misc ----------
export interface TimeRange {
  label: string;
  value: string;
  hours: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
  loading?: boolean;
}

export type PerfHistoryEntry = {
  timestamp: string; // ISO
  cpu_pct: number | null;
  memory_pct: number | null;
};

export type TrafficHistoryEntry = {
  timestamp: string; // ISO
  interface_name: string;
  inbound_kbps: number;
  outbound_kbps: number;
  errors: number;
};

export type IfRow = {
  device_ip: string;
  interface_name: string;
  inbound_kbps: number;
  outbound_kbps: number;
  errors: number;
  timestamp?: string;
  signal?: Signal;
};

export type DeviceDetailsResponse = {
  device_ip: string;
  snapshot: { 
    cpu_pct?: number; 
    memory_pct?: number; 
    uptime_seconds?: number; 
    timestamp?: string;
    // allow snapshot-level signal too
    signal?: Signal;
  } | null;
  signal?: Signal; // top-level convenience
  latest_per_interface: IfRow[];
  performance_history: PerfHistoryEntry[];
  traffic_history: TrafficHistoryEntry[];
};
