// src/App.tsx
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import Dashboard from './pages/Dashboard';
import { Performance } from './pages/Performance';
import { PerformanceHistory } from './pages/PerformanceHistory';
import { Traffic } from './pages/Traffic';
import { Discovery } from './pages/Discovery';
import { Access } from './pages/Access';
import { DeviceDetail } from './pages/DeviceDetail';
import { AnalyticsCalendar } from './pages/AnalyticsCalendar';
import { Login } from './pages/Login';
import { Alerts } from './pages/Alerts';
import { SNMPTools } from './pages/SNMPTools';
import { Settings } from './pages/Settings';
import './styles/theme.css';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </>
  );
}

function TitleBarWrapper() {
  const location = useLocation();
  const title =
    location.pathname === '/'
      ? 'Dashboard'
      : location.pathname.startsWith('/devices')
      ? 'Device'
      : location.pathname.startsWith('/tools')
      ? 'Tools'
      : location.pathname
          .replace('/', '')
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ') || 'Dashboard';

  return <Topbar title={title} />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ErrorBoundary>
          <div className="min-h-screen bg-background text-foreground">
            <div className="flex min-h-screen">
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Dashboard />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/devices"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Discovery />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/devices/:ip"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <DeviceDetail />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/performance"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Performance />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/performance-history"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <PerformanceHistory />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/traffic"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Traffic />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/access"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Access />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/alerts"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Alerts />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <AnalyticsCalendar />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tools/snmp"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <SNMPTools />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <TitleBarWrapper />
                      <main className="flex-1 p-4 md:p-6">
                        <Settings />
                      </main>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="*"
                  element={
                    <ProtectedRoute>
                      <main className="flex-1 p-4 md:p-6">
                        <div className="p-6">404 - Page Not Found</div>
                      </main>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>
          </div>
        </ErrorBoundary>
      </Router>
    </AuthProvider>
  );
}

export default App;
