import { useEffect, useState } from 'react'
import { listTraffic, Traffic } from '../utils/api'

export default function TrafficPage() {
  const [stats, setStats] = useState<Traffic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listTraffic()
      .then(ss => setStats(ss))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading traffic stats…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>

  return (
    <>
      <h2>Traffic</h2>
      <ul>
        {stats.map(t => (
          <li key={`${t.device_ip}-${t.interface_index}`}>
            {t.device_ip} / if{t.interface_index}: in {t.inbound_kbps} kbps — out {t.outbound_kbps} kbps
          </li>
        ))}
      </ul>
    </>
  )
}
