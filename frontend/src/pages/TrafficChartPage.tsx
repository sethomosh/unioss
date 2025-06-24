// frontend/src/pages/TrafficChartPage.tsx

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from 'recharts'

interface TrafficHistoryRow {
  device_ip: string
  interface_index: number
  timestamp: string      // ISO string
  inbound_kbps: number | null
  outbound_kbps: number | null
  errors: number
}

export default function TrafficChartPage() {
  const [data, setData] = useState<TrafficHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/traffic/history')
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
        return res.json() as Promise<TrafficHistoryRow[]>
      })
      .then(rows => setData(rows))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading traffic history…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>
  if (data.length === 0) return <p>No traffic history available.</p>

  return (
    <>
      <h2>Traffic History</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(ts: string) => new Date(ts).toLocaleTimeString()}
            minTickGap={20}
          />
          <YAxis label={{ value: 'kbps', angle: -90, position: 'insideLeft' }} />
          <Tooltip labelFormatter={(ts: string) => new Date(ts).toLocaleString()} />
          <Legend verticalAlign="top" />
          <Line
            type="monotone"
            dataKey="inbound_kbps"
            stroke="#8884d8"
            dot={false}
            connectNulls
            name="Inbound (kbps)"
          />
          <Line
            type="monotone"
            dataKey="outbound_kbps"
            stroke="#82ca9d"
            dot={false}
            connectNulls
            name="Outbound (kbps)"
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
