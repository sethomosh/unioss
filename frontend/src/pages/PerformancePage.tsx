// src/pages/PerformancePage.tsx

import { useEffect, useState } from 'react'
import { listPerformance, Performance } from '../utils/api'

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<Performance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listPerformance()
      .then(ms => setMetrics(ms))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading performance…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>

  return (
    <>
      <h2>Performance</h2>
      <ul>
        {metrics.map(p => (
          <li key={p.ip}>
            <strong>{p.ip}</strong> — CPU: {p.cpu ?? 'N/A'}% — Mem: {p.memory ?? 'N/A'}% — Up: {p.uptime ?? 'N/A'}s
            <br />
            {/* last_updated was renamed in API to “last_updated” */}
            <small>Fetched at: {new Date(p.last_updated!).toLocaleString()}</small>
          </li>
        ))}
      </ul>
    </>
  )
}

// No changes needed here if your backend returns { cpu, memory, uptime, last_updated }.
// Just confirm that the API’s JSON fields match these property names.
