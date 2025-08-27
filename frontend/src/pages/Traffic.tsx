// Traffic.tsx
import React, { useState } from 'react';
import { trafficDataMock, trafficHistoryMock } from '../mocks/trafficMock';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { useTraffic, useTrafficHistory } from '../hooks/useApi';

/* Safe helpers — avoid any */
function getNumberField(obj: unknown, candidates: string[]): number {
  if (!obj || typeof obj !== 'object') return 0;
  const rec = obj as Record<string, unknown>;
  for (const k of candidates) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function getStringField(obj: unknown, candidates: string[], fallback = ''): string {
  if (!obj || typeof obj !== 'object') return fallback;
  const rec = obj as Record<string, unknown>;
  for (const k of candidates) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return fallback;
}

/* backend sends Kbps, convert to Mbps */
const formatKbpsToMbps = (kbps: number) => (kbps ? (kbps / 1000).toFixed(2) : "0");

/**
 * Named export (App.tsx expects named).
 */
export function Traffic(): JSX.Element {
  const [selectedDevice, setSelectedDevice] = useState<string>('192.168.1.1');
  const [selectedInterface, setSelectedInterface] = useState<string>('GigabitEthernet0/0');

  const { data: trafficDataRaw, loading: trafficLoading } = useTraffic();
  const { data: historyRaw } = useTrafficHistory(selectedDevice, selectedInterface);

  const trafficData = trafficDataRaw ?? trafficDataMock;
  const history = historyRaw ?? trafficHistoryMock;

  // History chart data
  const trafficHistoryData = history.slice(-50).map((point): Record<string, unknown> => {
    const inVal = getNumberField(point, ['inbound_kbps']);
    const outVal = getNumberField(point, ['outbound_kbps']);
    return {
      time: getStringField(point, ['timestamp'], new Date().toLocaleTimeString()),
      'In (Mbps)': formatKbpsToMbps(inVal),
      'Out (Mbps)': formatKbpsToMbps(outVal)
    };
  });

  // Top talkers list
  const topTalkersData = (trafficData ?? []).slice(0, 10).map((item): Record<string, unknown> => {
    const iface = getStringField(item, ['interface_name'], 'unknown');
    const inVal = getNumberField(item, ['inbound_kbps']);
    const outVal = getNumberField(item, ['outbound_kbps']);
    const deviceIp = getStringField(item, ['device_ip']);
    return {
      interface: iface,
      device_ip: deviceIp,
      'In (Mbps)': formatKbpsToMbps(inVal),
      'Out (Mbps)': formatKbpsToMbps(outVal)
    };
  });

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold font-serif mb-1">Traffic Analytics</h1>
        <p className="text-sm text-muted-foreground">Monitor network traffic and interface utilization</p>
      </motion.div>

      {/* selectors */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="flex gap-4 items-center flex-wrap">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Device:</label>
          <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-background text-foreground">
            <option value="192.168.1.1">192.168.1.1 - router-core-01</option>
            <option value="192.168.1.2">192.168.1.2 - switch-access-01</option>
            <option value="192.168.1.3">192.168.1.3 - firewall-edge-01</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Interface:</label>
          <select value={selectedInterface} onChange={(e) => setSelectedInterface(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-background text-foreground">
            <option value="GigabitEthernet0/0">GigabitEthernet0/0</option>
            <option value="GigabitEthernet0/1">GigabitEthernet0/1</option>
            <option value="ge-0/0/0">ge-0/0/0</option>
          </select>
        </div>
      </motion.div>

      {/* Interface table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Interface Traffic</h2>

          {trafficLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium">Device</th>
                    <th className="text-left py-3 px-4 font-medium">Interface</th>
                    <th className="text-left py-3 px-4 font-medium">In (Mbps)</th>
                    <th className="text-left py-3 px-4 font-medium">Out (Mbps)</th>
                    <th className="text-left py-3 px-4 font-medium">Errors</th>
                    <th className="text-left py-3 px-4 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(trafficData ?? []).map((t, idx) => {
                    const inVal = getNumberField(t, ['inbound_kbps']);
                    const outVal = getNumberField(t, ['outbound_kbps']);
                    const errs = getNumberField(t, ['errors']);
                    const iface = getStringField(t, ['interface_name'], 'unknown');
                    const deviceIp = getStringField(t, ['device_ip'], 'unknown');
                    const tsString = getStringField(t, ['timestamp'], new Date().toISOString());

                    return (
                      <tr key={`${deviceIp}-${iface}-${idx}`} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono">{deviceIp}</td>
                        <td className="py-3 px-4 font-mono">{iface}</td>
                        <td className="py-3 px-4">{formatKbpsToMbps(inVal)}</td>
                        <td className="py-3 px-4">{formatKbpsToMbps(outVal)}</td>
                        <td className="py-3 px-4">{errs.toLocaleString()}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(tsString).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* Top Talkers */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Top Talkers</h2>
          <div className="h-[320px] md:h-[360px] lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTalkersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="interface" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} />
                <Bar dataKey="In (Mbps)" />
                <Bar dataKey="Out (Mbps)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Traffic History chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }} className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Traffic History - {selectedInterface}</h2>
          <div className="h-[320px] md:h-[360px] lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficHistoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} />
                <Area type="monotone" dataKey="In (Mbps)" stackId="1" />
                <Area type="monotone" dataKey="Out (Mbps)" stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
