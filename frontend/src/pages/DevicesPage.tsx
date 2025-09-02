// src/pages/DevicesPage.tsx - Fixed dark theme and improved styling

import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { Device, PerformanceMetrics, Session, Alert, SNMPData } from '../types/types';
import { Link } from 'react-router-dom';

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [performance, setPerformance] = useState<Record<string, PerformanceMetrics>>({});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // SNMP tool state
  const [deviceIp, setDeviceIp] = useState('');
  const [oid, setOid] = useState('');
  const [snmpResult, setSnmpResult] = useState<SNMPData | null>(null);
  const [snmpLoading, setSnmpLoading] = useState(false);
  const [snmpError, setSnmpError] = useState<string | null>(null);

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
      setSnmpResult(result);
    } catch (err: unknown) {
      setSnmpError(err instanceof Error ? err.message : 'SNMP GET failed');
    } finally {
      setSnmpLoading(false);
    }
  };

  const handleSNMPWalk = async () => {
    setSnmpLoading(true);
    setSnmpError(null);
    try {
      const result = await apiService.walkSNMP(deviceIp, oid);
      setSnmpResult(result);
    } catch (err: unknown) {
      setSnmpError(err instanceof Error ? err.message : 'SNMP WALK failed');
    } finally {
      setSnmpLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [devs, sess, perf, al] = await Promise.all([
          apiService.getDevices(),
          apiService.getSessions(),
          apiService.getPerformance(),
          apiService.getAlerts(),
        ]);

        setDevices(devs || []);
        setSessions(sess || []);

        const perfMap: Record<string, PerformanceMetrics> = {};
        (perf || []).forEach(p => {
          if (p.device_ip) perfMap[p.device_ip] = p;
        });
        setPerformance(perfMap);

        setAlerts(al || []);
      } catch (err) {
        console.error('Error loading device data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getLatestSessionForDevice = (ip: string): Session | null => {
    const ds = sessions.filter(s => s.device_ip === ip && s.start_time);
    if (ds.length === 0) return null;
    ds.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    return ds[0];
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading devices…</div>;

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-xl font-bold text-foreground">Devices</h1>

      {/* Devices Table - Fixed dark theme */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hostname</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">OS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Seen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPU %</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Memory %</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Auth</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auth User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Auth Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devices.map(dev => {
                const perf = performance[dev.device_ip];
                const devSessions = sessions.filter(s => s.device_ip === dev.device_ip);
                const devAlerts = alerts.filter(a => a.device_ip === dev.device_ip);

                const rawLastSeen = dev.last_seen ?? dev.lastSeen ?? null;
                let lastSeenStr = '—';
                if (rawLastSeen) {
                  const d = new Date(rawLastSeen);
                  lastSeenStr = !isNaN(+d) ? d.toLocaleString() : '—';
                }
                const latest = getLatestSessionForDevice(dev.device_ip);

                const lastAuthMethod = latest?.authenticated_via ?? '—';
                const lastAuthUser = latest?.username ?? '—';
                const lastAuthTime = latest?.start_time ? new Date(latest.start_time).toLocaleString() : '—';

                return (
                  <tr key={dev.device_ip} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-foreground">{dev.device_ip}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{dev.hostname || '—'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{dev.vendor || '—'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{dev.os || dev.os_version || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          dev.status === 'up'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : dev.status === 'unknown'
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {dev.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{lastSeenStr}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {(() => {
                        const cpuVal = (perf && typeof perf.cpu_pct === 'number') ? perf.cpu_pct
                          : (typeof dev.cpu_pct === 'number' ? dev.cpu_pct : null);
                        return cpuVal !== null && cpuVal !== undefined ? cpuVal.toFixed(1) : '—';
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {(() => {
                        const memVal = (perf && typeof perf.memory_pct === 'number') ? perf.memory_pct
                          : (typeof dev.memory_pct === 'number' ? dev.memory_pct : null);
                        return memVal !== null && memVal !== undefined ? memVal.toFixed(1) : '—';
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{devSessions.length}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lastAuthMethod}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{lastAuthUser}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{lastAuthTime}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/devices/${encodeURIComponent(dev.device_ip)}`}
                        className="inline-flex items-center px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
                      >
                        Details
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-destructive/10 text-destructive rounded-full text-xs font-medium">
                        {devAlerts.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SNMP Tools - Enhanced styling */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground mb-6">SNMP Tools</h2>

        {/* SNMP GET */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">SNMP GET</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Device IP"
              value={deviceIp}
              onChange={e => setDeviceIp(e.target.value)}
              className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <input
              type="text"
              placeholder="OID"
              value={oid}
              onChange={e => setOid(e.target.value)}
              className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {commonOIDs.map(item => (
              <button
                key={item.oid}
                onClick={() => setOid(item.oid)}
                className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 text-sm font-medium transition-colors"
              >
                {item.name}
              </button>
            ))}
          </div>
          <button
            onClick={handleSNMPGet}
            disabled={snmpLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {snmpLoading ? 'Fetching…' : 'SNMP GET'}
          </button>
        </div>

        {/* SNMP WALK */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">SNMP WALK</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Device IP"
              value={deviceIp}
              onChange={e => setDeviceIp(e.target.value)}
              className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <input
              type="text"
              placeholder="OID"
              value={oid}
              onChange={e => setOid(e.target.value)}
              className="px-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 font-mono text-sm"
            />
          </div>
          <button
            onClick={handleSNMPWalk}
            disabled={snmpLoading}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {snmpLoading ? 'Walking…' : 'SNMP WALK'}
          </button>
        </div>

        {snmpError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
            <p className="text-destructive text-sm font-medium">{snmpError}</p>
          </div>
        )}

        {snmpResult && (
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium text-foreground mb-3">SNMP Result:</h4>
            {Array.isArray(snmpResult) ? (
              snmpResult.map((entry, idx) => (
                <div key={idx} className="bg-card border border-border rounded-lg p-3">
                  {Object.entries(entry).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-start py-1">
                      <span className="font-medium text-foreground text-sm">{k}:</span>
                      <span className="text-muted-foreground text-sm ml-4 break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="bg-card border border-border rounded-lg p-3">
                {Object.entries(snmpResult).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start py-1">
                    <span className="font-medium text-foreground text-sm">{k}:</span>
                    <span className="text-muted-foreground text-sm ml-4 break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};