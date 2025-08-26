import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSessions } from '../hooks/useApi';

export function Access() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: sessions, loading } = useSessions();

  const filteredSessions = sessions?.filter(session => {
    const matchesSearch = session.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.device_ip.includes(searchTerm) ||
                         session.protocol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const statuses = ['active', 'idle', 'disconnected'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'idle': return 'bg-yellow-100 text-yellow-800';
      case 'disconnected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold font-serif mb-1">Access Management</h1>
        <p className="text-sm text-muted-foreground">Monitor and manage active sessions</p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card border border-border rounded-lg shadow-sm p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Status</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </motion.div>

      {/* Sessions Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Active Sessions</h2>
            <div className="text-sm text-muted-foreground">
              {filteredSessions.length} of {sessions?.length || 0} sessions
            </div>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium">Session ID</th>
                    <th className="text-left py-3 px-4 font-medium">Device</th>
                    <th className="text-left py-3 px-4 font-medium">Username</th>
                    <th className="text-left py-3 px-4 font-medium">Protocol</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Duration</th>
                    <th className="text-left py-3 px-4 font-medium">Last Activity</th>
                    <th className="text-left py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr key={session.session_id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono text-sm">{session.session_id}</td>
                      <td className="py-3 px-4 font-mono">{session.device_ip}</td>
                      <td className="py-3 px-4">{session.username}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-primary/20 text-primary rounded-full text-xs font-medium">
                          {session.protocol}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {formatDuration(session.start_time)}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {new Date(session.last_activity).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            className="px-2 py-1 text-xs bg-destructive/20 text-destructive rounded hover:bg-destructive/30 transition-colors"
                            onClick={() => {
                              // TODO: Implement terminate session
                              console.log('Terminate session:', session.session_id);
                            }}
                          >
                            Terminate
                          </button>
                          <button
                            className="px-2 py-1 text-xs bg-secondary/20 text-secondary-foreground rounded hover:bg-secondary/30 transition-colors"
                            onClick={() => {
                              // TODO: Implement view details
                              console.log('View session details:', session.session_id);
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* Empty State */}
      {!loading && filteredSessions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="text-muted-foreground">
            <div className="text-6xl mb-4">🔐</div>
            <h3 className="text-lg font-semibold mb-2">No sessions found</h3>
            <p className="text-sm">Try adjusting your search criteria or filters</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
