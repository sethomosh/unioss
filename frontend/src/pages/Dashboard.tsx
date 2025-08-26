import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient, Device, Performance, Traffic, Alert } from '../utils/api';

const Dashboard: React.FC = () => {
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesUp, setDevicesUp] = useState(0);
  const [devicesDown, setDevicesDown] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  const fetchDashboard = async () => {
    try {
      const [devices, perf, traf, alrts] = await Promise.all([
        apiClient.getDevices().catch(() => [] as Device[]),
        apiClient.getPerformance().catch(() => [] as Performance[]),
        apiClient.getTraffic().catch(() => [] as Traffic[]),
        apiClient.getAlerts().catch(() => [] as Alert[])
      ]);

      setPerformance(perf);
      setTraffic(traf);
      setAlerts(alrts);

      const total = devices.length;
      const up = devices.filter(d => d.status === 'up').length;
      setTotalDevices(total);
      setDevicesUp(up);
      setDevicesDown(total - up);
      setActiveAlerts(alrts.filter(a => !a.acknowledged).length);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Network Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-gray-100 rounded shadow">
          <h2>Total Devices</h2>
          <p>{totalDevices}</p>
        </div>
        <div className="p-4 bg-green-100 rounded shadow">
          <h2>Devices Up</h2>
          <p>{devicesUp}</p>
        </div>
        <div className="p-4 bg-red-100 rounded shadow">
          <h2>Devices Down</h2>
          <p>{devicesDown}</p>
        </div>
        <div className="p-4 bg-yellow-100 rounded shadow">
          <h2>Active Alerts</h2>
          <p>{activeAlerts}</p>
        </div>
      </div>

      {/* CPU Chart */}
      <div className="p-4 bg-white rounded shadow">
        <h2>CPU Usage (%)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={performance}>
            <XAxis dataKey="device_ip" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="cpu_pct" stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Traffic Chart */}
      <div className="p-4 bg-white rounded shadow">
        <h2>Traffic (bps)</h2>
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
      <div className="p-4 bg-white rounded shadow">
        <h2>Alerts</h2>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th>Device IP</th>
              <th>Severity</th>
              <th>Message</th>
              <th>Timestamp</th>
              <th>Acknowledged</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map(alert => (
              <tr key={alert.id}>
                <td>{alert.severity}</td>
                <td>{alert.message}</td>
                <td>{new Date(alert.timestamp).toLocaleString()}</td>
                <td>{alert.acknowledged ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
