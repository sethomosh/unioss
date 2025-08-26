import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAlerts, useAlertAcknowledgment } from '../hooks/useApi';
import { Alert as AlertType } from '../types/types';

export function Alerts() {
  const { data: alerts, loading, error, refetch } = useAlerts();
  const { acknowledgeAlert, loading: ackLoading } = useAlertAcknowledgment();
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAcknowledge = async (alertId: string) => {
    await acknowledgeAlert(alertId);
    refetch();
  };

  const filteredAlerts = alerts?.filter(alert => {
    // Apply filter
    if (filter === 'active' && alert.acknowledged) return false;
    if (filter === 'acknowledged' && !alert.acknowledged) return false;
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        alert.message.toLowerCase().includes(query) ||
        alert.device_ip.toLowerCase().includes(query) ||
        alert.category.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'info': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold font-serif mb-2">Alerts & Notifications</h1>
        <p className="text-muted-foreground">Manage and acknowledge system alerts</p>
      </motion.div>

      {/* Filters and Search */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex flex-col md:flex-row gap-4 items-center justify-between"
      >
        <div className="flex gap-2">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              filter === 'all' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            All Alerts
          </button>
          <button 
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              filter === 'active' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            Active
          </button>
          <button 
            onClick={() => setFilter('acknowledged')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              filter === 'acknowledged' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            Acknowledged
          </button>
        </div>
        
        <div className="relative w-full md:w-auto">
          <input
            type="text"
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
      </motion.div>

      {/* Alerts List */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Alert List</h2>
          
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <div className="text-4xl mb-2">❌</div>
              <p>Error loading alerts: {error}</p>
              <button 
                onClick={() => refetch()}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredAlerts && filteredAlerts.length > 0 ? (
            <div className="space-y-4">
              {filteredAlerts.map((alert: AlertType) => (
                <div 
                  key={alert.id} 
                  className={`p-4 border rounded-lg ${
                    alert.acknowledged 
                      ? 'border-border bg-muted/30' 
                      : 'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColor(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {alert.device_ip}
                        </span>
                      </div>
                      <p className="font-medium mb-1">{alert.message}</p>
                      <p className="text-sm text-muted-foreground">{alert.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          disabled={ackLoading}
                          className="mt-2 px-3 py-1 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {ackLoading ? 'Acknowledging...' : 'Acknowledge'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-4xl mb-2">✅</div>
              <p>No alerts found</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}