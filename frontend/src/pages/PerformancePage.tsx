// frontend/src/pages/PerformancePage.tsx
import { useEffect, useState } from 'react'
import { listPerformance, Performance } from '../utils/api'

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<Performance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    listPerformance()
      .then(ms => {
        if (mounted) setMetrics(ms)
      })
      .catch(err => {
        if (mounted) setError(err.message ?? String(err))
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  if (loading) return <p>Loading performance…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>
  if (metrics.length === 0) return <p>No devices found.</p>

  return (
    <>
      <h2>Performance</h2>
      <ul>
        {metrics.map(p => (
          <li key={p.ip}>
            <strong>{p.ip}</strong> — CPU: {p.cpu ?? 'N/A'}% — Mem: {p.memory ?? 'N/A'}% — Up: {p.uptime ?? 'N/A'}
            <br />
            <small>Fetched at: {p.last_updated ? new Date(p.last_updated).toLocaleString() : '—'}</small>
          </li>
        ))}
      </ul>
    </>
  )
}
