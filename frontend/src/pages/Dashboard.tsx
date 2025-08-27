// src/pages/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiClient, Device, Performance, Traffic, Alert } from '../utils/api';

const Dashboard: React.FC = () => {
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesUp, setDevicesUp] = useState(0);
  const [devicesDown, setDevicesDown] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  const fetchDashboard = async () => {
    try {
      const [deviceList, perf, traf, alrts] = await Promise.all([
        apiClient.getDevices().catch(() => [] as Device[]),
        apiClient.getPerformance().catch(() => [] as Performance[]),
        apiClient.getTraffic().catch(() => [] as Traffic[]),
        apiClient.getAlerts().catch(() => [] as Alert[]),
      ]);

      setDevices(deviceList);
      setPerformance(perf);
      setTraffic(traf);
      setAlerts(alrts);

      const total = deviceList.length;
      const up = deviceList.filter(d => d.status === 'up').length;

      setTotalDevices(total);
      setDevicesUp(up);
      setDevicesDown(total - up);
      setActiveAlerts(alrts.filter(a => !a.acknowledged).length);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const getHealthColor = () => {
    if (devicesDown > 0 || activeAlerts > 0) return '#f87171'; // red
    if (devicesUp < totalDevices) return '#facc15'; // yellow
    return '#34d399'; // green
  };

  const healthData = [
    { name: 'Up', value: devicesUp, color: '#34d399' },
    { name: 'Down', value: devicesDown, color: '#f87171' },
  ];

  return (
    <div className="space-y-6 w-full p-6">
      <h1 className="text-3xl font-bold">Network Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 justify-items-stretch w-full">
        <div className="bg-card p-4 rounded shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Health Status</h2>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: getHealthColor() }}
          >
            {((devicesUp / Math.max(totalDevices, 1)) * 100).toFixed(0)}%
          </div>
        </div>

        <div className="bg-card p-4 rounded shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Total Devices</h2>
          <p className="text-xl font-bold">{totalDevices}</p>
        </div>

        <div className="bg-card p-4 rounded shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Devices Up</h2>
          <p className="text-xl font-bold text-green-500">{devicesUp}</p>
        </div>

        <div className="bg-card p-4 rounded shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Active Alerts</h2>
          <p className="text-xl font-bold text-red-500">{activeAlerts}</p>
        </div>
      </div>

      {/* Health & CPU Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <div className="bg-card p-4 rounded shadow flex flex-col items-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Device Status</h2>
          <PieChart width={200} height={200}>
            <Pie
              data={healthData}
              dataKey="value"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              label
            >
              {healthData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </div>

        <div className="bg-card p-4 rounded shadow w-full">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">CPU Usage (%)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performance}>
              <XAxis dataKey="device_ip" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cpu_pct" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Traffic Chart */}
      <div className="bg-card p-4 rounded shadow w-full">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Traffic (bps)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={traffic}>
            <XAxis dataKey="interface_name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="in_bps" stroke="#82ca9d" name="In" />
            <Line type="monotone" dataKey="out_bps" stroke="#8884d8" name="Out" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Alerts Table */}
      <div className="bg-card p-4 rounded shadow overflow-x-auto w-full">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Latest Alerts</h2>
        <table className="min-w-full table-auto text-left border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2 border-b">Device IP</th>
              <th className="px-4 py-2 border-b">Severity</th>
              <th className="px-4 py-2 border-b">Message</th>
              <th className="px-4 py-2 border-b">Timestamp</th>
              <th className="px-4 py-2 border-b">Acknowledged</th>
            </tr>
          </thead>
          <tbody>
            {alerts.slice(0, 5).map(alert => (
              <tr key={alert.id} className="hover:bg-muted/10">
                <td className="px-4 py-2">{alert.device_ip}</td>
                <td className="px-4 py-2">{alert.severity}</td>
                <td className="px-4 py-2">{alert.message}</td>
                <td className="px-4 py-2">{new Date(alert.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2">{alert.acknowledged ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
