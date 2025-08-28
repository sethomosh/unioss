// frontend/src/mocks/performanceMock.ts

// import types from your centralized types file
import type { PerformanceMetrics } from '../types/types';

// extend for history if needed
export interface PerformanceHistoryPoint extends PerformanceMetrics {
  device_ip: string;
  uptime_secs?: number;
  timestamp: string;
}

// mock current performance
export const performanceDataMock: PerformanceHistoryPoint[] = [
  {
    device_ip: '192.168.1.1',
    cpu_pct: 23.5,
    memory_pct: 41.2,
    uptime_secs: 7200,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.2', 
    cpu_pct: 67.8,
    memory_pct: 82.1,
    uptime_secs: 14400,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.3',
    cpu_pct: 45.3,
    memory_pct: 58.7,
    uptime_secs: 3600,
    timestamp: new Date().toISOString()
  }
];

// mock historical performance data
export const performanceHistoryMock: PerformanceHistoryPoint[] = Array.from({ length: 50 }).map((_, i) => ({
  device_ip: '192.168.1.1',
  timestamp: new Date(Date.now() - (50 - i) * 1000 * 60).toISOString(),
  cpu_pct: Math.floor(Math.random() * 80) + 10,   // 10-90%
  memory_pct: Math.floor(Math.random() * 70) + 20, // 20-90%
  uptime_secs: 7200 + i * 60                      // incrementing uptime
}));
