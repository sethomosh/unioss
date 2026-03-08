// src/components/TowerWidget.tsx
import { useEffect, useState } from 'react';
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
    arr.sort((a: { ts: string }, b: { ts: string }) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0));
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
        else if (typeof det?.latest_throughput === 'number') kbps = Number(det.latest_throughput);
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
    <div className="p-0 grid gap-6">
      <div className="bg-card/40 border border-border/40 rounded-2xl shadow-sm backdrop-blur-md p-6 group">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-primary rounded-full"></div>
            <h3 className="text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {overview?.towerName ?? activeTower?.name ?? 'Tower Overview'}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="tower selector">
            {towers && towers.length ? (
              towers.map((t, i) => {
                const stats = perTowerStats[i] ?? { total: (t.devices || []).length, up: 0, down: 0 };
                return (
                  <button
                    key={t.name}
                    onClick={() => setActive(i)}
                    aria-pressed={i === active}
                    className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center gap-3 transition-all duration-300 ${i === active
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent hover:border-border/60'
                      }`}
                  >
                    <span>{t.name}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] ${i === active ? 'bg-white/20' : 'bg-background/50'
                      }`}>
                      {stats.up}/{stats.total}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground italic px-2">No towers discovered</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Health Status</div>
              <div className="flex items-center gap-4">
                <span
                  className={`inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide shadow-sm ${towerStatus === 'online'
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                      : towerStatus === 'offline'
                        ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                        : 'bg-muted/20 text-muted-foreground border border-border/20'
                    }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-2 ${towerStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  {towerStatus}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-foreground">{totalDevices ?? '—'}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Nodes</span>
                </div>
              </div>

              <div className="mt-4 flex gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Up:</span>
                  <span className="text-emerald-600 font-bold">{upCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Down:</span>
                  <span className="text-rose-600 font-bold">{downCount}</span>
                </div>
              </div>

              {downNames.length > 0 && (
                <div className="mt-3 p-3 bg-muted/30 rounded-xl border border-border/30">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Downstream Assets</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {downNames.slice(0, 4).join(', ')}
                    {downNames.length > 4 ? ` (+${downNames.length - 4} more)` : ''}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/20 rounded-2xl border border-border/20">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Averaged Telemetry</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 mb-1">LOAD (CPU/MEM)</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold">{overview?.avgCpu ? `${Math.round(overview.avgCpu)}%` : '—'}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-xl font-bold">{overview?.avgMemory ? `${Math.round(overview.avgMemory)}%` : '—'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 mb-1">SIGNAL (RSSI)</div>
                  <div className="text-xl font-bold">{overview?.avgRssi ? `${Math.round(overview.avgRssi)} dBm` : '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Live Throughput Analysis</div>
            <div className="flex-grow bg-muted/10 rounded-2xl border border-border/20 p-4 transition-all hover:bg-muted/20">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
                  </div>
                </div>
              ) : deviceChartData && deviceChartData.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={deviceChartData} margin={{ top: 10, left: 0, right: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                    <XAxis
                      dataKey="name"
                      tickFormatter={tickFormatter}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)', fontWeight: 600 }}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.1 }}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        fontSize: '11px',
                        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
                      }}
                    />
                    <Bar dataKey="v" fill="url(#barGradient)" radius={[4, 4, 0, 0]} barSize={20} isAnimationActive={true} />
                  </BarChart>
                </ResponsiveContainer>
              ) : timeSeries && timeSeries.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={timeSeries}>
                    <XAxis dataKey="ts" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="v" dot={false} stroke="var(--primary)" strokeWidth={3} isAnimationActive={true} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">No Stream Data</span>
                </div>
              )}
            </div>
            <div className="mt-3 text-[10px] font-bold text-muted-foreground/60 uppercase text-right tracking-tight italic">
              {deviceChartData && deviceChartData.length ? `Peak analysis for top ${deviceChartData.length} units` : timeSeries && timeSeries.length ? `Aggregate flow telemetry` : `Dormant state`}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 flex justify-end gap-3">
          <button
            className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            onClick={() => {
              if (!loading && onViewDevices && activeTower) onViewDevices(activeTower.name);
            }}
            disabled={loading || !activeTower}
          >
            {loading ? 'Initializing...' : 'Access Grid'}
          </button>
        </div>
      </div>
    </div>
  );
}
