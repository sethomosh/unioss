// src/pages/Dashboard.tsx - Improved card-based layout
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
      const [devicesResp, trafficResp, alertsResp] = await Promise.all([
        apiService.getDevices() as Promise<Device[]>,
        apiService.getTraffic() as Promise<TrafficData[]>,
        apiService.getAlerts() as Promise<Alert[]>,
      ]);

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

      const safeAlerts: Alert[] = (alertsResp ?? []).map((a) => ({
        id: a.id,
        message: a.message,
        severity: (a.severity ?? 'low').toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
        acknowledged: a.acknowledged ?? false,
        timestamp: a.timestamp ?? new Date().toISOString(),
      }));

      setAlerts(safeAlerts);
      setActiveAlerts(safeAlerts.filter((a) => !a.acknowledged).length);

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

        const currInBps = t.inbound_kbps != null ? t.inbound_kbps * 1000 : t.in_octets * 8;
        const currOutBps = t.outbound_kbps != null ? t.outbound_kbps * 1000 : t.out_octets * 8;

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
    <div className="space-y-8 w-full">
      {/* KPI Cards - Clean card layout with proper contrast */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Health Status Card */}
        <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Health Status
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {totalDevices > 0 ? ((devicesUp / totalDevices) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md"
              style={{ backgroundColor: getHealthColor() }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getHealthColor() }}
            ></div>
            <p className="text-sm text-muted-foreground">System Health</p>
          </div>
        </div>

        {/* Total Devices Card */}
        <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Total Devices
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{totalDevices}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shadow-md">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary">
                <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary"></div>
            <p className="text-sm text-muted-foreground">Monitored Devices</p>
          </div>
        </div>

        {/* Device Status Card */}
        <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm md:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Device Status
              </h3>
            </div>
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div>
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-500/5 rounded-xl p-4 border border-green-500/10">
              <div className="text-2xl font-bold text-green-600">{devicesUp}</div>
              <div className="text-xs text-green-600/70 font-medium">Online</div>
            </div>
            <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/10">
              <div className="text-2xl font-bold text-red-600">{devicesDown}</div>
              <div className="text-xs text-red-600/70 font-medium">Offline</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section - Side by side with enhanced styling */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Device Status Pie Chart */}
        <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Device Overview</h2>
            <div className="bg-primary/10 p-2 rounded-lg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 2v20M22 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-center bg-background/30 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie 
                  data={healthData} 
                  dataKey="value" 
                  innerRadius={60} 
                  outerRadius={100} 
                  paddingAngle={3} 
                  isAnimationActive={true}
                  strokeWidth={0}
                >
                  {healthData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Chart */}
        <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Performance Metrics</h2>
            <div className="bg-accent/10 p-2 rounded-lg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="bg-background/30 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={performance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis 
                  dataKey="device_ip" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="cpu_pct" 
                  name="CPU %" 
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--chart-1))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: 'hsl(var(--chart-1))', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="memory_pct" 
                  name="Memory %" 
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: 'hsl(var(--chart-2))', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Traffic Chart - Full width with enhanced styling */}
      <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Network Traffic</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-3 shadow-sm"></div>
              <span className="text-xs text-muted-foreground">Inbound</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-4 shadow-sm"></div>
              <span className="text-xs text-muted-foreground">Outbound</span>
            </div>
          </div>
        </div>
        <div className="bg-background/30 rounded-xl p-6">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={traffic} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <XAxis 
                dataKey="device_interface" 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="in_bps" 
                name="Inbound (bps)" 
                stroke="hsl(var(--chart-3))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-3))', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, stroke: 'hsl(var(--chart-3))', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="out_bps" 
                name="Outbound (bps)" 
                stroke="hsl(var(--chart-4))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-4))', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, stroke: 'hsl(var(--chart-4))', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Critical Alerts - Enhanced card styling */}
      <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Recent Critical Alerts</h2>
          <div className="bg-destructive/10 p-2 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-destructive">
              <path d="M15 17H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 3C9.239 3 7 5.239 7 8V11C7 12.93 6.32 14.68 5.222 15.828L4 17.2C3.447 17.82 4.018 18.75 4.78 18.75H19.22C19.982 18.75 20.553 17.82 20 17.2L18.778 15.828C17.68 14.68 17 12.93 17 11V8C17 5.239 14.761 3 12 3Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="space-y-4">
          {recentAlerts.length > 0 ? (
            recentAlerts.map((alert, idx) => (
              <div 
                key={idx} 
                className="group bg-destructive/5 border border-destructive/10 rounded-xl p-4 hover:bg-destructive/10 hover:border-destructive/20 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-destructive shadow-sm animate-pulse"></div>
                    <div>
                      <span className="font-medium text-destructive text-sm">{alert.message}</span>
                      <div className="text-xs text-destructive/70 mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 transition-all duration-200">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-destructive/60">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-green-500">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <p className="text-sm text-muted-foreground font-medium">No critical alerts</p>
              <p className="text-xs text-muted-foreground/70 mt-1">All systems running smoothly</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;