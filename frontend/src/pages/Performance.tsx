import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePerformance, usePerformanceHistory } from '../hooks/useApi';

export function Performance() {
  const [selectedDevice, setSelectedDevice] = useState<string>('192.168.1.1');
  const { data: metrics, loading: metricsLoading } = usePerformance();
  const { data: history } = usePerformanceHistory(selectedDevice);

  // TS-safe: only call slice if history is an array
  const performanceData = Array.isArray(history)
    ? history.slice(-50).map(point => ({
        time: new Date(point.timestamp).toLocaleTimeString(),
        CPU: point.cpu_pct,
        Memory: point.memory_pct
      }))
    : [];

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold font-serif mb-1">Performance Analytics</h1>
        <p className="text-sm text-muted-foreground">Monitor CPU and memory utilization across devices</p>
      </motion.div>

      {/* Device Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex gap-4 items-center"
      >
        <label className="text-sm font-medium">Select Device:</label>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="192.168.1.1">192.168.1.1 - router-core-01</option>
          <option value="192.168.1.2">192.168.1.2 - switch-access-01</option>
          <option value="192.168.1.3">192.168.1.3 - firewall-edge-01</option>
        </select>
      </motion.div>

      {/* Current Metrics Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Current Metrics</h2>
          {metricsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium">Device</th>
                    <th className="text-left py-3 px-4 font-medium">CPU %</th>
                    <th className="text-left py-3 px-4 font-medium">Memory %</th>
                    <th className="text-left py-3 px-4 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.map((metric) => (
                    <tr key={metric.device_ip} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono">{metric.device_ip}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          metric.cpu_pct > 80 ? 'bg-destructive/20 text-destructive' :
                          metric.cpu_pct > 60 ? 'bg-accent/20 text-accent-foreground' :
                          'bg-primary/20 text-primary'
                        }`}>
                          {metric.cpu_pct}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          metric.memory_pct > 80 ? 'bg-destructive/20 text-destructive' :
                          metric.memory_pct > 60 ? 'bg-accent/20 text-accent-foreground' :
                          'bg-primary/20 text-primary'
                        }`}>
                          {metric.memory_pct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(metric.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* Historical Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Performance History - {selectedDevice}</h2>
          <div className="h-[320px] md:h-[360px] lg:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} />
                <Line type="monotone" dataKey="CPU" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Memory" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Export Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="flex justify-end"
      >
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
          Export CSV
        </button>
      </motion.div>
    </div>
  );
}
