import { useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Event as RBCEvent } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAlerts, useDevices } from '../hooks/useApi';

const locales = {
  'en-US': {} as any
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales
});

interface CalendarEvent extends RBCEvent {
  id: string;
  device_ip: string;
  severity: 'critical' | 'warning' | 'info';
}

export function AnalyticsCalendar() {
  const { data: alerts } = useAlerts();
  const { data: devices } = useDevices();
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const events = useMemo<CalendarEvent[]>(() => {
    const list = alerts || [];
    return list
      .filter(a => (deviceFilter === 'all' || a.device_ip === deviceFilter))
      .filter(a => (severityFilter === 'all' || (a.level || a.severity) === severityFilter))
      .map(a => ({
        id: a.id,
        title: `${(a.level || a.severity).toUpperCase()}: ${a.message}`,
        start: new Date(a.created_at || (a as any).timestamp),
        end: new Date((new Date(a.created_at || (a as any).timestamp)).getTime() + 30 * 60 * 1000),
        device_ip: a.device_ip,
        severity: (a.level || a.severity) as any,
        allDay: false
      }));
  }, [alerts, deviceFilter, severityFilter]);

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Device</label>
          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
          >
            <option value="all">All</option>
            {devices?.map(d => (
              <option key={d.ip || (d as any).device_ip} value={d.ip || (d as any).device_ip}>
                {d.hostname} ({d.ip || (d as any).device_ip})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Severity</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      <div className="card">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '70vh' }}
          onSelectEvent={(event) => {
            const ip = (event as CalendarEvent).device_ip;
            window.location.href = `/devices/${ip}`;
          }}
        />
      </div>
    </div>
  );
}
