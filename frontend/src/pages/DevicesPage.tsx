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

  if (loading) return <div className="p-4 text-center">Loading devices…</div>;

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Devices</h1>

      {/* Devices Table */}
      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">IP</th>
              <th className="px-4 py-2 text-left">Hostname</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">OS</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last Seen</th>
              <th className="px-4 py-2 text-left">CPU %</th>
              <th className="px-4 py-2 text-left">Memory %</th>
              <th className="px-4 py-2 text-left">Sessions</th>
              <th className="px-4 py-2 text-left">Details</th>
              <th className="px-4 py-2 text-left">Alerts</th>
            </tr>
          </thead>
          <tbody>
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

              return (
                <tr key={dev.device_ip} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{dev.device_ip}</td>
                  <td className="px-4 py-2">{dev.hostname || '—'}</td>
                  <td className="px-4 py-2">{dev.vendor || '—'}</td>
                  <td className="px-4 py-2">{dev.os || dev.os_version || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        dev.status === 'up'
                          ? 'bg-green-100 text-green-700'
                          : dev.status === 'unknown'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {dev.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{lastSeenStr}</td>
                  <td className="px-4 py-2">{perf ? perf.cpu_pct.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2">{perf ? perf.memory_pct.toFixed(1) : '—'}</td>
                  <td className="px-4 py-2">{devSessions.length}</td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/devices/${encodeURIComponent(dev.device_ip)}`}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Details
                    </Link>
                  </td>
                  <td className="px-4 py-2">{devAlerts.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SNMP Tools */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-xl font-semibold mb-4">SNMP Tools</h2>

        {/* SNMP GET */}
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">SNMP GET</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Device IP"
              value={deviceIp}
              onChange={e => setDeviceIp(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              type="text"
              placeholder="OID"
              value={oid}
              onChange={e => setOid(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {commonOIDs.map(item => (
              <button
                key={item.oid}
                onClick={() => setOid(item.oid)}
                className="px-3 py-1 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
              >
                {item.name}
              </button>
            ))}
          </div>
          <button
            onClick={handleSNMPGet}
            disabled={snmpLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {snmpLoading ? 'Fetching…' : 'SNMP GET'}
          </button>
        </div>

        {/* SNMP WALK */}
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">SNMP WALK</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Device IP"
              value={deviceIp}
              onChange={e => setDeviceIp(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              type="text"
              placeholder="OID"
              value={oid}
              onChange={e => setOid(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md font-mono"
            />
          </div>
          <button
            onClick={handleSNMPWalk}
            disabled={snmpLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {snmpLoading ? 'Walking…' : 'SNMP WALK'}
          </button>
        </div>

        {snmpError && <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4 text-red-700">{snmpError}</div>}

        {snmpResult && (
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            {Array.isArray(snmpResult) ? (
              snmpResult.map((entry, idx) => (
                <div key={idx} className="p-2 border-b border-gray-200">
                  {Object.entries(entry).map(([k, v]) => (
                    <div key={k}>
                      <strong>{k}:</strong> {String(v)}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              Object.entries(snmpResult).map(([k, v]) => (
                <div key={k}>
                  <strong>{k}:</strong> {String(v)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
