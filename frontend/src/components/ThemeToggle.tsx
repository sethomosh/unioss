// src/components/ThemeToggle.tsx
import React, { useEffect, useState } from 'react';

const THEME_KEY = 'unisys:theme'; // localstorage key

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    // fallback to system preference
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    // listen to system changes if user hasn't explicitly saved a preference
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handler = (ev: MediaQueryListEvent) => {
      try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved !== 'light' && saved !== 'dark') {
          setTheme(ev.matches ? 'dark' : 'light');
        }
      } catch (e) {}
    };
    if (mq?.addEventListener) mq.addEventListener('change', handler);
    else if (mq?.addListener) mq.addListener(handler);
    return () => {
      if (mq?.removeEventListener) mq.removeEventListener('change', handler);
      else if (mq?.removeListener) mq.removeListener(handler);
    };
  }, []);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <button
      aria-label="toggle theme"
      title="toggle theme"
      onClick={toggle}
      className="p-2 rounded-md hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {theme === 'dark' ? (
        // sun icon (light mode)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ) : (
        // moon icon (dark mode)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
