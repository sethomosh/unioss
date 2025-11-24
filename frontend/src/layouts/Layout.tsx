import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useLocation } from 'react-router-dom';

type LayoutProps = { children: React.ReactNode };

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const title =
    location.pathname === '/'
      ? 'Dashboard'
      : location.pathname.startsWith('/devices')
      ? 'Devices'
      : location.pathname.startsWith('/analytics')
      ? 'Calendar'
      : location.pathname
          .replace('/', '')
          .split('-')
          .map(s => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ') || 'Dashboard';

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      {/* fixed topbar */}
      <Topbar title={title} onSidebarToggle={() => setCollapsed(!collapsed)} />

      {/* main content area offset with pt-16 to avoid overlap */}
      <div className="flex flex-1 app-main-content" style={{ paddingTop: '64px' }} data-topbar-offset="64">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

        <main className="flex-1 overflow-auto bg-background">
          <div className="w-full p-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
