// frontend/src/mocks/performanceMock.ts

// Import from api.ts since that's where the types are defined
import type { Performance } from '../services/api';

// Since Performance interface in api.ts only has cpu_pct, memory_pct, timestamp
// We need to extend it or create our own interface for the complete data
export interface PerformanceMetric {
  device_ip: string;
  cpu_pct: number;
  memory_pct: number;
  uptime_seconds?: number;
  timestamp: string;
}

export interface PerformanceHistoryPoint {
  device_ip: string;
  timestamp: string;
  cpu_pct: number;
  memory_pct: number;
  uptime_secs?: number;
}

export const performanceDataMock: PerformanceMetric[] = [
  {
    device_ip: '192.168.1.1',
    cpu_pct: 23.5,
    memory_pct: 41.2,
    uptime_seconds: 7200,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.2', 
    cpu_pct: 67.8,
    memory_pct: 82.1,
    uptime_seconds: 14400,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.3',
    cpu_pct: 45.3,
    memory_pct: 58.7,
    uptime_seconds: 3600,
    timestamp: new Date().toISOString()
  }
];

export const performanceHistoryMock: PerformanceHistoryPoint[] = Array.from({ length: 50 }).map((_, i) => {
  const timestamp = new Date(Date.now() - (50 - i) * 1000 * 60).toISOString();
  
  return {
    device_ip: '192.168.1.1',
    timestamp,
    cpu_pct: Math.floor(Math.random() * 80) + 10, // 10-90%
    memory_pct: Math.floor(Math.random() * 70) + 20, // 20-90%
    uptime_secs: 7200 + (i * 60) // incrementing uptime
  };
});