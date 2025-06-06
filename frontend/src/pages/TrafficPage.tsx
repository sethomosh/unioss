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


  if (stats.length === 0) {
    return (
      <>
        <h2>Traffic</h2>
        <p>No interface data available</p>
      </>
    );
  }


  return (
    <>
      <h2>Traffic</h2>
      <ul>
        {stats.map(t => (
          <li key={`${t.device_ip}-${t.interface_index}`}>
            {t.device_ip} / {t.iface_name} (if{t.interface_index}): 
            in {t.inbound_kbps !== null ? t.inbound_kbps : '—'} kbps — 
            out {t.outbound_kbps !== null ? t.outbound_kbps : '—'} kbps
          </li>
        ))}
      </ul>
    </>
  )
}
