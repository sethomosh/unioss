import { useState } from 'react';
import { Modal } from './Modal';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'Administrator' | 'Operator' | 'Viewer' | 'Auditor';
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (user: User) => void;
}

export function UserManagementModal({ isOpen, onClose, user, onSave }: UserManagementModalProps) {
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<User['role']>(user?.role || 'Viewer');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (!username || !email) {
      alert('Please fill in all required fields');
      return;
    }

    const userData: User = {
      id: user?.id || `user_${Date.now()}`,
      username,
      email,
      role
    };

    onSave(userData);
    onClose();
  };

  const roles: User['role'][] = ['Administrator', 'Operator', 'Viewer', 'Auditor'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? 'Edit User' : 'Add User'}
      size="md"
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Username *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as User['role'])}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          
          {!user && (
            <div>
              <label className="block text-sm font-medium mb-2">Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </div>
        
        <div className="text-xs text-muted-foreground">
          <p>* Required fields</p>
        </div>
      </div>
    </Modal>
  );
}