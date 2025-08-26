import { Modal } from './Modal';
import { Alert as AlertType } from '../types/types';
import { useAlertAcknowledgment } from '../hooks/useApi';

interface AlertDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alert: AlertType | null;
  onAcknowledge: () => void;
}

export function AlertDetailsModal({ isOpen, onClose, alert, onAcknowledge }: AlertDetailsModalProps) {
  const { acknowledgeAlert, loading, error } = useAlertAcknowledgment();

  if (!alert) return null;

  const handleAcknowledge = async () => {
    try {
      await acknowledgeAlert(alert.id);
      onAcknowledge();
      onClose();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleAssign = () => {
    // In a real implementation, this would assign the alert to a user
    console.log('Assign functionality would be implemented here');
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'info': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Alert Details"
      size="lg"
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50"
          >
            Close
          </button>
          {!alert.acknowledged && (
            <>
              <button
                onClick={handleAssign}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Assign
              </button>
              <button
                onClick={handleAcknowledge}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? 'Acknowledging...' : 'Acknowledge'}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColor(alert.severity)}`}>
            {alert.severity}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {alert.device_ip}
          </span>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Message</h4>
          <p className="text-foreground">{alert.message}</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Category</h4>
          <p className="text-foreground">{alert.category}</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-1">Created At</h4>
            <p className="text-foreground font-mono">
              {new Date(alert.timestamp).toLocaleString()}
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-1">Status</h4>
            <p className={`font-medium ${alert.acknowledged ? 'text-green-600' : 'text-destructive'}`}>
              {alert.acknowledged ? 'Acknowledged' : 'Active'}
            </p>
          </div>
        </div>
        
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
            Error: {error}
          </div>
        )}
      </div>
    </Modal>
  );
}