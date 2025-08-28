import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSessions } from '../hooks/useApi';

export function Settings() {
  // === Theme settings ===
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // === API settings ===
  const [apiBase, setApiBase] = useState('');
  const [useMock, setUseMock] = useState(false);

  // === User management ===
  const [users, setUsers] = useState([
    { id: '1', username: 'admin', role: 'Administrator', email: 'admin@example.com' },
    { id: '2', username: 'operator', role: 'Operator', email: 'operator@example.com' },
    { id: '3', username: 'viewer', role: 'Viewer', email: 'viewer@example.com' },
  ]);

  // === Access management ===
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: sessions, loading } = useSessions();
  const statuses = ['active', 'idle', 'disconnected'];

  const filteredSessions = sessions?.filter(session => {
    const matchesSearch =
      session.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.device_ip.includes(searchTerm) ||
      session.protocol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

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
    if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
    return `${diffMinutes}m`;
  };

  // === Settings load/save ===
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    const savedApiBase = localStorage.getItem('apiBase') || import.meta.env.VITE_API_BASE || '/api';
    const savedUseMock = localStorage.getItem('useMock') === 'true' || import.meta.env.VITE_MOCK === 'true';
    if (savedTheme) setTheme(savedTheme);
    setApiBase(savedApiBase);
    setUseMock(savedUseMock);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('apiBase', apiBase);
    localStorage.setItem('useMock', useMock.toString());

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }

    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
    alert('Settings saved successfully!');
  };

  // === User mgmt handlers ===
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => setTheme(newTheme);
  const handleAddUser = () => alert('Add user functionality here');
  const handleEditUser = (userId: string) => alert(`Edit user ${userId} functionality here`);
  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(user => user.id !== userId));
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-3xl font-bold font-serif mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure preferences, manage users, and monitor sessions</p>
      </motion.div>

      {/* Theme Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Theme Settings</h2>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => handleThemeChange(opt)}
                className={`px-4 py-2 rounded-md border ${theme === opt ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* API Settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-2">API Settings</h2>
          <input
            type="text"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="/api"
            className="w-full md:w-96 px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useMock}
              onChange={(e) => setUseMock(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">Use Mock Data</span>
          </label>
        </div>
      </motion.div>

      {/* User Management */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}
        className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-semibold">User Management</h2>
            <button onClick={handleAddUser} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              Add User
            </button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left py-2 px-3">Username</th>
              <th className="text-left py-2 px-3">Role</th>
              <th className="text-left py-2 px-3">Email</th>
              <th className="text-left py-2 px-3">Actions</th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-3">{u.username}</td>
                  <td className="py-2 px-3"><span className="px-2 py-1 rounded-full text-xs bg-muted">{u.role}</span></td>
                  <td className="py-2 px-3">{u.email}</td>
                  <td className="py-2 px-3">
                    <button onClick={() => handleEditUser(u.id)} className="px-2 py-1 bg-secondary text-xs rounded mr-2">Edit</button>
                    <button onClick={() => handleDeleteUser(u.id)} className="px-2 py-1 bg-destructive text-xs rounded">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Access Management (merged) */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}
        className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-6 space-y-6">
          <h2 className="text-xl font-semibold">Access Management</h2>
          {/* Filters */}
          <div className="grid md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md">
              <option value="all">All Status</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
              className="px-4 py-2 bg-secondary rounded-md">Clear Filters</button>
          </div>
          {/* Sessions Table */}
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  <th className="py-2 px-3">Session ID</th>
                  <th className="py-2 px-3">Device</th>
                  <th className="py-2 px-3">Username</th>
                  <th className="py-2 px-3">Protocol</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3">Last Activity</th>
                  <th className="py-2 px-3">Actions</th>
                </tr></thead>
                <tbody>
                  {filteredSessions.map((s) => (
                    <tr key={s.session_id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-2 px-3 font-mono">{s.session_id}</td>
                      <td className="py-2 px-3">{s.device_ip}</td>
                      <td className="py-2 px-3">{s.username}</td>
                      <td className="py-2 px-3"><span className="px-2 py-1 bg-primary/20 rounded">{s.protocol}</span></td>
                      <td className="py-2 px-3"><span className={`px-2 py-1 rounded ${getStatusColor(s.status)}`}>{s.status}</span></td>
                      <td className="py-2 px-3">{formatDuration(s.start_time)}</td>
                      <td className="py-2 px-3">{new Date(s.last_activity).toLocaleString()}</td>
                      <td className="py-2 px-3"><button className="px-2 py-1 text-xs bg-destructive/20 rounded">Terminate</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && filteredSessions.length === 0 && (
                <div className="text-center text-muted-foreground py-8">No sessions found</div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button onClick={saveSettings} className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          Save Settings
        </button>
      </div>
    </div>
  );
}
