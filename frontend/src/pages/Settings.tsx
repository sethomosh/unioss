import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Settings() {
  // Theme settings
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  // API settings
  const [apiBase, setApiBase] = useState('');
  const [useMock, setUseMock] = useState(false);
  
  // User management (simplified for now)
  const [users, setUsers] = useState([
    { id: '1', username: 'admin', role: 'Administrator', email: 'admin@example.com' },
    { id: '2', username: 'operator', role: 'Operator', email: 'operator@example.com' },
    { id: '3', username: 'viewer', role: 'Viewer', email: 'viewer@example.com' },
  ]);
  
  // Load settings from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    const savedApiBase = localStorage.getItem('apiBase') || import.meta.env.VITE_API_BASE || '/api';
    const savedUseMock = localStorage.getItem('useMock') === 'true' || import.meta.env.VITE_MOCK === 'true';
    
    if (savedTheme) setTheme(savedTheme);
    setApiBase(savedApiBase);
    setUseMock(savedUseMock);
  }, []);
  
  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('apiBase', apiBase);
    localStorage.setItem('useMock', useMock.toString());
    
    // Apply theme
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    
    // Also update the theme in the ThemeToggle component by dispatching a custom event
    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
    
    alert('Settings saved successfully!');
  };
  
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };
  
  const handleAddUser = () => {
    // In a real implementation, this would open a modal to add a user
    alert('Add user functionality would be implemented here');
  };
  
  const handleEditUser = (userId: string) => {
    // In a real implementation, this would open a modal to edit a user
    alert(`Edit user ${userId} functionality would be implemented here`);
  };
  
  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(user => user.id !== userId));
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold font-serif mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure application preferences and manage users</p>
      </motion.div>

      {/* Theme Settings */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Theme Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`px-4 py-2 rounded-md border ${
                    theme === 'light' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`px-4 py-2 rounded-md border ${
                    theme === 'dark' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`px-4 py-2 rounded-md border ${
                    theme === 'system' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  System Preference
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* API Settings */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">API Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">API Base URL</label>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="/api"
                className="w-full md:w-96 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Base URL for API requests (e.g., http://localhost:8000/api)
              </p>
            </div>
            
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useMock}
                  onChange={(e) => setUseMock(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">Use Mock Data</span>
              </label>
              <p className="text-sm text-muted-foreground mt-1">
                Enable mock data for development and testing
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* User Management */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.3 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">User Management</h2>
            <button
              onClick={handleAddUser}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Add User
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Username</th>
                  <th className="text-left py-2 px-3">Role</th>
                  <th className="text-left py-2 px-3">Email</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">{user.username}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-1 rounded-full text-xs bg-muted">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-2 px-3">{user.email}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditUser(user.id)}
                          className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded hover:bg-secondary/80 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="px-2 py-1 bg-destructive text-destructive-foreground text-xs rounded hover:bg-destructive/80 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.4 }}
        className="flex justify-end"
      >
        <button
          onClick={saveSettings}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Save Settings
        </button>
      </motion.div>
    </div>
  );
}