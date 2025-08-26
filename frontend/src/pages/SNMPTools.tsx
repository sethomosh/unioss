import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSNMPData } from '../hooks/useApi';

export function SNMPTools() {
  const [deviceIp, setDeviceIp] = useState('');
  const [oid, setOid] = useState('1.3.6.1.2.1.1.1.0'); // sysDescr by default
  const [community, setCommunity] = useState('public');
  const [port, setPort] = useState('161');
  const [snmpResult, setSnmpResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { refetch: refetchSNMP } = useSNMPData(deviceIp, oid);

  const handleSNMPGet = async () => {
    if (!deviceIp || !oid) {
      setError('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // In a real implementation, we would call an API endpoint
      // For now, we'll simulate the response
      const mockResponse = {
        device_ip: deviceIp,
        oid: oid,
        value: `Mock SNMP response for ${oid} on ${deviceIp}`,
        timestamp: new Date().toISOString()
      };
      
      setSnmpResult(mockResponse);
    } catch (err) {
      setError('Failed to fetch SNMP data');
      setSnmpResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSNMPWalk = async () => {
    if (!deviceIp) {
      setError('Please enter a device IP');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // In a real implementation, we would call an API endpoint for SNMP walk
      // For now, we'll simulate the response
      const mockResponse = {
        device_ip: deviceIp,
        results: [
          { oid: '1.3.6.1.2.1.1.1.0', value: 'Cisco IOS Software, C2960 Software' },
          { oid: '1.3.6.1.2.1.1.2.0', value: '1.3.6.1.4.1.9.1.1234' },
          { oid: '1.3.6.1.2.1.1.3.0', value: '123456789' },
          { oid: '1.3.6.1.2.1.1.4.0', value: 'admin@example.com' },
          { oid: '1.3.6.1.2.1.1.5.0', value: 'switch-01.example.com' },
        ],
        timestamp: new Date().toISOString()
      };
      
      setSnmpResult(mockResponse);
    } catch (err) {
      setError('Failed to perform SNMP walk');
      setSnmpResult(null);
    } finally {
      setLoading(false);
    }
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
    <div className="container mx-auto px-4 py-6 space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold font-serif mb-2">SNMP Tools</h1>
        <p className="text-muted-foreground">Ad-hoc SNMP GET/Walk UI and bulk SNMP actions</p>
      </motion.div>

      {/* SNMP GET Form */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">SNMP GET</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
          
          <div className="flex flex-wrap gap-2 mb-4">
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
          
          <div className="flex gap-2">
            <button
              onClick={handleSNMPGet}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Fetching...' : 'SNMP GET'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* SNMP WALK Form */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">SNMP WALK</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
          
          <div className="flex gap-2">
            <button
              onClick={handleSNMPWalk}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Walking...' : 'SNMP WALK'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Results */}
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3, delay: 0.3 }}
          className="bg-destructive/10 border border-destructive/30 rounded-lg p-4"
        >
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-destructive font-medium">Error: {error}</span>
          </div>
        </motion.div>
      )}
      
      {snmpResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3, delay: 0.3 }}
          className="bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Results</h2>
            
            {Array.isArray(snmpResult.results) ? (
              // SNMP WALK results
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3">OID</th>
                      <th className="text-left py-2 px-3">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snmpResult.results.map((item: any, index: number) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono">{item.oid}</td>
                        <td className="py-2 px-3">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // SNMP GET result
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Device IP:</span>
                  <span className="font-mono">{snmpResult.device_ip}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">OID:</span>
                  <span className="font-mono">{snmpResult.oid}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Value:</span>
                  <span>{snmpResult.value}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Timestamp:</span>
                  <span>{new Date(snmpResult.timestamp).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}