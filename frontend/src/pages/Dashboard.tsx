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
import { Device, Alert } from '../types/types';
import { exportAsCSV, exportAsJSON } from '../utils/exportUtils';


const Dashboard: React.FC = () => {
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<any[]>([]);
  const [selectedDeviceIp, setSelectedDeviceIp] = useState<string>('');
  const [totalDevices, setTotalDevices] = useState(0);
  const [devicesUp, setDevicesUp] = useState(0);
  const [devicesDown, setDevicesDown] = useState(0);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const loadingOverview = useRef(false);

  const fetchDashboardOverview = useCallback(async () => {
    if (loadingOverview.current) return;
    loadingOverview.current = true;

    try {
      const settle = await Promise.allSettled([
        apiService.getDevices(),
        apiService.getAlerts(),
      ]);

      const devicesResp = settle[0].status === 'fulfilled' ? (settle[0].value as Device[]) : [];
      const alertsResp = settle[1].status === 'fulfilled' ? (settle[1].value as Alert[]) : [];

      if (settle[0].status === 'rejected') console.error('Devices fetch failed', settle[0].reason);
      if (settle[1].status === 'rejected') console.error('Alerts fetch failed', settle[1].reason);

      const safeDevices: Device[] = (devicesResp ?? []).map((d) => ({
        id: d.id ?? d.ip ?? 'unknown',
        device_ip: d.device_ip ?? d.ip ?? 'unknown',
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
      setDevices(safeDevices);
      if (safeDevices.length > 0 && !selectedDeviceIp) {
        setSelectedDeviceIp(safeDevices[0].ip || '');
      }

      const safeAlerts: Alert[] = alertsResp.map((a) => ({
        id: a.id,
        message: a.message,
        severity: (a.severity || 'low').toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
        acknowledged: a.acknowledged || false,
        timestamp: a.timestamp || new Date().toISOString(),
      }));

      setAlerts(safeAlerts);
      setActiveAlerts(safeAlerts.filter((a) => !a.acknowledged).length);

    } catch (err) {
      console.error('Failed to fetch dashboard overview', err);
    } finally {
      loadingOverview.current = false;
    }
  }, [selectedDeviceIp]);

  const fetchChartHistory = useCallback(async () => {
    if (!selectedDeviceIp) return;
    try {
      const settle = await Promise.allSettled([
        apiService.getPerformanceHistory(selectedDeviceIp, 20),
        apiService.getTrafficHistory(selectedDeviceIp, '', 20)
      ]);
      if (settle[0].status === 'fulfilled') {
        const pData = (settle[0].value as any)?.items || settle[0].value || [];
        setPerformanceHistory(Array.isArray(pData) ? pData.reverse() : []);
      }
      if (settle[1].status === 'fulfilled') {
        const tData = (settle[1].value as any)?.items || settle[1].value || [];
        // aggregate interface traffic per timestamp
        const trafficPoints: Record<string, any> = {};
        (Array.isArray(tData) ? tData : []).forEach((row: any) => {
          const ts = new Date(row.timestamp).getTime();
          if (!trafficPoints[ts]) trafficPoints[ts] = { timestamp: row.timestamp, in_bps: 0, out_bps: 0 };
          trafficPoints[ts].in_bps += (row.inbound_kbps || 0) * 1000;
          trafficPoints[ts].out_bps += (row.outbound_kbps || 0) * 1000;
        });
        setTrafficHistory(Object.values(trafficPoints).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      }
    } catch (err) {
      console.error('Failed to fetch chart history', err);
    }
  }, [selectedDeviceIp]);

  useEffect(() => {
    fetchDashboardOverview();
    fetchChartHistory();

    const evtSource = new EventSource('/api/stream/metrics');
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.devices) {
          const safeDevices: Device[] = data.devices.map((d: any) => ({
            id: d.id ?? d.ip ?? 'unknown',
            device_ip: d.device_ip ?? d.ip ?? 'unknown',
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
          setDevices(safeDevices);
        }
        if (data.alerts) {
          const safeAlerts: Alert[] = data.alerts.map((a: any) => ({
            id: a.id,
            message: a.message,
            severity: (a.severity || 'low').toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
            acknowledged: a.acknowledged || false,
            timestamp: a.timestamp || new Date().toISOString(),
          }));
          setAlerts(safeAlerts);
          setActiveAlerts(safeAlerts.filter((a) => !a.acknowledged).length);
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    const histInterval = setInterval(() => {
      if (!document.hidden) fetchChartHistory();
    }, 15000);

    return () => {
      evtSource.close();
      clearInterval(histInterval);
    };
  }, [fetchChartHistory, fetchDashboardOverview]);

  const getHealthColor = () => {
    if (devicesDown > 0 || activeAlerts > 0) return '#f87171';
    if (devicesUp < totalDevices) return '#facc15';
    return '#34d399';
  };

  const handleAcknowledgeAlert = async (alertId: number | string) => {
    try {
      await apiService.acknowledgeAlert(alertId.toString());
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      setActiveAlerts(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
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
        <div className="bg-gradient-to-br from-card to-card/90 border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 backdrop-blur-md group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-1">
                System Health
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                  {totalDevices > 0 ? ((devicesUp / totalDevices) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner transition-transform duration-500 group-hover:rotate-12"
              style={{ backgroundColor: getHealthColor() }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: getHealthColor() }}
            ></div>
            <p className="text-[11px] font-medium text-muted-foreground/80">Real-time pulse</p>
          </div>
        </div>

        {/* Total Devices Card */}
        <div className="bg-gradient-to-br from-card to-card/90 border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 backdrop-blur-md group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-1">
                Network Inventory
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{totalDevices}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner group-hover:bg-primary/20 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary">
                <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60"></div>
            <p className="text-[11px] font-medium text-muted-foreground/80">Active Nodes</p>
          </div>
        </div>

        {/* Device Status Card */}
        <div className="bg-gradient-to-br from-card to-card/90 border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 backdrop-blur-md md:col-span-2 lg:col-span-1 group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-1">
                Live Status
              </h3>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
              <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/10 group-hover:bg-emerald-500/10 transition-colors">
              <div className="text-xl font-bold text-emerald-600">{devicesUp}</div>
              <div className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-wider">Online</div>
            </div>
            <div className="bg-rose-500/5 rounded-xl p-3 border border-rose-500/10 group-hover:bg-rose-500/10 transition-colors">
              <div className="text-xl font-bold text-rose-600">{devicesDown}</div>
              <div className="text-[10px] text-rose-600/70 font-bold uppercase tracking-wider">Offline</div>
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
                <path d="M12 2v20M22 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
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
                    <Cell key={`cell - ${index} `} fill={entry.color} />
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
            <h2 className="text-lg font-semibold text-foreground">Performance History</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={() => exportAsCSV(performanceHistory, 'performance_history')}
                  className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors"
                >
                  CSV
                </button>
                <button
                  onClick={() => exportAsJSON(performanceHistory, 'performance_history')}
                  className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors"
                >
                  JSON
                </button>
              </div>
              <select
                className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedDeviceIp}
                onChange={(e) => setSelectedDeviceIp(e.target.value)}
              >
                {devices.map(d => (
                  <option key={d.ip} value={d.ip}>{d.hostname || d.ip}</option>
                ))}
              </select>
              <div className="bg-accent/10 p-2 rounded-lg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-accent">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-background/30 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={performanceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip
                  labelFormatter={(val) => new Date(val).toLocaleString()}
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
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="memory_pct"
                  name="Memory %"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Traffic Chart - Full width with enhanced styling */}
      <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Traffic History (Aggr)</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-4">
              <button
                onClick={() => exportAsCSV(trafficHistory, 'traffic_history')}
                className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors"
              >
                CSV
              </button>
              <button
                onClick={() => exportAsJSON(trafficHistory, 'traffic_history')}
                className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded transition-colors"
              >
                JSON
              </button>
            </div>
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
        </div>
        <div className="bg-background/30 rounded-xl p-6">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trafficHistory} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <XAxis
                dataKey="timestamp"
                tickFormatter={(val) => new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip
                labelFormatter={(val) => new Date(val).toLocaleString()}
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
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="out_bps"
                name="Outbound (bps)"
                stroke="hsl(var(--chart-4))"
                strokeWidth={2}
                dot={false}
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
                  <button
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 transition-all duration-200"
                    title="Dismiss alert"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-destructive/60">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-green-500">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
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