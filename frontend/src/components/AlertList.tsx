import { motion, AnimatePresence } from 'framer-motion';
import { apiService } from '../services/apiService';
import type { Alert } from '../types/types';

interface AlertListProps {
  alerts: Alert[];
  maxHeight?: number;
}

export const AlertList: React.FC<AlertListProps> = ({ alerts, maxHeight = 400 }) => {
  const acknowledgeAlert = async (id: string) => {
    try {
      await apiService.acknowledgeAlert(id);
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  return (
    <div className="overflow-y-auto pr-2" style={{ maxHeight }}>
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-3 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow"
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-sm">
                  {alert.title ?? `Alert #${alert.id}`}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {alert.message}
                </p>
              </div>
              {!alert.acknowledged && (
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Acknowledge
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
