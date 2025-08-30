import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiService } from '../services/apiService';
import type {
  DeviceDetailsResponse,
  PerfHistoryEntry,
  TrafficHistoryEntry,
  IfRow,
} from '../types/types';

export const DeviceDetailsPage: React.FC = () => {
  const { deviceIp } = useParams<{ deviceIp: string }>();
  const [data, setData] = useState<DeviceDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceIp) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await apiService.getDeviceDetails(decodeURIComponent(deviceIp));
        setData(resp);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load device details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deviceIp]);

  if (loading) return <div className="p-6 text-center">Loading device details…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6">No data</div>;

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
            <div><strong>Uptime (s)</strong><div>{data.snapshot.uptime_seconds ?? '—'}</div></div>
            <div><strong>Timestamp</strong><div>{data.snapshot.timestamp ? new Date(data.snapshot.timestamp).toLocaleString() : '—'}</div></div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-gray-600">No snapshot available</div>
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
                  <tr key={`${r.device_ip}-${r.interface_name}`} className="border-t">
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

      {/* Performance history */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold">Performance History</h2>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">CPU %</th>
                <th className="px-3 py-2 text-left">Memory %</th>
              </tr>
            </thead>
            <tbody>
              {data.performance_history.length === 0 ? (
                <tr><td className="p-4" colSpan={3}>No performance history</td></tr>
              ) : (
                data.performance_history.map((p: PerfHistoryEntry, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{new Date(p.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2">{p.cpu_pct}</td>
                    <td className="px-3 py-2">{p.memory_pct}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traffic history (most recent rows) */}
      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold">Traffic History</h2>
        <div className="overflow-x-auto mt-2">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Interface</th>
                <th className="px-3 py-2 text-left">Inbound (kbps)</th>
                <th className="px-3 py-2 text-left">Outbound (kbps)</th>
                <th className="px-3 py-2 text-left">Errors</th>
              </tr>
            </thead>
            <tbody>
              {data.traffic_history.length === 0 ? (
                <tr><td className="p-4" colSpan={5}>No traffic history</td></tr>
              ) : (
                data.traffic_history.map((t: TrafficHistoryEntry, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{new Date(t.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono">{t.interface_name}</td>
                    <td className="px-3 py-2">{t.inbound_kbps}</td>
                    <td className="px-3 py-2">{t.outbound_kbps}</td>
                    <td className="px-3 py-2">{t.errors}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
