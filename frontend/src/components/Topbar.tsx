import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { useHealth } from '../hooks/useApi';

export function Topbar({ title }: { title: string }) {
  const { data: health } = useHealth();
  const [searchQuery, setSearchQuery] = useState('');

  const servicePill = (name: string, up: boolean) => (
    <span className={`px-2 py-0.5 rounded-full text-xs ${up ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {name}: {up ? 'up' : 'down'}
    </span>
  );

  return (
    <div className="sticky top-0 z-40 bg-card border-b border-border px-4 py-3 flex items-center justify-between shadow-sm" role="banner">
      <div className="flex items-center gap-3 min-w-0">
        <svg width="24" height="24" viewBox="0 0 24 24" className="text-primary flex-shrink-0" aria-hidden>
          <path fill="currentColor" d="M12 2l7 4v4l-7 4-7-4V6l7-4Zm0 8l7-4v12l-7 4-7-4V6l7 4Z"/>
        </svg>
        <span className="font-bold tracking-wide flex-shrink-0">UNIOSS</span>
        <span className="text-muted-foreground flex-shrink-0">/</span>
        <span className="font-medium truncate">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search box/device quick-picker */}
        <div className="relative hidden md:block">
          <input
            type="text"
            placeholder="Search devices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        
        <button className="relative p-2 rounded-lg hover:bg-muted/40" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] px-1 rounded">3</span>
        </button>
        <div className="hidden md:flex items-center gap-2">
          {health && (
            <div className="flex items-center gap-2">
              {servicePill('DB', health.services?.db !== 'down')}
              {servicePill('Redis', health.services?.redis !== 'down')}
            </div>
          )}
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
