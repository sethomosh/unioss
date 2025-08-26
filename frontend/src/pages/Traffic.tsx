import { useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTraffic, useTrafficHistory } from '../hooks/useApi';

export function Traffic() {
  const [selectedDevice, setSelectedDevice] = useState<string>('192.168.1.1');
  const [selectedInterface, setSelectedInterface] = useState<string>('GigabitEthernet0/0');
  const { data: trafficData, loading: trafficLoading } = useTraffic();
  const { data: history } = useTrafficHistory(selectedDevice, selectedInterface);

  const trafficHistoryData = history?.slice(-50).map(point => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    'In (Mbps)': Math.round(point.inbound_kbps / 1000),
    'Out (Mbps)': Math.round(point.outbound_kbps / 1000)
  })) || [];

  const topTalkersData = trafficData?.slice(0, 10).map(item => ({
    interface: item.interface_name,
    'In (Mbps)': Math.round(item.inbound_kbps / 1000),
    'Out (Mbps)': Math.round(item.outbound_kbps / 1000)
  })) || [];

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold font-serif mb-1">Traffic Analytics</h1>
        <p className="text-sm text-muted-foreground">Monitor network traffic and interface utilization</p>
      </motion.div>

      {/* Device and Interface Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex gap-4 items-center flex-wrap"
      >
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Device:</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="192.168.1.1">192.168.1.1 - router-core-01</option>
            <option value="192.168.1.2">192.168.1.2 - switch-access-01</option>
            <option value="192.168.1.3">192.168.1.3 - firewall-edge-01</option>
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Interface:</label>
          <select
            value={selectedInterface}
            onChange={(e) => setSelectedInterface(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="GigabitEthernet0/0">GigabitEthernet0/0</option>
            <option value="GigabitEthernet0/1">GigabitEthernet0/1</option>
            <option value="ge-0/0/0">ge-0/0/0</option>
          </select>
        </div>
      </motion.div>

      {/* Interfaces Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Interface Traffic</h2>
          {trafficLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
                    <th className="text-left py-3 px-4 font-medium">In Packets</th>
                    <th className="text-left py-3 px-4 font-medium">Out Packets</th>
                    <th className="text-left py-3 px-4 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficData?.map((traffic) => (
                    <tr key={`${traffic.device_ip}-${traffic.interface_name}`} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono">{traffic.device_ip}</td>
                      <td className="py-3 px-4 font-mono">{traffic.interface_name}</td>
                      <td className="py-3 px-4">
                        {Math.round(traffic.inbound_kbps / 1000)}
                      </td>
                      <td className="py-3 px-4">
                        {Math.round(traffic.outbound_kbps / 1000)}
                      </td>
                      <td className="py-3 px-4">
                        {traffic.errors.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {traffic.errors.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(traffic.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* Top Talkers Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Top Talkers</h2>
          <div className="h-[320px] md:h-[360px] lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTalkersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis 
                  dataKey="interface" 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)'
                  }}
                />
                <Bar dataKey="In (Mbps)" fill="var(--chart-1)" />
                <Bar dataKey="Out (Mbps)" fill="var(--chart-2)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Traffic History Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Traffic History - {selectedInterface}</h2>
          <div className="h-[320px] md:h-[360px] lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficHistoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="In (Mbps)" 
                  stackId="1"
                  stroke="var(--chart-1)" 
                  fill="var(--chart-1)"
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="Out (Mbps)" 
                  stackId="1"
                  stroke="var(--chart-2)" 
                  fill="var(--chart-2)"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
