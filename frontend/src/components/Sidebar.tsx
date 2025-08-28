import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const nav = [
  { to: '/', label: 'dashboard', icon: (size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )},
  { to: '/devices', label: 'devices', icon: (size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )},
  { to: '/analytics', label: 'calendar', icon: (size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 3v4M8 3v4M3 11h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )},
];

export const Sidebar: React.FC<{collapsed?: boolean; onToggle?: () => void}> = ({ collapsed, onToggle }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed ?? false);
  const toggle = () => { setIsCollapsed(!isCollapsed); onToggle?.(); };

  return (
    <aside className={`flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 sticky top-0
      ${isCollapsed ? 'w-16' : 'w-72'} h-screen`}>
      
      {/* logo & toggle */}
      <div className="flex items-center justify-between p-4">
        {!isCollapsed && <div className="text-2xl font-bold tracking-wide">UNIOSS</div>}
        <button
          onClick={toggle}
          className="p-1 rounded hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* nav links */}
      <nav className="flex-1 flex flex-col gap-1 px-2" aria-label="main navigation">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-muted/10'
              }`
            }
          >
            <span className="w-5 h-5 flex-shrink-0">{item.icon(16)}</span>
            {!isCollapsed && <span className="capitalize">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* version */}
      {!isCollapsed && (
        <div className="mt-auto p-4 text-xs text-muted-foreground">
          <div>version</div>
          <div className="text-sm font-mono">0.1.0</div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
