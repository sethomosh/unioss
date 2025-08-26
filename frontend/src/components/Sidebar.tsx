import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/devices', label: 'Devices', icon: '🖥️' },
  { path: '/performance', label: 'Performance', icon: '⚡' },
  { path: '/performance-history', label: 'Performance History', icon: '📈' },
  { path: '/traffic', label: 'Traffic', icon: '🌐' },
  { path: '/access', label: 'Access', icon: '🔐' },
  { path: '/alerts', label: 'Alerts', icon: '🚨' },
  { path: '/analytics', label: 'Analytics', icon: '📅' },
  { path: '/tools/snmp', label: 'SNMP Tools', icon: '🔧' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`bg-sidebar border-r border-border transition-all duration-300`}
      style={{
        width: collapsed ? 64 : 256,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
      role="navigation"
      aria-label="Primary"
    >
      <div className="p-4" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full p-2 rounded hover:bg-sidebar-accent/20 transition-colors mb-4"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '→' : '←'}
        </button>

        {/* Navigation Items */}
        <nav className="space-y-2 flex flex-col">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-3 py-2 rounded-lg whitespace-nowrap overflow-hidden ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
                }`}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <span className="text-lg">{item.icon}</span>
                {!collapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

