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

// ---- config ----
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// ---- api client ----
export const apiClient = {
  async getRecentAlerts(limit = 10): Promise<Alert[]> {
    const res = await fetch(`${BASE_URL}/alerts/recent?limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return mockApi.getDashboardMetrics();
  },

  async getDevices(): Promise<Device[]> {
    return mockApi.getDevices();
  },

  async getPerformance(deviceId: string): Promise<Performance[]> {
    return mockApi.getPerformance(deviceId);
  },

  async getTraffic(deviceId: string): Promise<Traffic[]> {
    return mockApi.getTraffic(deviceId);
  },

  async getSession(): Promise<Session> {
    return mockApi.getSession();
  },

  async getHealth(): Promise<HealthStatus[]> {
    return mockApi.getHealth();
  },
};
