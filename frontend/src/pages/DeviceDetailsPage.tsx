// src/pages/DeviceDetailsPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiService } from '../services/apiService';
import type {
  DeviceDetailsResponse,
  IfRow,
  Session,
  Alert
} from '../types/types';
import { formatUptime } from '../utils/formatters';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export const DeviceDetailsPage: React.FC = () => {
  const { deviceIp } = useParams<{ deviceIp: string }>();
  const [data, setData] = useState<DeviceDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const mountedRef = useRef(true);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (!deviceIp) return;

    const loadOnce = async () => {
      setLoading(true);
      setError(null);
      try {
        const [resp, sess, al] = await Promise.all([
          apiService.getDeviceDetails(decodeURIComponent(deviceIp)),
          apiService.getSessions(),
          apiService.getAlerts()
        ]);
        if (!mountedRef.current) return;
        setData(resp);
        setSessions(sess || []);
        setAlerts(al || []);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load device details');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    loadOnce();

    // poll details every 10s (snapshot + latest per-interface are useful to refresh frequently)
    pollRef.current = window.setInterval(() => {
      if (document.hidden) return;
      apiService.getDeviceDetails(decodeURIComponent(deviceIp))
        .then(resp => { if (mountedRef.current) setData(resp); })
        .catch(() => { });
      apiService.getSessions()
        .then(sess => { if (mountedRef.current) setSessions(sess || []); })
        .catch(() => { });
      apiService.getAlerts()
        .then(al => { if (mountedRef.current) setAlerts(al || []); })
        .catch(() => { });
    }, 10000);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deviceIp]);

  if (loading) return <div className="p-6 text-center">Loading device details…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6">No data</div>;

  // compute auth history for this device
  const deviceSessions = sessions
    .filter(s => s.device_ip === data.device_ip)
    .sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));

  // show latest 10 deduped events (apiService already dedupes duplicates)
  const recent = deviceSessions.slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Device: {data.device_ip}</h1>
        <div className="space-x-2">
          <Link to="/devices" className="px-3 py-1 bg-gray-200 rounded-md">Back</Link>
        </div>
      </div>

      {/* Snapshot */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold">Snapshot</h2>
        {data.snapshot ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
            <div><strong>CPU</strong><div>{data.snapshot.cpu_pct ?? '—'}</div></div>
            <div><strong>Memory</strong><div>{data.snapshot.memory_pct ?? '—'}</div></div>
            <div><strong>Uptime</strong><div>{formatUptime(data.snapshot.uptime_seconds)}</div></div>
            <div>
              <strong>Timestamp</strong>
              <div>{data.snapshot.timestamp ? new Date(data.snapshot.timestamp).toLocaleString() : '—'}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                <strong>signal:</strong>
                <div>
                  {/* prefer snapshot.signal, fall back to top-level data.signal */}
                  {(() => {
                    const sig = data.snapshot?.signal ?? data.signal ?? null;
                    if (!sig) return ' —';
                    const dbm = sig.rssi_dbm != null ? `${sig.rssi_dbm} dBm` : '—';
                    const pct = sig.rssi_pct != null ? ` (${sig.rssi_pct} %)` : '';
                    return `${dbm}${pct} `;
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-gray-600">No snapshot available</div>
        )}
      </div>
      {/* Access Control / Auth History */}
      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">access control / auth history</h2>
          <div className="text-sm text-gray-500">{deviceSessions.length} total</div>
        </div>

        {recent.length === 0 ? (
          <div className="mt-2 text-sm text-gray-600">No access sessions found for this device.</div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">timestamp</th>
                  <th className="px-3 py-2 text-left">method</th>
                  <th className="px-3 py-2 text-left">user / mac</th>
                  <th className="px-3 py-2 text-left">logout</th>
                  <th className="px-3 py-2 text-left">duration (s)</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s, i) => (
                  <tr key={s.session_id || i} className="border-t">
                    <td className="px-3 py-2">{s.start_time ? new Date(s.start_time).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2">{s.authenticated_via || '—'}</td>
                    <td className="px-3 py-2">{s.username || '—'}</td>
                    <td className="px-3 py-2">{s.last_activity ? new Date(s.last_activity).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2">{/* duration not provided by normalized Session; show — */ '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-sm text-gray-500">showing latest {recent.length} events. for full audit, use the access sessions endpoint.</div>
          </div>
        )}
      </div>

      {/* Latest per-interface */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold">Interfaces (latest)</h2>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Interface</th>
                <th className="px-3 py-2 text-left">Inbound (kbps)</th>
                <th className="px-3 py-2 text-left">Outbound (kbps)</th>
                <th className="px-3 py-2 text-left">Errors</th>
                <th className="px-3 py-2 text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data.latest_per_interface.length === 0 ? (
                <tr><td className="p-4" colSpan={5}>No interface data</td></tr>
              ) : (
                data.latest_per_interface.map((r: IfRow) => (
                  <tr key={`${r.device_ip} -${r.interface_name} `} className="border-t">
                    <td className="px-3 py-2 font-mono">{r.interface_name}</td>
                    <td className="px-3 py-2">{r.inbound_kbps}</td>
                    <td className="px-3 py-2">{r.outbound_kbps}</td>
                    <td className="px-3 py-2">{r.errors}</td>
                    <td className="px-3 py-2">{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-4">Device Alerts</h2>
        {alerts.filter(a => a.device_ip === data.device_ip).length === 0 ? (
          <div className="text-gray-500 text-sm">No active alerts for this device.</div>
        ) : (
          <div className="space-y-2">
            {alerts.filter(a => a.device_ip === data.device_ip).map(alert => (
              <div key={alert.id} className="p-3 border rounded border-red-200 bg-red-50 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-red-800 uppercase text-xs mr-2">{alert.severity}</span>
                  <span className="text-sm font-medium">{alert.message}</span>
                  <div className="text-xs text-gray-500 mt-1">{new Date(alert.timestamp).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance history */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-4">Performance History</h2>
        {data.performance_history.length === 0 ? (
          <div className="text-sm text-gray-500">No performance history</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...data.performance_history].reverse()}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                  minTickGap={30}
                />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={(val) => new Date(val).toLocaleString()} />
                <Legend />
                <Line type="monotone" dataKey="cpu_pct" stroke="#8884d8" name="CPU %" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="memory_pct" stroke="#82ca9d" name="Memory %" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Traffic history (most recent rows) */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-4">Traffic History</h2>
        {data.traffic_history.length === 0 ? (
          <div className="text-sm text-gray-500">No traffic history</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(() => {
                const points: Record<string, any> = {};
                [...data.traffic_history].reverse().forEach(row => {
                  const ts = new Date(row.timestamp).getTime();
                  if (!points[ts]) points[ts] = { timestamp: row.timestamp, inbound_kbps: 0, outbound_kbps: 0 };
                  points[ts].inbound_kbps += (row.inbound_kbps || 0);
                  points[ts].outbound_kbps += (row.outbound_kbps || 0);
                });
                return Object.values(points).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              })()}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                  minTickGap={30}
                />
                <YAxis />
                <Tooltip labelFormatter={(val) => new Date(val).toLocaleString()} />
                <Legend />
                <Line type="monotone" dataKey="inbound_kbps" stroke="#8884d8" name="Inbound (kbps)" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="outbound_kbps" stroke="#82ca9d" name="Outbound (kbps)" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
