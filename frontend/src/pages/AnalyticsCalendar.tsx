// src/pages/AnalyticsCalendar.tsx
import { useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAlerts, useDevices } from '../hooks/useApi';
import type { Alert, Device } from '../types/types';

const locales = { 'en-US': {} as Record<string, unknown> };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  device_ip: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  allDay: boolean;
};

export function AnalyticsCalendar() {
  const { data: alertsRaw } = useAlerts();
  const { data: devices } = useDevices();
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // explicitly typed variable to use Alert
  

  const events = useMemo<CalendarEvent[]>(() => {
    const alerts: Alert[] = (alertsRaw ?? []) as Alert[];

    return alerts
      .filter(a => deviceFilter === 'all' || a.device_ip === deviceFilter)
      .filter(a => {
        if (severityFilter === 'all') return true;
        const mappedSeverity =
          a.severity === 'warning' ? 'medium' :
          a.severity === 'info' ? 'low' :
          a.severity as 'critical' | 'high' | 'medium' | 'low';
        return mappedSeverity === severityFilter;
      })
      .map(a => ({
        id: a.id,
        title: `${a.severity.toUpperCase()}: ${a.message}`,
        start: new Date(a.timestamp),
        end: new Date(new Date(a.timestamp).getTime() + 30 * 60 * 1000),
        device_ip: a.device_ip ?? 'unknown',
        severity:
          a.severity === 'warning' ? 'medium' :
          a.severity === 'info' ? 'low' :
          (a.severity as 'critical' | 'high' | 'medium' | 'low'),
        allDay: false,
      }));
  }, [alertsRaw, deviceFilter, severityFilter]);

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold">Analytics Calendar</h1>
        <p className="text-muted-foreground">View error events and alerts over time</p>
      </div>

      {/* Filters */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Device</label>
            <select
              value={deviceFilter}
              onChange={e => setDeviceFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
            >
              <option value="all">All Devices</option>
              {devices?.map((d: Device) => (
                <option key={d.device_ip} value={d.device_ip}>
                  {d.hostname || d.device_ip} ({d.device_ip})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-card p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Error Events Calendar</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '70vh' }}
            onSelectEvent={(event: CalendarEvent) => {
              window.location.href = `/devices/${event.device_ip}`;
            }}
            eventPropGetter={(event: CalendarEvent) => {
              let backgroundColor = '';
              switch (event.severity) {
                case 'critical':
                  backgroundColor = '#f87171';
                  break;
                case 'high':
                  backgroundColor = '#fbbf24';
                  break;
                case 'medium':
                  backgroundColor = '#34d399';
                  break;
                case 'low':
                  backgroundColor = '#93c5fd';
                  break;
                default:
                  backgroundColor = '#cbd5e1';
              }
              return {
                style: {
                  backgroundColor,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                },
              };
            }}
          />
        </div>
      </div>
    </div>
  );
}
