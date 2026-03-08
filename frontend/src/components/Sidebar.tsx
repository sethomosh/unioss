// src/components/Sidebar.tsx - Fixed alignment and responsive behavior
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const nav = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (size = 16) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/devices',
    label: 'Devices',
    icon: (size = 16) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/analytics',
    label: 'Calendar',
    icon: (size = 16) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16 3v4M8 3v4M3 11h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/alerts',
    label: 'Alerts',
    icon: (size = 16) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" fill="currentColor" />
      </svg>
    )
  },
];

export const Sidebar: React.FC<{ collapsed?: boolean; onToggle?: () => void }> = ({ collapsed, onToggle }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed ?? false);

  const toggle = () => {
    setIsCollapsed(!isCollapsed);
    onToggle?.();
  };

  return (
    <aside className={`
      flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border 
      transition-all duration-300 ease-in-out h-[calc(100vh-4rem)]
      ${isCollapsed ? 'w-16' : 'w-64'} 
      flex-shrink-0
    `}>
      {/* Header section */}
      <div className="flex items-center justify-between p-6 border-b border-sidebar-border/30 mb-2">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-primary-foreground font-black text-xs">UN</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-[0.2em] text-foreground leading-none">UNIOSS</span>
              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Network Intel</span>
            </div>
          </div>
        )}
        <button
          onClick={toggle}
          className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all duration-300 border border-transparent hover:border-border/50"
          aria-label="Toggle sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d={isCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 flex flex-col gap-1.5 p-4" aria-label="main navigation">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 group relative ${isActive
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]'
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/40'
              }`
            }
            title={isCollapsed ? item.label : undefined}
          >
            <span className={`w-5 h-5 flex-shrink-0 transition-transform duration-500 group-hover:rotate-12 ${isCollapsed ? 'mx-auto' : ''}`}>
              {item.icon(18)}
            </span>
            {!isCollapsed && (
              <span className="flex-grow">
                {item.label}
              </span>
            )}

            {/* Active Indicator Dot */}
            {!isCollapsed && (
              <div className="w-1.5 h-1.5 rounded-full bg-white/20 opacity-0 group-[.active]:opacity-100 transition-opacity"></div>
            )}

            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-4 px-3 py-1.5 bg-card border border-border/50 text-foreground text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0 pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer section */}
      {!isCollapsed && (
        <div className="mt-auto p-6 border-t border-sidebar-border/30">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="text-[10px] font-black text-foreground/80 tracking-widest uppercase">System Core</div>
              <div className="text-[9px] font-bold text-muted-foreground/40 font-mono mt-0.5">V0.1.0-STABLE</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;