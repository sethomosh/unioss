// src/pages/Alerts.tsx
import React from 'react';
import { Alert } from '../utils/api';

type AlertsProps = {
  alerts: Alert[];
  onAcknowledge?: (id: string) => void;
};

export const Alerts: React.FC<AlertsProps> = ({ alerts, onAcknowledge }) => {
  return (
    <div className="w-80 max-h-96 overflow-auto bg-card shadow-lg rounded-lg p-4 border border-border">
      <h2 className="text-lg font-semibold mb-2">Latest Alerts</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts</p>
      ) : (
        <ul className="space-y-2">
          {alerts.slice(0, 5).map((alert) => (
            <li
              key={alert.id}
              className="flex flex-col p-2 border-b border-muted/20 last:border-b-0 hover:bg-muted/10 rounded"
            >
              <div className="flex justify-between items-center">
                <span
                  className={`font-medium ${
                    alert.severity === 'critical'
                      ? 'text-red-500'
                      : alert.severity === 'warning'
                      ? 'text-yellow-500'
                      : 'text-green-500'
                  }`}
                >
                  {alert.severity.toUpperCase()}
                </span>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => onAcknowledge?.(alert.id)}
                >
                  {alert.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                </button>
              </div>
              <p className="text-sm text-foreground truncate">{alert.message}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(alert.timestamp).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
