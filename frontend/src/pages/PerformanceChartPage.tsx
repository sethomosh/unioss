// frontend/src/pages/PerformanceChartPage.tsx
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from 'recharts'
import { listPerformanceHistory } from '../utils/api'
import './PerformanceChartPage.css' // optional for simple grid styling

interface PerfHistoryRow {
  device_ip: string
  timestamp: string     // ISO string
  cpu_pct: number
  memory_pct: number
  uptime_secs: number
}

type ApiRow = Partial<{
  device_ip: string
  ip: string
  timestamp: string
  last_updated: string
  cpu_pct: number | string
  cpu: number | string
  memory_pct: number | string
  memory: number | string
  uptime_secs: number | string
  uptime: number | string
}>

function Spinner() {
  return <div style={{ padding: '1rem' }}>Loading…</div>
}

/** group by device and ensure each group's points are sorted ascending by timestamp */
function groupAndSort(rows: PerfHistoryRow[]) {
  const map = new Map<string, PerfHistoryRow[]>()
  for (const r of rows) {
    const key = r.device_ip ?? 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }

  map.forEach((arr) => {
    arr.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  })

  return map
}

/** collapse duplicate timestamps in a series by averaging numeric values */
function collapseDuplicates(series: PerfHistoryRow[]) {
  const byTs = new Map<string, PerfHistoryRow[]>()
  for (const p of series) {
    if (!byTs.has(p.timestamp)) byTs.set(p.timestamp, [])
    byTs.get(p.timestamp)!.push(p)
  }

  const out: PerfHistoryRow[] = []
  for (const [, arr] of byTs.entries()) {
    const n = arr.length
    let cpu = 0, mem = 0, up = 0
    for (const a of arr) {
      cpu += a.cpu_pct
      mem += a.memory_pct
      up += a.uptime_secs
    }
    out.push({
      device_ip: arr[0].device_ip,
      timestamp: arr[0].timestamp,
      cpu_pct: +(cpu / n),
      memory_pct: +(mem / n),
      uptime_secs: Math.round(up / n)
    })
  }

  out.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return out
}

export default function PerformanceChartPage() {
  const [data, setData] = useState<PerfHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()

    ;(async () => {
      try {
        const rows = (await listPerformanceHistory()) as ApiRow[]

        const mapped: PerfHistoryRow[] = rows.map((r) => {
          const cpuRaw = r.cpu_pct ?? r.cpu ?? 0
          const memRaw = r.memory_pct ?? r.memory ?? 0
          const uptimeRaw = r.uptime_secs ?? r.uptime ?? 0

          const cpuNum = Number.isFinite(+cpuRaw) ? parseFloat(String(cpuRaw)) : 0
          const memNum = Number.isFinite(+memRaw) ? parseFloat(String(memRaw)) : 0
          const upNum = Number.isFinite(+uptimeRaw) ? parseFloat(String(uptimeRaw)) : 0

          return {
            device_ip: (r.device_ip ?? r.ip ?? 'unknown') as string,
            timestamp: (r.timestamp ?? r.last_updated ?? new Date().toISOString()) as string,
            cpu_pct: +cpuNum.toFixed(2),
            memory_pct: +memNum.toFixed(2),
            uptime_secs: Math.round(upNum)
          }
        })

        if (!ac.signal.aborted) setData(mapped)
      } catch (err: unknown) {
        if (!ac.signal.aborted) {
          if (err instanceof Error) setError(err.message)
          else setError(String(err))
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => ac.abort()
  }, [])

  if (loading) return <Spinner />
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
  if (data.length === 0) return <p>No performance history available.</p>

  const grouped = groupAndSort(data)

  return (
    <>
      <h2>Performance History</h2>

      <div className="perf-grid">
        {Array.from(grouped.entries()).map(([device, series]) => {
          const cleanedSeries = collapseDuplicates(series)

          return (
            <div className="perf-card" key={device}>
              <h3>{device}</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cleanedSeries} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(ts: string) => new Date(ts).toLocaleTimeString()}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="left"
                      domain={[0, 100]}
                      label={{ value: 'CPU (%)', angle: -90, position: 'insideLeft' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      label={{ value: 'Mem (%)', angle: 90, position: 'insideRight' }}
                    />
                    <Tooltip
                      labelFormatter={(ts: string) => new Date(ts).toLocaleString()}
                      formatter={(value: string | number, name: string) => {
                        if (typeof value === 'number') {
                          return [`${value.toFixed(2)}`, name]
                        }
                        return [String(value), name]
                      }}
                    />
                    <Legend verticalAlign="top" />
                    <Line yAxisId="left" type="monotone" dataKey="cpu_pct" dot={false} name="CPU (%)" />
                    <Line yAxisId="right" type="monotone" dataKey="memory_pct" dot={false} name="Memory (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <small>Data points: {cleanedSeries.length}</small>
            </div>
          )
        })}
      </div>
    </>
  )
}
