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
];

export const Sidebar: React.FC<{collapsed?: boolean; onToggle?: () => void}> = ({ collapsed, onToggle }) => {
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
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border/50">
        {!isCollapsed && (
          <div className="text-xl font-bold tracking-wide text-sidebar-foreground">
            UNIOSS
          </div>
        )}
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-sidebar-accent/10 focus:outline-none focus:ring-2 focus:ring-sidebar-ring transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path 
              d={isCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 flex flex-col gap-1 p-4" aria-label="main navigation">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                isActive 
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' 
                  : 'hover:bg-sidebar-accent/10 text-sidebar-foreground hover:text-sidebar-accent-foreground'
              }`
            }
            title={isCollapsed ? item.label : undefined}
          >
            <span className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110">
              {item.icon(20)}
            </span>
            {!isCollapsed && (
              <span className="capitalize font-medium">
                {item.label}
              </span>
            )}
            
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-card text-card-foreground text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer section */}
      {!isCollapsed && (
        <div className="mt-auto p-4 border-t border-sidebar-border/50">
          <div className="text-xs text-sidebar-foreground/60 space-y-1">
            <div className="font-semibold">UNIOSS</div>
            <div className="font-mono text-sidebar-foreground/40">v0.1.0</div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;