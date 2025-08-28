// src/components/AlertDetails.tsx
import React from 'react';
import type { Alert } from '../types/types';
import { apiService } from '../services/apiService';

interface AlertDetailsProps {
  alert: Alert | null;
  onClose: () => void;
  onAcknowledge: () => void;
}

export const AlertDetails: React.FC<AlertDetailsProps> = ({
  alert,
  onClose,
  onAcknowledge,
}) => {
  if (!alert) return null;

  const handleAcknowledge = async () => {
    try {
      await apiService.acknowledgeAlert(alert.id);
      onAcknowledge();
      onClose();
    } catch (err) {
      console.error('failed to acknowledge alert', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-2">
          {alert.severity.toUpperCase()} Alert
        </h2>
        <p className="text-sm mb-4">{alert.message}</p>
        <p className="text-xs text-gray-500 mb-4">
          {new Date(alert.timestamp).toLocaleString()}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-300 dark:bg-gray-700 rounded"
          >
            Close
          </button>
          {!alert.acknowledged && (
            <button
              onClick={handleAcknowledge}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
