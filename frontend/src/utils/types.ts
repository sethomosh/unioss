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

export interface TrafficHistoryPoint {
  timestamp: number | string;
  inbound_kbps?: number;
  outbound_kbps?: number;
  in_bps?: number;      // legacy fallback
  out_bps?: number;     // legacy fallback
}
