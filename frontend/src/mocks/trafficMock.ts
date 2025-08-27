import type { TrafficRecord, TrafficHistoryPoint } from '../utils/types';

export const trafficDataMock: TrafficRecord[] = [
  {
    device_ip: '192.168.1.1',
    interface_name: 'GigabitEthernet0/0',
    inbound_kbps: 120000,
    outbound_kbps: 80000,
    in_packets: 12345,
    out_packets: 9876,
    errors: 0,
    timestamp: Date.now()
  },
  {
    device_ip: '192.168.1.2',
    interface_name: 'GigabitEthernet0/1',
    inbound_kbps: 45000,
    outbound_kbps: 70000,
    in_packets: 5432,
    out_packets: 8765,
    errors: 2,
    timestamp: Date.now()
  },
  {
    device_ip: '192.168.1.3',
    interface_name: 'ge-0/0/0',
    inbound_kbps: 90000,
    outbound_kbps: 110000,
    in_packets: 3333,
    out_packets: 4444,
    errors: 1,
    timestamp: Date.now()
  }
];

export const trafficHistoryMock: TrafficHistoryPoint[] = Array.from({ length: 50 }).map((_, i) => ({
  timestamp: Date.now() - (50 - i) * 1000 * 60,
  inbound_kbps: Math.floor(Math.random() * 100000),
  outbound_kbps: Math.floor(Math.random() * 100000)
}));
