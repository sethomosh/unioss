// src/pages/Dashboard.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { apiService } from '../services/apiService';
import { PerformanceMetrics, TrafficData, Alert } from '../types/types';

const Dashboard: React.FC = () => {
  // states
  const [performance, setPerformance] = useState<PerformanceMetrics[]>([]);
  const [traffic, setTraffic] = useState<TrafficData[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesUp, setDevicesUp] = useState(0);
  const [devicesDown, setDevicesDown] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  // refs
  const loadingOverview = useRef(false);
  const loadingPerformance = useRef(false);
  const prevTrafficRef = useRef<Record<string, TrafficData>>({});

  // helper: smooth traffic bps
  const smoothBps = (prev: number, curr: number, alpha = 0.3) => alpha * curr + (1 - alpha) * prev;

  // fetch overview: devices, traffic, alerts
  const fetchDashboardOverview = useCallback(async () => {
    if (loadingOverview.current) return;
    loadingOverview.current = true;
    try {
      const [devices, traf, alrts] = await Promise.all([
        apiService.getDevices(),
        apiService.getTraffic(),
        apiService.getAlerts(),
      ]);

      const trafficBps = traf.map(t => {
        const key = `${t.device_ip}-${t.interface_name}`;
        const prev = prevTrafficRef.current[key];

        const in_bps = prev ? smoothBps(prev.in_bps ?? 0, (t.inbound_kbps ?? 0) * 1000) : (t.inbound_kbps ?? 0) * 1000;
        const out_bps = prev ? smoothBps(prev.out_bps ?? 0, (t.outbound_kbps ?? 0) * 1000) : (t.outbound_kbps ?? 0) * 1000;

        const data = { ...t, in_bps, out_bps };
        prevTrafficRef.current[key] = data;
        return data;
      });

      setTraffic(trafficBps);
      setAlerts(alrts);

      const total = devices.length;
      const up = devices.filter(d => d.status === 'up').length;

      setTotalDevices(total);
      setDevicesUp(up);
      setDevicesDown(total - up);
      setActiveAlerts(alrts.filter(a => !a.acknowledged).length);
    } catch (err) {
      console.error('Failed to fetch dashboard overview', err);
    } finally {
      loadingOverview.current = false;
    }
  }, [prevTrafficRef]);

  // fetch performance only
  const fetchPerformance = async () => {
    if (loadingPerformance.current) return;
    loadingPerformance.current = true;

    try {
      const perf = await apiService.getPerformance();
      setPerformance(perf);
    } catch (err) {
      console.error('Failed to fetch performance', err);
    } finally {
      loadingPerformance.current = false;
    }
  };

  // polling setup
  useEffect(() => {
    fetchPerformance();
    fetchDashboardOverview();

    const perfInterval = setInterval(() => {
      if (!document.hidden) fetchPerformance();
    }, 15000);

    const overviewInterval = setInterval(() => {
      if (!document.hidden) fetchDashboardOverview();
    }, 30000);

    return () => {
      clearInterval(perfInterval);
      clearInterval(overviewInterval);
    };
  }, [fetchDashboardOverview]);

  const getHealthColor = () => {
    if (devicesDown > 0 || activeAlerts > 0) return '#f87171';
    if (devicesUp < totalDevices) return '#facc15';
    return '#34d399';
  };

  const healthData = [
    { name: 'Up', value: devicesUp, color: '#34d399' },
    { name: 'Down', value: devicesDown, color: '#f87171' },
  ];

  return (
    <div className="space-y-6 w-full">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
        <div className="bg-card p-6 rounded-lg shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Health Status</h2>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: getHealthColor() }}
          >
            {((devicesUp / Math.max(totalDevices, 1)) * 100).toFixed(0)}%
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Total Devices</h2>
          <p className="text-2xl font-bold">{totalDevices}</p>
        </div>

        <div className="bg-card p-6 rounded-lg shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Device Status</h2>
          <div className="flex items-center justify-center space-x-4">
            <div className="text-center">
              <div className="text-green-500 font-bold text-xl">{devicesUp}</div>
              <div className="text-xs text-muted-foreground">Online</div>
            </div>
            <div className="text-center">
              <div className="text-red-500 font-bold text-xl">{devicesDown}</div>
              <div className="text-xs text-muted-foreground">Offline</div>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Active Alerts</h2>
          <div className="relative">
            <div className="text-2xl font-bold text-red-500">{activeAlerts}</div>
            {activeAlerts > 0 && (
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                {activeAlerts}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">Device Status</h2>
          <div className="flex items-center justify-center">
            <PieChart width={200} height={200}>
              <Pie data={healthData} dataKey="value" innerRadius={60} outerRadius={80} paddingAngle={2}>
                {healthData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">CPU Usage (%)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performance}>
              <XAxis dataKey="device_ip" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cpu_pct" stroke="#8884d8" name="CPU" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">Traffic (bps)</h2>
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

      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">Latest Alerts</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-sm font-semibold text-muted-foreground">Device IP</th>
                <th className="px-4 py-2 text-sm font-semibold text-muted-foreground">Severity</th>
                <th className="px-4 py-2 text-sm font-semibold text-muted-foreground">Message</th>
                <th className="px-4 py-2 text-sm font-semibold text-muted-foreground">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 5).map(alert => (
                <tr key={alert.id} className="border-b border-border hover:bg-muted/10">
                  <td className="px-4 py-3">{alert.device_ip}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : alert.severity === 'high'
                          ? 'bg-orange-100 text-orange-800'
                          : alert.severity === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">{alert.message}</td>
                  <td className="px-4 py-3">{new Date(alert.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
