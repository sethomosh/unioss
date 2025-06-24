// src/App.tsx
import { useState } from 'react'
import { NavLink, Routes, Route } from 'react-router-dom'

import HealthPage           from './pages/HealthPage'
import DiscoveryPage        from './pages/DiscoveryPage'
import DeviceDetailPage     from './pages/DeviceDetailPage' // ← import it
import PerformancePage      from './pages/PerformancePage'
import TrafficPage          from './pages/TrafficPage'
import AccessPage           from './pages/AccessPage'
import SnmpPage             from './pages/SnmpPage'
import PerformanceChartPage from './pages/PerformanceChartPage'
import TrafficChartPage     from './pages/TrafficChartPage'

import './App.css'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <nav>
        <NavLink to="/"       end>Home</NavLink> |{' '}
        <NavLink to="/discovery">Discovery</NavLink> |{' '}
        <NavLink to="/performance">Performance</NavLink> |{' '}
        <NavLink to="/traffic">Traffic</NavLink> |{' '}
        <NavLink to="/access">Access</NavLink> |{' '}
        <NavLink to="/snmp">SNMP GET</NavLink>
        {' '}| <NavLink to="/performance-charts">Perf Charts</NavLink> |{' '}
        <NavLink to="/traffic-charts">Traffic Charts</NavLink>
      </nav>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>Welcome</h1>
                <button onClick={() => setCount(c => c + 1)}>
                  clicked {count} times
                </button>
                <p>
                  Health: <HealthPage />
                </p>
              </>
            }
          />

          <Route path="/discovery"      element={<DiscoveryPage />} />
          <Route path="/performance"    element={<PerformancePage />} />
          <Route path="/traffic"        element={<TrafficPage />} />
          <Route path="/access"         element={<AccessPage />} />
          <Route path="/snmp"           element={<SnmpPage />} />
          {/* New chart routes: */}
          <Route path="/performance-charts" element={<PerformanceChartPage />} />
          <Route path="/traffic-charts"     element={<TrafficChartPage />} />


          {/* Drill‐down detail for a single device */}
          <Route path="/devices/:ip" element={<DeviceDetailPage />} />



          {/* optional: catch‐all 404 route */}
          <Route path="*" element={<h2>Page Not Found</h2>} />
        </Routes>
      </main>
    </div>
  )
}
