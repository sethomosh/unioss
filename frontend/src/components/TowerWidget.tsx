import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

export default function TowerWidget() {
  const [towers, setTowers] = useState<{ name: string; devices: any[] }[]>([]);
  const [active, setActive] = useState<number>(0);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiService.getTowers().then(ts => { if (mounted) setTowers(ts || []); }).catch(() => { /* ignore */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!towers || towers.length === 0) return;
    const name = towers[active]?.name;
    if (!name) return;
    let mounted = true;
    setLoading(true);
    apiService.getTowerOverview(name).then(o => { if (!mounted) return; setOverview(o); setLoading(false); }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [active, towers]);

  if (!towers.length) return null;

  const activeTower = towers[active];
  const spikes = Array.isArray(overview?.trafficSpark) ? overview.trafficSpark.slice().sort((a: any, b: any) => String(a.ts).localeCompare(String(b.ts))) : (overview ? [] : []);

  return (
    <div className="p-4 grid gap-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">tower overview</h3>
          <div className="flex space-x-2" role="tablist" aria-label="tower selector">
            {towers.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={`px-3 py-1 rounded-md text-sm ${i===active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {t.name} ({t.devices.length})
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500">devices</div>
            <div className="text-2xl font-bold">{overview ? overview.counts.total : activeTower.devices.length}</div>
            <div className="text-sm text-slate-500">
              up: {overview ? overview.counts.up : '—'} • down: {overview ? overview.counts.down : '—'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">avg cpu</div>
            <div className="text-2xl font-bold">{overview?.avgCpu ? `${Math.round(overview.avgCpu)}%` : '—'}</div>
            <div className="text-sm text-slate-500">avg rssi: {overview?.avgRssi ? `${Math.round(overview.avgRssi)} dBm` : '—'}</div>
          </div>

          <div className="col-span-2">
            <div className="text-xs text-slate-500">traffic (recent)</div>
            <div className="h-24 bg-slate-50 rounded p-2">
              {loading ? (
                <div className="text-sm text-slate-400">loading...</div>
              ) : spikes.length ? (
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart data={spikes.map((s: any) => ({ ts: s.ts, v: Math.round(s.throughput) }))}>
                    <Line type="monotone" dataKey="v" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-slate-400">no data</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            className="px-3 py-1 rounded bg-sky-600 text-white text-sm disabled:opacity-60"
            onClick={() => {/* open filtered devices table, optional */}}
            disabled={loading}
            aria-disabled={loading}
          >
            {loading ? 'loading…' : 'view devices'}
          </button>
        </div>
      </div>
    </div>
  );
}
