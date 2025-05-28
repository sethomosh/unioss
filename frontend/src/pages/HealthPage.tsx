import { useEffect, useState } from 'react'
import { getHealth, JsonResponse } from '../utils/api'

export default function HealthPage() {
  const [status, setStatus] = useState<string>('loading…')
  const [error, setError] = useState('')

  useEffect(() => {
    getHealth()
      .then((r: JsonResponse) => {
        if (r.status) setStatus(r.status)
        else throw new Error('Invalid response')
      })
      .catch(err => {
        setError(err.message)
        setStatus('down')
      })
  }, [])

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
  return <h2>Health: {status}</h2>
}
