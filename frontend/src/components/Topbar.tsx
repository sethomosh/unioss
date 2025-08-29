// src/components/Topbar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { Alerts } from '../pages/Alerts';
import { apiClient, Alert } from '../utils/api';
import { apiService } from '../services/apiService'

type TopbarProps = {
  title?: string;
  onSidebarToggle?: () => void;
};

const Topbar: React.FC<TopbarProps> = ({ title = 'Dashboard', onSidebarToggle }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await apiClient.getRecentAlerts();
        setAlerts(data);
      } catch (err) {
        console.error('Failed to fetch alerts', err);
      }
    };
    fetchAlerts();
  }, []);

  // close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcknowledge = async (id: string) => {
    // optimistic UI update: mark locally, then call backend
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, acknowledged: true } : a)));

    try {
      const resp = await apiService.acknowledgeAlert(id);
      if (!resp || !resp.success) {
        // rollback if backend failed
        console.error('Acknowledge API failed', resp);
        setAlerts(prev => prev.map(a => (a.id === id ? { ...a, acknowledged: false } : a)));
      }
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
      // rollback
      setAlerts(prev => prev.map(a => (a.id === id ? { ...a, acknowledged: false } : a)));
    }
  };

  return (
    <header className="w-full h-16 border-b border-border bg-card flex items-center px-4 fixed top-0 z-20">
      <div className="flex items-center gap-3">
        {/* sidebar toggle for mobile */}
        <button
          className="p-2 rounded md:hidden hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={onSidebarToggle}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded flex items-center justify-center text-white font-bold text-base">
            UNIOSS
          </div>
        </Link>

        <div className="text-sm font-semibold tracking-wide capitalize text-foreground truncate">{title}</div>
      </div>

      <div className="flex-1" />

      <div className="relative flex items-center gap-3">
        <button
          aria-label="notifications"
          title="notifications"
          className="relative p-2 rounded-md hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 17H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path
              d="M12 3C9.239 3 7 5.239 7 8V11C7 12.93 6.32 14.68 5.222 15.828L4 17.2C3.447 17.82 4.018 18.75 4.78 18.75H19.22C19.982 18.75 20.553 17.82 20 17.2L18.778 15.828C17.68 14.68 17 12.93 17 11V8C17 5.239 14.761 3 12 3Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          {alerts.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium leading-none text-card bg-destructive rounded-full">
              {alerts.filter(a => !a.acknowledged).length}
            </span>
          )}
        </button>

        {/* dropdown */}
        {showDropdown && (
          <div ref={dropdownRef} className="absolute right-0 mt-2 z-50">
            <Alerts alerts={alerts} onAcknowledge={handleAcknowledge} />
          </div>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
};

export default Topbar;
