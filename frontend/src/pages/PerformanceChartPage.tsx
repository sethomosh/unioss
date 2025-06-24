// frontend/src/pages/PerformanceChartPage.tsx
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from 'recharts'

interface PerfHistoryRow {
  device_ip: string
  timestamp: string     // ISO string
  cpu_pct: number
  memory_pct: number
  uptime_secs: number
}

export default function PerformanceChartPage() {
  const [data, setData] = useState<PerfHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/performance/history')
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
        return res.json() as Promise<PerfHistoryRow[]>
      })
      .then(rows => {
        setData(rows)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading performance history…</p>
  if (error)   return <p style={{ color: 'red' }}>Error: {error}</p>
  if (data.length === 0) return <p>No performance history available.</p>

  return (
    <>
      <h2>Performance History</h2>
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
          <YAxis
            yAxisId="left"
            label={{ value: 'CPU (%)', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: 'Memory (%)', angle: 90, position: 'insideRight' }}
          />
          <Tooltip labelFormatter={(ts: string) => new Date(ts).toLocaleString()} />
          <Legend verticalAlign="top" />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="cpu_pct"
            stroke="#8884d8"
            dot={false}
            name="CPU (%)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="memory_pct"
            stroke="#82ca9d"
            dot={false}
            name="Memory (%)"
          />
          {/* You can add a Line for “uptime_secs” if desired, e.g. scaled. */}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
