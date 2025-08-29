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
import { PerformanceMetrics, TrafficData, Alert, Device } from '../types/types';

// After normalization, these fields are guaranteed
type BaseTraffic = {
  device_ip: string;
  interface_name: string;
  in_octets: number;
  out_octets: number;
  inbound_kbps: number | null;
  outbound_kbps: number | null;
  timestamp: string;
};

type TrafficWithBps = BaseTraffic & {
  in_bps: number;
  out_bps: number;
  device_interface: string;
};

const Dashboard: React.FC = () => {
  const [performance, setPerformance] = useState<PerformanceMetrics[]>([]);
  const [traffic, setTraffic] = useState<TrafficWithBps[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesUp, setDevicesUp] = useState(0);
  const [devicesDown, setDevicesDown] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);

  const loadingOverview = useRef(false);
  const loadingPerformance = useRef(false);
  const prevTrafficRef = useRef<Record<string, TrafficWithBps>>({});

  const smoothBps = (prev: number, curr: number, alpha = 0.3) =>
    alpha * curr + (1 - alpha) * prev;

  const fetchDashboardOverview = useCallback(async () => {
    if (loadingOverview.current) return;
    loadingOverview.current = true;

    try {
      // Assert each promise so TS infers a tuple result (no broken generics)
      const [devicesResp, trafficResp, alertsResp] = await Promise.all([
        apiService.getDevices() as Promise<Device[]>,
        apiService.getTraffic() as Promise<TrafficData[]>,
        apiService.getAlerts() as Promise<Alert[]>,
      ]);

      // --- normalize devices ---
      const safeDevices: Device[] = (devicesResp ?? []).map((d) => ({
        id: d.id ?? d.ip ?? 'unknown',
        ip: d.ip ?? 'unknown',
        hostname: d.hostname ?? '',
        vendor: d.vendor ?? '',
        model: d.model ?? '',
        os: d.os ?? '',
        status: d.status?.toLowerCase() === 'up' ? 'up' : 'down',
        lastSeen: d.lastSeen ?? new Date().toISOString(),
      }));

      const total = safeDevices.length;
      const up = safeDevices.filter((d) => d.status === 'up').length;

      setTotalDevices(total);
      setDevicesUp(up);
      setDevicesDown(total - up);

      // --- normalize alerts ---
      const safeAlerts: Alert[] = (alertsResp ?? []).map((a) => ({
        id: a.id,
        message: a.message,
        severity: (a.severity ?? 'low').toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
        acknowledged: a.acknowledged ?? false,
        timestamp: a.timestamp ?? new Date().toISOString(),
      }));

      setAlerts(safeAlerts);
      setActiveAlerts(safeAlerts.filter((a) => !a.acknowledged).length);

      // --- normalize traffic to required fields ---
      const normalizedTraffic: BaseTraffic[] = (trafficResp ?? []).map((t) => ({
        device_ip: t.device_ip ?? 'unknown',
        interface_name: t.interface_name ?? 'unknown',
        in_octets: t.in_octets ?? 0,
        out_octets: t.out_octets ?? 0,
        inbound_kbps: t.inbound_kbps ?? null,
        outbound_kbps: t.outbound_kbps ?? null,
        timestamp: t.timestamp ?? new Date().toISOString(),
      }));

      const trafficBps: TrafficWithBps[] = normalizedTraffic.map((t) => {
        const key = `${t.device_ip}-${t.interface_name}`;
        const prev = prevTrafficRef.current[key];

        const currInBps =
          t.inbound_kbps != null ? t.inbound_kbps * 1000 : t.in_octets * 8;
        const currOutBps =
          t.outbound_kbps != null ? t.outbound_kbps * 1000 : t.out_octets * 8;

        const in_bps = prev ? smoothBps(prev.in_bps, currInBps) : currInBps;
        const out_bps = prev ? smoothBps(prev.out_bps, currOutBps) : currOutBps;

        const data: TrafficWithBps = {
          ...t,
          in_bps,
          out_bps,
          device_interface: `${t.device_ip} ${t.interface_name}`,
        };

        prevTrafficRef.current[key] = data;
        return data;
      });

      setTraffic(trafficBps);
    } catch (err) {
      console.error('Failed to fetch dashboard overview', err);
    } finally {
      loadingOverview.current = false;
    }
  }, []);

  const fetchPerformance = useCallback(async () => {
    if (loadingPerformance.current) return;
    loadingPerformance.current = true;

    try {
      const perf = await apiService.getPerformance();
      const perfSafe: PerformanceMetrics[] =
        perf && perf.length
          ? perf
          : [
              { device_ip: 'mock-device-1', cpu_pct: 50, memory_pct: 60, timestamp: new Date().toISOString() },
              { device_ip: 'mock-device-2', cpu_pct: 30, memory_pct: 40, timestamp: new Date().toISOString() },
            ];

      setPerformance(perfSafe);
    } catch (err) {
      console.error('Failed to fetch performance', err);
    } finally {
      loadingPerformance.current = false;
    }
  }, []);

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
  }, [fetchPerformance, fetchDashboardOverview]);

  const getHealthColor = () => {
    if (devicesDown > 0 || activeAlerts > 0) return '#f87171';
    if (devicesUp < totalDevices) return '#facc15';
    return '#34d399';
  };

  const healthData = [
    { name: 'Up', value: Math.max(devicesUp, 0), color: '#34d399' },
    { name: 'Down', value: Math.max(devicesDown, 0), color: '#f87171' },
  ];

  const recentAlerts = alerts.filter((a) => a.severity === 'critical').slice(0, 3);

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
            {totalDevices > 0 ? ((devicesUp / totalDevices) * 100).toFixed(0) : 0}%
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
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">Device Status</h2>
          <div className="flex items-center justify-center">
            <PieChart width={200} height={200}>
              <Pie data={healthData} dataKey="value" innerRadius={60} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                {healthData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <h2 className="text-sm font-semibold text-muted-foreground mb-4">CPU & Memory Usage (%)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performance}>
              <XAxis dataKey="device_ip" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cpu_pct" name="CPU" />
              <Line type="monotone" dataKey="memory_pct" name="Memory" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">Traffic (bps)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={traffic}>
            <XAxis dataKey="device_interface" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="in_bps" name="In" />
            <Line type="monotone" dataKey="out_bps" name="Out" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Alerts */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">Recent Critical Alerts</h2>
        <ul className="space-y-2">
          {recentAlerts.length > 0 ? (
            recentAlerts.map((alert, idx) => (
              <li key={idx} className="flex justify-between items-center p-3 rounded border border-red-300 bg-red-50">
                <span className="font-medium text-red-700">{alert.message}</span>
                <span className="text-xs text-muted-foreground">{new Date(alert.timestamp).toLocaleString()}</span>
              </li>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No critical alerts</p>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
