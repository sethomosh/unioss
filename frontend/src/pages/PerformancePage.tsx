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
            {p.ip} — CPU: {p.cpu} — Mem: {p.memory} — Up: {p.uptime}
          </li>
        ))}
      </ul>
    </>
  )
}
