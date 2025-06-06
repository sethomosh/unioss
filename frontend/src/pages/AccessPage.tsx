// frontend/src/pages/AccessPage.tsx

import { useEffect, useState } from 'react'
import { listSessions, Session } from '../utils/api'

export default function AccessPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    // function to fetch sessions and update state
    const fetchSessions = () => {
      setLoading(true)
      listSessions()
        .then((ss) => {
          setSessions(ss)
          setError('')
        })
        .catch((err) => {
          setError(err.message)
          setSessions([])
        })
        .finally(() => {
          setLoading(false)
        })
    }

    // initial fetch
    fetchSessions()

    // auto-refresh every 30 seconds
    const intervalId = setInterval(fetchSessions, 30_000)
    return () => clearInterval(intervalId)
  }, [])

  if (loading) {
    return <p>Loading sessions…</p>
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error}</p>
  }

  if (sessions.length === 0) {
    return <p>No active sessions found.</p>
  }

  return (
    <>
      <h2>Active Access Sessions</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>User</th>
            <th style={thStyle}>IP</th>
            <th style={thStyle}>MAC</th>
            <th style={thStyle}>Login Time</th>
            <th style={thStyle}>Logout Time</th>
            <th style={thStyle}>Duration (s)</th>
            <th style={thStyle}>Auth Via</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={`${s.ip}-${s.user}-${s.login_time}`}>
              <td style={tdStyle}>{s.user}</td>
              <td style={tdStyle}>{s.ip}</td>
              <td style={tdStyle}>{s.mac}</td>
              <td style={tdStyle}>
                {new Date(s.login_time).toLocaleString()}
              </td>
              <td style={tdStyle}>
                {s.logout_time ? new Date(s.logout_time).toLocaleString() : '—'}
              </td>
              <td style={tdStyle}>{s.duration ?? '—'}</td>
              <td style={tdStyle}>{s.authenticated_via}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// Simple inline styles to add borders & padding
const thStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px',
  textAlign: 'left',
  backgroundColor: '#f2f2f2',
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px',
}
