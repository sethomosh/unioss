import { useState } from 'react'
import { NavLink, Routes, Route } from 'react-router-dom'

import HealthPage      from './pages/HealthPage'
import DiscoveryPage   from './pages/DiscoveryPage'
import PerformancePage from './pages/PerformancePage'
import TrafficPage     from './pages/TrafficPage'
import AccessPage      from './pages/AccessPage'
import SnmpPage        from './pages/SnmpPage'


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

          <Route path="/discovery"   element={<DiscoveryPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/traffic"     element={<TrafficPage />} />
          <Route path="/access"      element={<AccessPage />} />
          <Route path="/snmp"        element={<SnmpPage />} />

          {/* optional: catch-all 404 route */}
          <Route path="*" element={<h2>Page Not Found</h2>} />
        </Routes>
      </main>
    </div>
  )
}

