import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePerformanceHistory } from '../hooks/useApi';

export function PerformanceHistory() {
  const [selectedDevice, setSelectedDevice] = useState<string>('192.168.1.1');
  const { data: history } = usePerformanceHistory(selectedDevice);

  // TS-safe: only map if history is an array
  const performanceData = Array.isArray(history)
    ? history.map(point => ({
        time: new Date(point.timestamp).toLocaleString(),
        CPU: point.cpu_pct,
        Memory: point.memory_pct
      }))
    : [];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-3xl font-bold font-serif mb-2">Performance History</h1>
        <p className="text-muted-foreground">Historical CPU and memory trends per device</p>
      </motion.div>

      {/* Device Selector */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="flex gap-4 items-center">
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

      {/* Historical Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">History - {selectedDevice}</h2>
          <div className="h-96">
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
    </div>
  );
}
