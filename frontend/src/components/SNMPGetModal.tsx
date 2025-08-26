import { useState } from 'react';
import { Modal } from './Modal';

interface SNMPGetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGet: (deviceIp: string, oid: string, community: string, port: string) => void;
  onWalk: (deviceIp: string, community: string, port: string) => void;
}

export function SNMPGetModal({ isOpen, onClose, onGet, onWalk }: SNMPGetModalProps) {
  const [deviceIp, setDeviceIp] = useState('');
  const [oid, setOid] = useState('1.3.6.1.2.1.1.1.0');
  const [community, setCommunity] = useState('public');
  const [port, setPort] = useState('161');
  const [operation, setOperation] = useState<'get' | 'walk'>('get');

  const handleSubmit = () => {
    if (operation === 'get') {
      onGet(deviceIp, oid, community, port);
    } else {
      onWalk(deviceIp, community, port);
    }
    onClose();
  };

  const commonOIDs = [
    { name: 'sysDescr', oid: '1.3.6.1.2.1.1.1.0' },
    { name: 'sysObjectID', oid: '1.3.6.1.2.1.1.2.0' },
    { name: 'sysUpTime', oid: '1.3.6.1.2.1.1.3.0' },
    { name: 'sysContact', oid: '1.3.6.1.2.1.1.4.0' },
    { name: 'sysName', oid: '1.3.6.1.2.1.1.5.0' },
    { name: 'sysLocation', oid: '1.3.6.1.2.1.1.6.0' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SNMP Operation"
      size="lg"
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
            Execute
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={() => setOperation('get')}
            className={`px-4 py-2 rounded-md text-sm ${
              operation === 'get' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            SNMP GET
          </button>
          <button
            onClick={() => setOperation('walk')}
            className={`px-4 py-2 rounded-md text-sm ${
              operation === 'walk' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            SNMP WALK
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Device IP</label>
            <input
              type="text"
              value={deviceIp}
              onChange={(e) => setDeviceIp(e.target.value)}
              placeholder="192.168.1.1"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          
          {operation === 'get' && (
            <div>
              <label className="block text-sm font-medium mb-2">OID</label>
              <input
                type="text"
                value={oid}
                onChange={(e) => setOid(e.target.value)}
                placeholder="1.3.6.1.2.1.1.1.0"
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">Community</label>
            <input
              type="text"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              placeholder="public"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="161"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        
        {operation === 'get' && (
          <div>
            <label className="block text-sm font-medium mb-2">Common OIDs</label>
            <div className="flex flex-wrap gap-2">
              {commonOIDs.map((item) => (
                <button
                  key={item.oid}
                  onClick={() => setOid(item.oid)}
                  className="px-3 py-1 bg-secondary text-secondary-foreground text-sm rounded-md hover:bg-secondary/80 transition-colors"
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}