// frontend/src/mocks/trafficMock.ts

import type { TrafficData } from '../types/types';

// mock current traffic data
export const trafficDataMock: TrafficData[] = [
  {
    device_ip: '192.168.1.1',
    interface_name: 'GigabitEthernet0/0',
    inbound_kbps: 120000,
    outbound_kbps: 80000,
    in_packets: 12345,
    out_packets: 9876,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.2',
    interface_name: 'GigabitEthernet0/1',
    inbound_kbps: 45000,
    outbound_kbps: 70000,
    in_packets: 5432,
    out_packets: 8765,
    timestamp: new Date().toISOString()
  },
  {
    device_ip: '192.168.1.3',
    interface_name: 'ge-0/0/0',
    inbound_kbps: 90000,
    outbound_kbps: 110000,
    in_packets: 3333,
    out_packets: 4444,
    timestamp: new Date().toISOString()
  }
];

// mock traffic history data
export const trafficHistoryMock: TrafficData[] = Array.from({ length: 50 }).map((_, i) => ({
  device_ip: '192.168.1.1',
  interface_name: 'GigabitEthernet0/0',
  timestamp: new Date(Date.now() - (50 - i) * 1000 * 60).toISOString(),
  inbound_kbps: Math.floor(Math.random() * 100000),
  outbound_kbps: Math.floor(Math.random() * 100000),
  in_packets: Math.floor(Math.random() * 5000),
  out_packets: Math.floor(Math.random() * 5000),
  errors: Math.floor(Math.random() * 5)
}));
