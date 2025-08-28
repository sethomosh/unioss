// src/pages/Alerts.tsx
import React, { useEffect, useState } from 'react';

export interface AlertType {
  id: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'warning';
  acknowledged?: boolean;
  timestamp?: string;
  device_ip?: string;
  category?: string;
}

type AlertsProps = {
  alerts?: AlertType[];
  onAcknowledge?: (id: string) => void;
};

export const Alerts: React.FC<AlertsProps> = ({ alerts: propsAlerts, onAcknowledge }) => {
  const [alerts, setAlerts] = useState<AlertType[]>(propsAlerts ?? []);
  const [loading, setLoading] = useState<boolean>(!propsAlerts);
  const [error, setError] = useState<string | null>(null);

  // Fetch alerts if not provided via props
  useEffect(() => {
    if (propsAlerts) {
      setAlerts(propsAlerts);
      setLoading(false);
      return;
    }

    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/alerts').then(r => r.json()); // adjust API endpoint
        if (!mounted) return;
        setAlerts(res);
      } catch (err) {
        console.error('Failed to fetch alerts', err);
        if (mounted) setError('Failed to load alerts');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [propsAlerts]);

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading alerts...</div>;
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;

  return (
    <div className="w-80 max-h-96 overflow-auto bg-card shadow-lg rounded-lg p-4 border border-border">
      <h2 className="text-lg font-semibold mb-2">Latest Alerts</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts</p>
      ) : (
        <ul className="space-y-2">
          {alerts.slice(0, 5).map(alert => {
            const severityColor = (() => {
              if (alert.severity === 'critical') return 'text-red-500';
              if (['high', 'warning'].includes(alert.severity)) return 'text-orange-500';
              if (['medium', 'low'].includes(alert.severity)) return 'text-yellow-500';
              return 'text-green-500';
            })();

            return (
              <li
                key={alert.id}
                className="flex flex-col p-2 border-b border-muted/20 last:border-b-0 hover:bg-muted/10 rounded"
              >
                <div className="flex justify-between items-center">
                  <span className={`font-medium ${severityColor}`}>
                    {String(alert.severity).toUpperCase()}
                  </span>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => onAcknowledge?.(alert.id)}
                  >
                    {alert.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                  </button>
                </div>

                <p className="text-sm text-foreground truncate">{alert.message}</p>

                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>{alert.device_ip ?? '—'}</span>
                  <span>{alert.category ?? '—'}</span>
                  <span>{alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'N/A'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Alerts;
