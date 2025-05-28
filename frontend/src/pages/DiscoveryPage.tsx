import { useEffect, useState } from 'react'
import { listDevices, Device } from '../utils/api'

export default function DiscoveryPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    listDevices()
      .then(devs => {
        setDevices(devs)
      })
      .catch(err => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Loading devices…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>





  return (
    <>
      <h2>Discovered Devices</h2>
      <ul>
        {devices.map(d => (
          <li key={d.ip}>
            {d.ip} — {d.hostname} — {d.description}
            {d.error && (
              <small style={{ color: 'red' }}> (Error: {d.error})</small>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
