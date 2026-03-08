import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { Device, PerformanceMetrics, Session, Alert, SNMPData } from '../types/types';
import { Link } from 'react-router-dom';
import TowerWidget from '../components/TowerWidget';

export const DevicesPage = () => {
  const [, setDevices] = useState<Device[]>([]);
  const [towersList, setTowersList] = useState<{ name: string; devices: Device[] }[]>([]);
  const [filterTower, setFilterTower] = useState<string | null>(null);
  const [performance, setPerformance] = useState<Record<string, PerformanceMetrics>>({});
  const [, setSessions] = useState<Session[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // SNMP tool state
  const [deviceIp, setDeviceIp] = useState('');
  const [oid, setOid] = useState('');
  const [snmpResult, setSnmpResult] = useState<SNMPData | null>(null);
  const [snmpLoading, setSnmpLoading] = useState(false);
  const [snmpError, setSnmpError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollersRef = useRef<{ [k: string]: number | null }>({});

  const commonOIDs = [
    { name: 'SysDescr', oid: '1.3.6.1.2.1.1.1.0' },
    { name: 'SysUpTime', oid: '1.3.6.1.2.1.1.3.0' },
    { name: 'SysContact', oid: '1.3.6.1.2.1.1.4.0' },
    { name: 'SysName', oid: '1.3.6.1.2.1.1.5.0' },
    { name: 'SysLocation', oid: '1.3.6.1.2.1.1.6.0' },
  ];

  const handleSNMPGet = async () => {
    setSnmpLoading(true);
    setSnmpError(null);
    try {
      const result = await apiService.getSNMPData(deviceIp, oid);
      if (!mountedRef.current) return;
      setSnmpResult(result);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setSnmpError(err instanceof Error ? err.message : 'SNMP GET failed');
    } finally {
      if (mountedRef.current) setSnmpLoading(false);
    }
  };

  const handleSNMPWalk = async () => {
    setSnmpLoading(true);
    setSnmpError(null);
    try {
      const result = await apiService.walkSNMP(deviceIp, oid);
      if (!mountedRef.current) return;
      setSnmpResult(result);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setSnmpError(err instanceof Error ? err.message : 'SNMP WALK failed');
    } finally {
      if (mountedRef.current) setSnmpLoading(false);
    }
  };

  const loadAllOnce = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        apiService.getDevices(),
        apiService.getSessions(),
        apiService.getPerformance(),
        apiService.getAlerts(),
        apiService.getTowers(),
      ]);

      if (!mountedRef.current) return;

      const devs = results[0].status === 'fulfilled' ? results[0].value : [];
      const sess = results[1].status === 'fulfilled' ? results[1].value : [];
      const perf = results[2].status === 'fulfilled' ? results[2].value : [];
      const al = results[3].status === 'fulfilled' ? results[3].value : [];
      const towers = results[4].status === 'fulfilled' ? results[4].value : [];

      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`DevicesPage load[${i}] failed:`, r.reason);
      });

      setDevices(devs as Device[] || []);
      setSessions(sess as Session[] || []);
      setTowersList(towers as { name: string; devices: Device[] }[] || []);

      const perfMap: Record<string, PerformanceMetrics> = {};
      ((perf as PerformanceMetrics[]) || []).forEach(p => {
        if (p.device_ip) perfMap[p.device_ip] = p;
      });
      setPerformance(perfMap);

      setAlerts(al as Alert[] || []);
    } catch (err) {
      console.error('Error loading device data:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // run initial load immediately
    loadAllOnce();

    // polling intervals: tune to your backend cadence
    // devices + performance + alerts: 5s
    pollersRef.current.devices = window.setInterval(() => {
      if (document.hidden) return;
      apiService.getDevices().then(d => { if (mountedRef.current) setDevices(d || []); }).catch(() => { });
      apiService.getPerformance().then(p => {
        if (!mountedRef.current) return;
        const perfMap: Record<string, PerformanceMetrics> = {};
        (p || []).forEach(item => { if (item.device_ip) perfMap[item.device_ip] = item; });
        setPerformance(perfMap);
      }).catch(() => { });
      apiService.getAlerts().then(a => { if (mountedRef.current) setAlerts(a || []); }).catch(() => { });
    }, 5000);

    // sessions: less frequent (8s)
    pollersRef.current.sessions = window.setInterval(() => {
      if (document.hidden) return;
      apiService.getSessions().then(s => { if (mountedRef.current) setSessions(s || []); }).catch(() => { });
    }, 8000);

    return () => {
      mountedRef.current = false;
      // clear intervals
      if (pollersRef.current.devices) clearInterval(pollersRef.current.devices as number);
      if (pollersRef.current.sessions) clearInterval(pollersRef.current.sessions as number);
    };
  }, [loadAllOnce]);


  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading devices…</div>;

  const towersToShow = filterTower
    ? towersList.filter(t => t.name === filterTower)
    : towersList;

  // group logic used in render

  // row render logic

  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-primary rounded-full"></div>
            <h1 className="text-3xl font-black tracking-tight text-foreground uppercase">Network Inventory</h1>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest pl-4">Hardware ecosystem & infrastructure orchestration</p>
        </div>
      </div>

      {/* tower overview widget */}
      <div className="bg-card/30 backdrop-blur-md rounded-2xl border border-border/40 overflow-hidden shadow-sm">
        <TowerWidget towersProp={towersList} onViewDevices={(name: string) => setFilterTower(name)} />
      </div>

      {filterTower && (
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-lg text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <span className="opacity-60">Filtered:</span>
            <span>{filterTower}</span>
          </div>
          <button
            className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest rounded-lg bg-muted/20 hover:bg-muted/40 transition-all border border-transparent hover:border-border/40"
            onClick={() => setFilterTower(null)}
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Devices Table */}
      <div className="bg-card/40 border border-border/40 rounded-2xl shadow-sm backdrop-blur-md overflow-hidden transition-all duration-300 hover:shadow-md">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[11px] text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/40 text-muted-foreground uppercase tracking-widest text-[10px] font-black">
                <th className="px-6 py-5">Intel IP</th>
                <th className="px-6 py-5">Node Identity</th>
                <th className="px-6 py-5">Provider</th>
                <th className="px-6 py-5">Core OS</th>
                <th className="px-6 py-5">Pulse</th>
                <th className="px-6 py-5">Last Active</th>
                <th className="px-6 py-5">CPU/MEM</th>
                <th className="px-6 py-5">RSSI</th>
                <th className="px-6 py-5">Flow</th>
                <th className="px-6 py-5 text-right">Access</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/20">
              {towersToShow.map(tower => (
                <React.Fragment key={`tower-${tower.name}`}>
                  <tr className="bg-primary/[0.03]">
                    <td colSpan={10} className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-4 bg-primary rounded-full"></div>
                        <span className="text-xs font-black text-foreground uppercase tracking-[0.2em]">{tower.name}</span>
                        <span className="text-[10px] font-bold text-muted-foreground/40 italic">[{tower.devices.length} Units]</span>
                      </div>
                    </td>
                  </tr>
                  {tower.devices.map(dev => {
                    const perf = performance[dev.device_ip];
                    const devAlerts = alerts.filter(a => a.device_ip === dev.device_ip);
                    const rawLastSeen = dev.last_seen ?? dev.lastSeen ?? null;
                    let lastSeenStr = '—';
                    if (rawLastSeen) {
                      const d = new Date(rawLastSeen);
                      lastSeenStr = !isNaN(+d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
                    }
                    const cpuVal = (perf && typeof perf.cpu_pct === 'number') ? perf.cpu_pct : (typeof dev.cpu_pct === 'number' ? dev.cpu_pct : null);
                    const sigDbm = dev.signal?.rssi_dbm ?? (dev as any).rssi_dbm ?? (dev as any).rssi ?? null;

                    return (
                      <tr key={dev.device_ip} className="group hover:bg-primary/[0.01] transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-foreground/80">{dev.device_ip}</td>
                        <td className="px-6 py-4 font-bold tracking-tight">{dev.hostname || '—'}</td>
                        <td className="px-6 py-4 text-muted-foreground uppercase font-black text-[9px] tracking-widest">{dev.vendor || '—'}</td>
                        <td className="px-6 py-4 text-muted-foreground font-medium">{dev.os || dev.os_version || '—'}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${dev.status === 'up'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                              }`}
                          >
                            <span className={`w-1 h-1 rounded-full mr-1.5 ${dev.status === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                            {dev.status || 'offline'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground font-mono">{lastSeenStr}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold">{cpuVal != null ? `${cpuVal.toFixed(0)}%` : '—'}<span className="text-[8px] text-muted-foreground ml-1">CPU</span></span>
                            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${cpuVal ?? 0}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground/70">{sigDbm != null ? `${sigDbm}dBm` : '—'}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${devAlerts.length ? 'bg-rose-500 text-white animate-pulse' : 'bg-muted text-muted-foreground/40'}`}>
                              {devAlerts.length}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/devices/${encodeURIComponent(dev.device_ip)}`}
                            className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                          >
                            Intel
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}

              {towersToShow.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-muted-foreground italic font-medium">
                    Sector clear. No active signals detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SNMP Operational Suite */}
      <div className="bg-card/40 border border-border/40 rounded-2xl p-8 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-1.5 h-6 bg-primary/40 rounded-full"></div>
          <h2 className="text-sm font-black text-foreground uppercase tracking-[0.2em]">SNMP Operational Suite</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* SNMP GET */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Target Acquisition</h3>
              <div className="text-[8px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">Mode: GET</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-muted-foreground/60 uppercase ml-1">Interface IP</label>
                <input
                  type="text"
                  placeholder="0.0.0.0"
                  value={deviceIp}
                  onChange={e => setDeviceIp(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/20 border border-border/40 rounded-xl text-xs font-mono focus:border-primary transition-all outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-bold text-muted-foreground/60 uppercase ml-1">Objective OID</label>
                <input
                  type="text"
                  placeholder="1.3.6.1..."
                  value={oid}
                  onChange={e => setOid(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/20 border border-border/40 rounded-xl text-xs font-mono focus:border-primary transition-all outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {commonOIDs.map(item => (
                <button
                  key={item.oid}
                  onClick={() => setOid(item.oid)}
                  className="px-3 py-1.5 bg-muted/40 text-muted-foreground rounded-lg hover:bg-primary/10 hover:text-primary text-[9px] font-black uppercase tracking-widest transition-all border border-transparent hover:border-primary/20"
                >
                  {item.name}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSNMPGet}
                disabled={snmpLoading}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40"
              >
                {snmpLoading ? 'Engaging...' : 'Engage GET'}
              </button>
              <button
                onClick={handleSNMPWalk}
                disabled={snmpLoading}
                className="flex-1 py-3 bg-muted text-muted-foreground border border-border/40 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-muted/60 transition-all disabled:opacity-40"
              >
                {snmpLoading ? 'Scanning...' : 'Sector Walk'}
              </button>
            </div>
          </div>

          {/* Results Console */}
          <div className="flex flex-col h-full min-h-[240px]">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">Tactical Console</h3>
            <div className="flex-grow bg-slate-950 rounded-2xl p-6 font-mono text-[11px] border border-white/5 relative group overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

              {!snmpResult && !snmpLoading && !snmpError && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/20 italic">
                  <span className="text-lg mb-2">_</span>
                  <span>Awaiting transmission...</span>
                </div>
              )}

              {snmpLoading && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-primary animate-pulse tracking-widest uppercase text-[10px] font-black">Interrogating Node...</span>
                </div>
              )}

              {snmpError && (
                <div className="text-rose-500 bg-rose-500/10 p-4 rounded-xl border border-rose-500/20">
                  <span className="block font-black uppercase text-[9px] mb-1">Critical Fault:</span>
                  {snmpError}
                </div>
              )}

              {snmpResult && (
                <div className="space-y-4 overflow-y-auto max-h-[300px] scrollbar-hide">
                  {Array.isArray(snmpResult) ? (
                    snmpResult.map((entry, idx) => (
                      <div key={idx} className="border-l-2 border-primary/20 pl-4 py-1 space-y-1">
                        {Object.entries(entry).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-4 gap-4">
                            <span className="text-primary/60 font-black uppercase text-[9px]">{k}</span>
                            <span className="col-span-3 text-emerald-400 break-all">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(snmpResult).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-4 gap-4">
                          <span className="text-primary/60 font-black uppercase text-[9px]">{k}</span>
                          <span className="col-span-3 text-emerald-400 break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
