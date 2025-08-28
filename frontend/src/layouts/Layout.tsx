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
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col">
        <Topbar title={title} onSidebarToggle={() => setCollapsed(!collapsed)} />
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <div className="w-full max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
