import { mockApi } from "../mocks/mockApi";

// ---- types ----
export interface Device {
  id: string;
  ip: string;
  hostname?: string;
  vendor?: string;
  model?: string;
  os?: string;
  status?: string; // "up" | "down"
  lastSeen?: string;
}

export interface Performance {
  cpu_pct: number;
  memory_pct: number;
  disk_pct?: number;
  timestamp: string;
}

export interface Traffic {
  in_bps: number;
  out_bps: number;
  interface?: string;
  timestamp: string;
}

export interface Session {
  user: string;
  role: string;
  loginTime: string;
}

export interface Alert {
  id: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  acknowledged?: boolean;
  timestamp: string;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
}

export interface DashboardMetrics {
  total_devices: number;
  devices_up: number;
  devices_down: number;
  active_alerts: number;
  avg_cpu: number;
  total_throughput: number;
}

// ---- exports (using mockApi for frontend) ----
export const apiClient = mockApi;
export const getDashboardMetrics = mockApi.getDashboardMetrics.bind(mockApi);
