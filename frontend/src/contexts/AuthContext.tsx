import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/apiService';

type UserRole = 'Administrator' | 'Operator' | 'Viewer' | 'Auditor';

interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  canAccessPage: (page: string) => boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate session against backend on app start
  useEffect(() => {
    const validateSession = async () => {
      try {
        const savedUserStr = localStorage.getItem('user');
        if (!savedUserStr) {
          setLoading(false);
          return;
        }

        const backendUser = await apiService.getCurrentUser();
        if (backendUser) {
          setUser({ ...JSON.parse(savedUserStr), ...backendUser });
        } else {
          // session invalid
          setUser(null);
          localStorage.removeItem('user');
        }
      } catch (e) {
        console.error('Session validation failed', e);
        setUser(null);
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };
    validateSession();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // In a real implementation, this would call an authentication API
    // For now, we'll simulate authentication with mock users

    // Mock users database
    const mockUsers: User[] = [
      { id: '1', username: 'admin', email: 'admin@example.com', role: 'Administrator' },
      { id: '2', username: 'operator', email: 'operator@example.com', role: 'Operator' },
      { id: '3', username: 'viewer', email: 'viewer@example.com', role: 'Viewer' },
      { id: '4', username: 'auditor', email: 'auditor@example.com', role: 'Auditor' },
    ];

    // Find user (in real app, this would be an API call)
    const foundUser = mockUsers.find(u => u.username === username);

    // Simulate password check (in real app, this would be server-side)
    if (foundUser && password === 'password') { // Using a fixed password for demo
      setUser(foundUser);
      localStorage.setItem('user', JSON.stringify(foundUser));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;

    // Define permissions for each role
    const permissions: Record<UserRole, string[]> = {
      Administrator: [
        'view_dashboard',
        'view_devices',
        'manage_devices',
        'view_performance',
        'view_performance_history',
        'view_traffic',
        'view_access',
        'manage_users',
        'view_alerts',
        'manage_alerts',
        'view_analytics',
        'view_snmp_tools',
        'run_snmp_tools',
        'view_settings',
        'manage_settings',
        'export_data',
        'view_audit_logs'
      ],
      Operator: [
        'view_dashboard',
        'view_devices',
        'view_performance',
        'view_performance_history',
        'view_traffic',
        'view_access',
        'view_alerts',
        'manage_alerts', // Can acknowledge alerts
        'view_analytics',
        'view_snmp_tools',
        'run_snmp_tools'
      ],
      Viewer: [
        'view_dashboard',
        'view_devices',
        'view_performance',
        'view_performance_history',
        'view_traffic',
        'view_access',
        'view_alerts',
        'view_analytics'
      ],
      Auditor: [
        'view_dashboard',
        'view_devices',
        'view_performance',
        'view_performance_history',
        'view_traffic',
        'view_access',
        'view_alerts',
        'view_analytics',
        'export_data',
        'view_audit_logs'
      ]
    };

    return permissions[user.role].includes(permission);
  };

  const canAccessPage = (page: string): boolean => {
    if (!user) return false;

    // Define page access for each role
    const pageAccess: Record<UserRole, string[]> = {
      Administrator: [
        'dashboard',
        'devices',
        'device-detail',
        'performance',
        'performance-history',
        'traffic',
        'access',
        'alerts',
        'analytics',
        'snmp-tools',
        'settings'
      ],
      Operator: [
        'dashboard',
        'devices',
        'device-detail',
        'performance',
        'performance-history',
        'traffic',
        'access',
        'alerts',
        'analytics',
        'snmp-tools'
      ],
      Viewer: [
        'dashboard',
        'devices',
        'device-detail',
        'performance',
        'performance-history',
        'traffic',
        'access',
        'alerts',
        'analytics'
      ],
      Auditor: [
        'dashboard',
        'devices',
        'device-detail',
        'performance',
        'performance-history',
        'traffic',
        'access',
        'alerts',
        'analytics'
      ]
    };

    return pageAccess[user.role].includes(page);
  };

  const value = {
    user,
    login,
    logout,
    hasPermission,
    canAccessPage,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}