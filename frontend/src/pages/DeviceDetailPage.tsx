// src/pages/DeviceDetailPage.tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getDevicePerformance,
  getDeviceTraffic,
  getSysDescr,
  getSysObjectId,
} from '../utils/api'

import type { Performance, Traffic } from '../utils/api'

export default function DeviceDetailPage() {
  const { ip } = useParams<{ ip: string }>()
  const [descr, setDescr] = useState<string>('')
  const [objId, setObjId] = useState<string>('')
  const [perf, setPerf]   = useState<Performance | null>(null)
  const [traffic, setTraffic] = useState<Traffic[]>([])
  const [error, setError]     = useState<string>('')

  // Always point SNMP requests at the SNMP-Sim container, not the device IP
  const SNMP_SIM_HOST = 'snmpsim'

  useEffect(() => {
    if (!ip) return

    // SNMP: sysDescr
    getSysDescr(SNMP_SIM_HOST)
      .then((val) => setDescr(val))
      .catch((e) => setError((e as Error).message))

    // SNMP: sysObjectID
    getSysObjectId(SNMP_SIM_HOST)
      .then((val) => setObjId(val))
      .catch((e) => setError((e as Error).message))

    // Performance: find matching row
    getDevicePerformance(ip)
      .then((row) => setPerf(row))
      .catch((e) => setError((e as Error).message))

    // Traffic: all rows for this device
    getDeviceTraffic(ip)
      .then((rows) => setTraffic(rows))
      .catch((e) => setError((e as Error).message))
  }, [ip])

  if (!ip) {
    return <p style={{ color: 'red' }}>Invalid device IP.</p>
  }
  if (error) {
    return <p style={{ color: 'red' }}>Error: {error}</p>
  }

  return (
    <>
      <h2>Device Detail: {ip}</h2>
      <p>
        <Link to="/discovery">← Back to Discovery</Link>
      </p>

      <section>
        <h3>SNMP Info</h3>
        <p><strong>sysDescr:</strong> {descr || '—'}</p>
        <p><strong>sysObjectID:</strong> {objId || '—'}</p>
      </section>

      <section>
        <h3>Performance</h3>
        {/*
          ↓ Here, your `perf` object now has properties
          { cpu?: number | null; memory?: number | null; uptime?: string | null; last_updated?: string }  

          Previously you were showing sysDescr / sysName. Now update to show cpu, memory, uptime instead:
        */}
        {perf ? (
          <ul>
            <li><strong>CPU %:</strong>     {perf.cpu     != null ? `${perf.cpu}%`     : '—'}</li>
            <li><strong>Memory %:</strong>  {perf.memory  != null ? `${perf.memory}%`  : '—'}</li>
            <li><strong>Uptime (s):</strong> {perf.uptime   ?? '—'}</li>
            <li><strong>Last Updated:</strong> {perf.last_updated 
                                                 ? new Date(perf.last_updated).toLocaleString() 
                                                 : '—'}</li>
          </ul>
        ) : (
          <p>No performance data available.</p>
        )}
      </section>

      <section>
        <h3>Traffic</h3>
        {traffic.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>Iface Name</th>
                <th style={thStyle}>If Index</th>
                <th style={thStyle}>Inbound (kbps)</th>
                <th style={thStyle}>Outbound (kbps)</th>
                <th style={thStyle}>Errors</th>
                <th style={thStyle}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {traffic.map(t => (
                <tr key={`${t.interface_index}-${t.device_ip}`}>
                  <td style={tdStyle}>{t.iface_name}</td>
                  <td style={tdStyle}>{t.interface_index}</td>
                  <td style={tdStyle}>
                    {t.inbound_kbps != null ? t.inbound_kbps : '—'}
                  </td>
                  <td style={tdStyle}>
                    {t.outbound_kbps != null ? t.outbound_kbps : '—'}
                  </td>
                  <td style={tdStyle}>{t.errors}</td>
                  <td style={tdStyle}>
                    {new Date(t.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No traffic data available.</p>
        )}
      </section>
    </>
  )
}

// Re‐use or copy/paste the same cell styles
const thStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px',
  textAlign: 'left',
  backgroundColor: '#f2f2f2'
}
const tdStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px'
}
