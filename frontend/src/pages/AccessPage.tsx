import { useEffect, useState } from 'react'
import { listSessions, Session } from '../utils/api'

export default function AccessPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listSessions()
      .then(ss => setSessions(ss))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading sessions…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>

  return (
    <>
      <h2>Access Sessions</h2>
      <ul>
        {sessions.map(s => (
          <li key={`${s.ip}-${s.user}`}>
            {s.user}@{s.ip} via {s.authenticated_via} — {s.login_time}
          </li>
        ))}
      </ul>
    </>
  )
}
