// src/components/PerformanceHistory.tsx
import { useEffect, useRef, useState } from "react";
import { listPerformanceHistory, type HistoryPoint } from "../utils/api";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import type { ChartOptions } from "chart.js";


export default function PerformanceHistory() {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard to avoid duplicate fetches in React StrictMode (dev)
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    listPerformanceHistory()
      .then((history) => {
        console.log("listPerformanceHistory ->", history);
        setData(history);
        setLoading(false);
      })
      .catch((err) => {
        console.error("listPerformanceHistory error:", err);
        setError(err.message ?? String(err));
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading performance history…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (data.length === 0) return <p>No historical data available.</p>;

  // Filter to one device for clarity
  const ip = data[0]?.ip;
  const filtered = data.filter((p) => p.ip === ip);

  const labels = filtered.map((p) => new Date(p.timestamp).toLocaleString());
  const cpuData = filtered.map((p) => (p.cpu != null ? Number(p.cpu) : null));
  const memData = filtered.map((p) => (p.memory != null ? Number(p.memory) : null));

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };


  return (
    <div>
      <h2>Performance History for {ip}</h2>

      <details style={{ marginBottom: 12 }}>
        <summary>Raw normalized data (click to expand)</summary>
        <pre style={{ maxHeight: 200, overflow: "auto", background: "#f5f5f5", padding: 8 }}>
          {JSON.stringify(filtered.slice(0, 50), null, 2)}
        </pre>
      </details>

      <div style={{ height: 320 }}>
        <Line
          options={options}
          data={{
            labels,
            datasets: [
              {
                label: "CPU Usage (%)",
                data: cpuData,
                borderColor: "rgb(255, 99, 132)",
                fill: false,
              },
              {
                label: "Memory Usage (%)",
                data: memData,
                borderColor: "rgb(54, 162, 235)",
                fill: false,
              },
            ],
          }}
        />
      </div>
    </div>
  );
}
