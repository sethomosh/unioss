import { Link } from 'react-router-dom';
import type { Device } from '../utils/api';

interface DeviceCardProps {
  device: Device;
}

export function DeviceCard({ device }: DeviceCardProps) {
  const getStatusColor = () => {
    switch (device.status) {
      case 'up': return 'bg-green-100 text-green-800';
      case 'down': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = () => {
    switch (device.status) {
      case 'up': return '🟢';
      case 'down': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <Link to={`/devices/${device.ip}`}>
      <div className="card hover:shadow-lg transition-all duration-200 cursor-pointer group">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
              {device.hostname}
            </h3>
            <p className="text-sm text-muted-foreground font-mono">{device.ip}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{getStatusIcon()}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
              {device.status}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{device.description}</p>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Vendor:</span>
            <span className="font-medium">{device.vendor}</span>
          </div>

          {device.interfaces && device.interfaces.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Interfaces:</span>
              <span className="font-medium">{device.interfaces.length}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last seen:</span>
            <span className="font-mono text-xs">
              {new Date(device.last_seen).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
