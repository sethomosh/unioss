// src/components/ProtectedRoute.tsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Login } from '../pages/Login';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user } = useAuth();

  if (!user) return <Login />;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar fixed */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Topbar anchored at top */}
        <Topbar />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
