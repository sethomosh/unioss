// src/components/TowerWidget.tsx
import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';

type Tower = { name: string; devices: any[] };
type Props = {
  onViewDevices?: (towerName: string) => void;
  towersProp?: Tower[]; // optional list passed from parent to avoid double fetch / races
};

export default function TowerWidget({ onViewDevices, towersProp }: Props) {
  const [internalTowers, setInternalTowers] = useState<Tower[]>([]);
  const [active, setActive] = useState<number>(0);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Array.isArray(towersProp) && towersProp.length) return;
    let mounted = true;
    (async () => {
      try {
        // try ip-groups first (auto /24) — this returns same shape as getTowers()
        const serverTowers = await apiService.getTowers();
        if (!mounted) return;
        if (Array.isArray(serverTowers) && serverTowers.length) {
          console.debug('[TowerWidget] using server towers', serverTowers.map(t => ({ name: t.name, count: t.devices.length })));
          setInternalTowers(serverTowers);
          return;
        }

        // fallback: original tower grouping
        const groups = await apiService.getIPGroups();
        if (!mounted) return;
        if (Array.isArray(groups) && groups.length) {
          console.debug('[TowerWidget] using ip-groups fallback', groups.map(g => ({ name: g.name, count: g.devices.length })));
          setInternalTowers(groups);
          return;
        }

        // last-resort: client-side grouping (apiService.getTowers() already tried server and fallback, but preserve defensiveness)
        const ts = await apiService.getTowers();
        if (!mounted) return;
        console.debug('[TowerWidget] final fallback towers', ts.map(t => ({ name: t.name, count: t.devices.length })));
        setInternalTowers(ts || []);
      } catch (err) {
        console.error('[TowerWidget] failed to load towers/groups', err);
        if (mounted) setInternalTowers([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [towersProp]);
  const towers = (Array.isArray(towersProp) && towersProp.length) ? towersProp : internalTowers;

  // per-tower quick stats (used for selector badges)
  const perTowerStats = Array.isArray(towers)
    ? towers.map(t => {
        const total = Array.isArray(t.devices) ? t.devices.length : 0;
        const up = Array.isArray(t.devices)
          ? t.devices.filter((d: any) => {
              // canonical status check
              const rawStatus = (d?.status ?? (typeof d?.online === 'boolean' ? (d.online ? 'up' : 'down') : undefined));
              if (String(rawStatus || '').toLowerCase() === 'up') return true;

              // evidence-based heuristics: treat presence of recent fields as up
              if (d?.last_seen || d?.lastSeen || d?.lastSeenAt) return true;
              if (typeof d?.cpu_pct === 'number' && !Number.isNaN(d.cpu_pct)) return true;
              if (d?.signal && (d.signal.rssi_dbm != null || d.signal.rssi_pct != null)) return true;
              // some backends include snapshot / latest_per_interface
              if (d?.snapshot?.timestamp || (Array.isArray(d?.latest_per_interface) && d.latest_per_interface.length)) return true;
              // fallback: if device has traffic or interfaces arrays with values
              if (Array.isArray(d?.interfaces) && d.interfaces.length) return true;
              return false;
            }).length
          : 0;
        return { name: t.name, total, up, down: Math.max(0, total - up) };
      })
    : [];

  useEffect(() => {
    if (!towers || towers.length === 0) {
      setActive(0);
      setOverview(null);
      return;
    }
    if (active >= towers.length) setActive(0);
  }, [towers, active]);

  useEffect(() => {
    if (!towers || towers.length === 0) return;
    const name = towers[active]?.name;
    if (!name) return;
    let mounted = true;
    setOverview(null);
    setLoading(true);

    // try the service overview first (works for native "towers")
    apiService.getTowerOverview(name)
      .then(async (o) => {
        if (!mounted) return;
        if (o) {
          setOverview(o);
          return;
        }

        // fallback: name probably came from ip-groups. build a lightweight overview here
        // batch device detail fetches to avoid hammering the network
        const devicesInGroup = towers[active]?.devices ?? [];
        const batchSize = 6;
        const detailResults: any[] = [];
        for (let i = 0; i < devicesInGroup.length; i += batchSize) {
          const batch = devicesInGroup.slice(i, i + batchSize).map((d: any) =>
            apiService.getDeviceDetails(d.device_ip).catch(() => null)
          );
          // eslint-disable-next-line no-await-in-loop
          const resolved = await Promise.all(batch);
          detailResults.push(...resolved);
        }

        if (!mounted) return;

        // compute simple aggregates (keeps shape compatible with existing consumers)
        const counts = { total: devicesInGroup.length, up: 0, down: 0 };
        let cpuSum = 0, cpuCnt = 0, memSum = 0, memCnt = 0, rssiSum = 0, rssiCnt = 0;
        const deviceList: { device_ip: string; hostname: string; status: string }[] = [];

        for (let i = 0; i < devicesInGroup.length; i++) {
          const top = devicesInGroup[i];
          const det = detailResults[i] ?? null;
          const detStatus = det?.status ?? det?.snapshot?.status ?? null;
          const topStatus = top.status ?? (top.online ? 'up' : 'down');
          const status = (detStatus ?? topStatus) as string;
          if (String(status).toLowerCase() === 'up') counts.up += 1;
          else counts.down += 1;

          if (det?.snapshot?.cpu_pct != null) { cpuSum += Number(det.snapshot.cpu_pct); cpuCnt++; }
          else if (typeof top.cpu_pct === 'number') { cpuSum += Number(top.cpu_pct); cpuCnt++; }

          if (det?.snapshot?.memory_pct != null) { memSum += Number(det.snapshot.memory_pct); memCnt++; }
          else if (typeof top.memory_pct === 'number') { memSum += Number(top.memory_pct); memCnt++; }

          const sig = det?.signal ?? det?.snapshot?.signal ?? top.signal ?? null;
          if (sig && sig.rssi_dbm != null) { rssiSum += Number(sig.rssi_dbm); rssiCnt++; }

          deviceList.push({
            device_ip: top.device_ip,
            hostname: top.hostname ?? top.name ?? top.device_ip,
            status: status ?? 'unknown',
          });
        }

        const avgCpu = cpuCnt ? cpuSum / cpuCnt : null;
        const avgMemory = memCnt ? memSum / memCnt : null;
        const avgRssi = rssiCnt ? rssiSum / rssiCnt : null;

        const fallbackOverview = {
          towerName: name,
          counts,
          avgCpu,
          avgMemory,
          avgRssi,
          trafficSpark: [], // we skip heavy sparkline aggregation here
          devices: devicesInGroup,
          details: detailResults,
          deviceList,
        };

        if (mounted) setOverview(fallbackOverview);
      })
      .catch(() => {
        if (mounted) setOverview(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [active, towers]);
  const activeTower = towers?.[active] ?? towers?.[0] ?? null;

  // normalized device list (prefer overview.deviceList, else derive from tower devices)
  const deviceList: { device_ip: string; hostname: string; status: string }[] =
    overview?.deviceList ??
    (activeTower?.devices?.map((d: any) => {
      // generous "up" detection for discovery items
      const rawStatus = (d?.status ?? (typeof d?.online === 'boolean' ? (d.online ? 'up' : 'down') : undefined));
      const hasLastSeen = !!(d?.last_seen || d?.lastSeen || d?.lastSeenAt);
      const hasTelemetry = (typeof d?.cpu_pct === 'number' && !Number.isNaN(d.cpu_pct)) ||
                          (d?.signal && (d.signal.rssi_dbm != null || d.signal.rssi_pct != null)) ||
                          (Array.isArray(d?.interfaces) && d.interfaces.length);
      const isUp = String(rawStatus || '').toLowerCase() === 'up' || hasLastSeen || !!hasTelemetry;
      return {
        device_ip: d.device_ip,
        hostname: d.hostname ?? d.name ?? d.device_ip,
        status: isUp ? 'up' : 'down',
      };
    }) ?? []);

  const totalDevices = overview?.counts?.total ?? (activeTower ? activeTower.devices.length : deviceList.length);
  const upCount = overview?.counts?.up ?? deviceList.filter(d => d.status === 'up').length;
  const downCount = typeof overview?.counts?.down === 'number' ? overview.counts.down : Math.max(0, totalDevices - upCount);
  const downNames = deviceList.filter(d => d.status !== 'up').map(d => d.hostname);
// robust tower online detection: prefer overview counts but fall back to telemetry evidence
function isTowerOnline(): boolean {
  // if overview exists, prefer its counts (but accept telemetry evidence even when counts.up === 0)
  if (overview) {
    if (overview.counts && overview.counts.up > 0) return true;
    // evidence: avgCpu, avgRssi, traffic samples, or details containing snapshots/interfaces/signal
    if ((overview.avgCpu && overview.avgCpu > 0) ||
        (overview.avgRssi != null) ||
        (Array.isArray(overview.trafficSpark) && overview.trafficSpark.length > 0)) return true;
    if (Array.isArray(overview.details) && overview.details.some((det: any) =>
        det?.snapshot?.timestamp || (Array.isArray(det?.latest_per_interface) && det.latest_per_interface.length) || det?.signal?.rssi_dbm != null
    )) return true;
    return false;
  }

  // no overview: rely on deviceList heuristics (from fallback mapping above)
  if (upCount > 0) return true;
  if (deviceList.some(d => !!(d && (d.status === 'up')))) return true;
  // if we have devices but none are up, treat as offline
  return false;
}

const towerStatus = isTowerOnline() ? 'online' : (totalDevices === 0 ? 'unknown' : 'offline');

  // helper: short tick formatter for x-axis labels
  function tickFormatter(val: string) {
    if (!val) return '';
    if (val.length <= 12) return val;
    return val.slice(0, 10) + '…';
  }

  // build a time-series chart from overview.trafficSpark if available (fallback)
  function buildTimeSeriesFromOverview() {
    if (!Array.isArray(overview?.trafficSpark) || overview.trafficSpark.length === 0) return [];
    const arr = overview.trafficSpark.slice().map((s: any) => {
      const ts = s.ts ?? s.timestamp ?? s.time ?? '';
      const v = Number(s.throughput ?? s.v ?? s.value ?? 0) || 0;
      return { ts: String(ts), v };
    });
    arr.sort((a, b) => (Date.parse(String(a.ts)) || 0) - (Date.parse(String(b.ts)) || 0));
    return arr;
  }

  // normalize status lookup helper for overview.details items
  function lookupStatusForDevice(deviceIp?: string, hostname?: string) {
    if (!deviceList || !deviceList.length) return 'unknown';
    if (deviceIp) {
      const f = deviceList.find(d => d.device_ip === deviceIp);
      if (f) return f.status ?? 'unknown';
    }
    if (hostname) {
      const f = deviceList.find(d => d.hostname === hostname);
      if (f) return f.status ?? 'unknown';
    }
    return 'unknown';
  }

  // compute per-device throughput (kbps), prefer latest_per_interface > traffic_history last sample > compute delta
  function buildPerDeviceThroughput() {
    if (!overview?.details || !Array.isArray(overview.details) || overview.details.length === 0) return [];

    const perDevice: { device_ip: string; hostname: string; kbps: number; status: string }[] = [];

    for (const det of overview.details) {
      const ip = det?.device_ip ?? det?.device ?? det?.ip ?? null;
      const hostname = det?.hostname ?? det?.name ?? ip ?? 'device';

      let kbps = 0;

      // 1) prefer latest_per_interface (sum across interfaces)
      if (Array.isArray(det?.latest_per_interface) && det.latest_per_interface.length) {
        kbps = det.latest_per_interface.reduce((acc: number, it: any) => {
          const inK = Number(it.inbound_kbps ?? it.in_kbps ?? it.inbound ?? 0) || 0;
          const outK = Number(it.outbound_kbps ?? it.out_kbps ?? it.outbound ?? 0) || 0;
          if (inK || outK) return acc + inK + outK;
          // fallback: if latest_per_interface only has octets, try sample conversion (best-effort)
          const inOct = Number(it.in_octets ?? it.in_bytes ?? 0);
          const outOct = Number(it.out_octets ?? it.out_bytes ?? 0);
          if (inOct || outOct) {
            const secs = Number(it.interval_seconds ?? 3600) || 3600;
            return acc + (((inOct + outOct) * 8) / (secs * 1000));
          }
          return acc;
        }, 0);
      }

      // 2) else try last entry in traffic_history
      if (!kbps && Array.isArray(det?.traffic_history) && det.traffic_history.length) {
        const hist = det.traffic_history.slice().sort((a: any, b: any) => {
          const ta = Date.parse(String(a.timestamp ?? a.ts ?? a.time)) || 0;
          const tb = Date.parse(String(b.timestamp ?? b.ts ?? b.time)) || 0;
          return ta - tb;
        });
        const last = hist[hist.length - 1];
        if (last) {
          const inK = Number(last.inbound_kbps ?? last.in_kbps ?? last.inbound ?? 0);
          const outK = Number(last.outbound_kbps ?? last.out_kbps ?? last.outbound ?? 0);
          if (inK || outK) kbps = inK + outK;
          else {
            const prev = hist.length > 1 ? hist[hist.length - 2] : null;
            const curBytes = Number(last.in_octets ?? last.in_bytes ?? 0) + Number(last.out_octets ?? last.out_bytes ?? 0);
            const prevBytes = prev ? (Number(prev.in_octets ?? prev.in_bytes ?? 0) + Number(prev.out_octets ?? prev.out_bytes ?? 0)) : NaN;
            if (!Number.isNaN(prevBytes) && prev) {
              const tcur = Date.parse(String(last.timestamp ?? last.ts ?? last.time)) || 0;
              const tprev = Date.parse(String(prev.timestamp ?? prev.ts ?? prev.time)) || 0;
              const deltaSec = Math.max(1, Math.floor((tcur - tprev) / 1000));
              const deltaBytes = Math.max(0, curBytes - prevBytes);
              kbps = ((deltaBytes * 8) / (deltaSec * 1000)) || 0;
            } else {
              const secs = Number(last.interval_seconds ?? 3600);
              if (curBytes) kbps = (((curBytes) * 8) / (secs * 1000)) || 0;
            }
          }
        }
      }

      // 3) last-resort: try snapshot or top-level fields
      if (!kbps) {
        const snap = det?.snapshot ?? {};
        const inK = Number(snap.inbound_kbps ?? snap.in_kbps ?? snap.inbound ?? 0);
        const outK = Number(snap.outbound_kbps ?? snap.out_kbps ?? snap.outbound ?? 0);
        if (inK || outK) kbps = inK + outK;
        else if (typeof det.latest_throughput === 'number') kbps = Number(det.latest_throughput);
      }

      const status = lookupStatusForDevice(ip, hostname) ?? 'unknown';
      perDevice.push({ device_ip: ip, hostname, kbps: Number(kbps || 0), status });
    }

    // prefer 'up' devices, then by kbps descending
    perDevice.sort((a, b) => {
      const aUp = String(a.status).toLowerCase() === 'up';
      const bUp = String(b.status).toLowerCase() === 'up';
      if (aUp !== bUp) return aUp ? -1 : 1;
      return b.kbps - a.kbps;
    });

    return perDevice.slice(0, 8);
  }

  const perDeviceThroughput = buildPerDeviceThroughput();
  const deviceChartData = perDeviceThroughput.map(d => ({ name: d.hostname || d.device_ip, v: Number(d.kbps || 0), fullName: d.hostname }));

  const timeSeries = buildTimeSeriesFromOverview();

  return (
    <div className="p-4 grid gap-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{overview?.towerName ?? activeTower?.name ?? 'tower overview'}</h3>

          <div className="flex space-x-2" role="tablist" aria-label="tower selector">
            {towers && towers.length ? (
              towers.map((t, i) => {
                const stats = perTowerStats[i] ?? { total: (t.devices || []).length, up: 0, down: 0 };
                return (
                  <button
                    key={t.name}
                    onClick={() => setActive(i)}
                    aria-pressed={i === active}
                    className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 ${i === active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-700 text-slate-600">{stats.up}/{stats.total}</span>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-400 px-2">no towers discovered</div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500">status</div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                  towerStatus === 'online'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : towerStatus === 'offline'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                }`}
              >
                {towerStatus}
              </span>
              <div className="text-xs text-slate-500">devices</div>
              <div className="text-2xl font-bold ml-2">{totalDevices ?? '—'}</div>
            </div>

            <div className="text-sm text-slate-500 mt-2">
              down: <span className="font-medium">{upCount}</span> • up: <span className="font-medium">{downCount}</span>
            </div>

            {downNames.length > 0 && (
              <div className="mt-2 text-xs text-slate-600">
                up: {downNames.slice(0, 4).join(', ')}
                {downNames.length > 4 ? ` +${downNames.length - 4} more` : ''}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-slate-500">avg cpu / avg mem</div>
            <div className="flex items-baseline gap-3">
              <div className="text-2xl font-bold">{overview?.avgCpu ? `${Math.round(overview.avgCpu)}%` : '—'}</div>
              <div className="text-lg text-slate-500">/</div>
              <div className="text-2xl font-bold">{overview?.avgMemory ? `${Math.round(overview.avgMemory)}%` : '—'}</div>
            </div>
            <div className="text-sm text-slate-500 mt-1">avg rssi: {overview?.avgRssi ? `${Math.round(overview.avgRssi)} dBm` : '—'}</div>
          </div>

          <div className="col-span-2">
            <div className="text-xs text-slate-500">traffic (top devices)</div>
            <div className="h-28 bg-slate-50 rounded p-2">
              {loading ? (
                <div className="text-sm text-slate-400">loading...</div>
              ) : deviceChartData && deviceChartData.length ? (
                <ResponsiveContainer width="100%" height={72}>
                  <BarChart data={deviceChartData} margin={{ left: 6, right: 6 }}>
                    <CartesianGrid vertical={false} horizontal={false} />
                    <XAxis dataKey="name" tickFormatter={tickFormatter} interval={0} height={34} />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} kbps`} />
                    <Bar dataKey="v" barSize={14} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : timeSeries && timeSeries.length ? (
                <ResponsiveContainer width="100%" height={72}>
                  <LineChart data={timeSeries}>
                    <XAxis dataKey="ts" hide />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} kbps`} />
                    <Line type="monotone" dataKey="v" dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-slate-400">no data</div>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {deviceChartData && deviceChartData.length ? `showing top ${deviceChartData.length} devices by throughput` : timeSeries && timeSeries.length ? `showing recent aggregate traffic` : `no data`}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button
            className="px-3 py-1 rounded bg-sky-600 text-white text-sm disabled:opacity-60"
            onClick={() => {
              if (!loading && onViewDevices && activeTower) onViewDevices(activeTower.name);
            }}
            disabled={loading || !activeTower}
            aria-disabled={loading || !activeTower}
          >
            {loading ? 'loading…' : 'view devices'}
          </button>
        </div>
      </div>
    </div>
  );
}
