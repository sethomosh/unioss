// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './layouts/Layout';
import Dashboard from './pages/Dashboard';
import { Performance } from './pages/Performance';
import { PerformanceHistory } from './pages/PerformanceHistory';
import { Traffic } from './pages/Traffic';
import { AnalyticsCalendar } from './pages/AnalyticsCalendar';
import { Login } from './pages/Login';
import { Alerts } from './pages/Alerts';
import { Settings } from './pages/Settings';
import { DevicesPage } from './pages/DevicesPage';
import { DeviceDetailsPage } from './pages/DeviceDetailsPage';
import './styles/theme.css';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/devices" element={<ProtectedRoute><DevicesPage /></ProtectedRoute>} />
            <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
            <Route path="/performance-history" element={<ProtectedRoute><PerformanceHistory /></ProtectedRoute>} />
            <Route path="/devices/:deviceIp" element={<DeviceDetailsPage />} />
            <Route path="/traffic" element={<ProtectedRoute><Traffic /></ProtectedRoute>} />

            <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsCalendar /></ProtectedRoute>} />


            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <div className="p-6">404 - Page Not Found</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </ErrorBoundary>
      </Router>
    </AuthProvider>
  );
}

export default App;
