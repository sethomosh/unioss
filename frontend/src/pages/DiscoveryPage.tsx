// src/pages/DiscoveryPage.tsx
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { listDevices, Device } from '../utils/api'

export default function DiscoveryPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listDevices()
      .then(devs => setDevices(devs))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading devices…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>

  return (
    <>
      <h2>Discovered Devices</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>IP</th>
            <th style={thStyle}>Hostname</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Vendor</th>
            <th style={thStyle}>OS Version</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Error</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => (
            <tr key={d.ip}>
              <td style={tdStyle}>
                {/*
                  ↓ Make sure this matches your route in App.tsx.  
                  If your detail‐page Route is “/discovery/:ip”, this should be:
                    <NavLink to={`/discovery/${encodeURIComponent(d.ip)}`}>
                  If instead you use “/devices/:ip”, keep it as shown.  
                */}
                <NavLink to={`/devices/${encodeURIComponent(d.ip)}`}>
                  {d.ip}
                </NavLink>
              </td>
              <td style={tdStyle}>{d.hostname}</td>
              <td style={tdStyle}>{d.description}</td>
              <td style={tdStyle}>{d.vendor || '—'}</td>            {/* ← show “vendor” */}
              <td style={tdStyle}>{d.os_version || '—'}</td>         {/* ← show “os_version” */}
              <td style={tdStyle}>
                {/*
                  ↓ If your backend now returns status = "up" or "down", 
                  show a green/red icon accordingly. Otherwise default to “unknown.”  
                */}
                {d.status === 'up' 
                  ? '🟢 Up' 
                  : d.status === 'down' 
                    ? '🔴 Down' 
                    : '—'}
              </td>
              <td style={tdStyle}>
                {d.error 
                  ? <span style={{ color: 'red' }}>{d.error}</span> 
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// Inline styles for table cells (feel free to extract to CSS)
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
