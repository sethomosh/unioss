import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useDevices, usePerformanceHistory, useTrafficHistory, useAlerts, useSNMPData } from '../hooks/useApi';

export function DeviceDetail() {
  const { ip } = useParams<{ ip: string }>();
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [snmpOid, setSnmpOid] = useState<string>('1.3.6.1.2.1.1.1.0'); // sysDescr
  const [snmpResult, setSnmpResult] = useState<string>('');

  const { data: devices } = useDevices();
  const { data: performanceHistory } = usePerformanceHistory(ip || '');
  const { data: trafficHistory } = useTrafficHistory(ip || '', selectedInterface);
  const { data: alerts } = useAlerts();
  const { data: snmpData, refetch: refetchSNMP } = useSNMPData(ip || '', snmpOid);

  const device = devices?.find(d => d.device_ip === ip);
  const deviceAlerts = alerts?.filter(a => a.device_ip === ip) || [];

  const performanceData = performanceHistory?.slice(-50).map(point => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    CPU: point.cpu_pct,
    Memory: point.memory_pct
  })) || [];

  const trafficData = trafficHistory?.slice(-50).map(point => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    'In (Mbps)': Math.round(point.inbound_kbps / 1000),
    'Out (Mbps)': Math.round(point.outbound_kbps / 1000)
  })) || [];

  const handleSNMPQuery = async () => {
    try {
      await refetchSNMP();
      if (snmpData) {
        setSnmpResult(JSON.stringify(snmpData, null, 2));
      }
    } catch (error) {
      setSnmpResult('Error: Failed to fetch SNMP data');
    }
  };

  if (!device) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            <div className="text-6xl mb-4">❌</div>
            <h3 className="text-lg font-semibold mb-2">Device not found</h3>
            <p className="text-sm mb-4">The device with IP {ip} could not be found.</p>
            <Link to="/discovery" className="text-primary hover:underline">
              Back to Discovery
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/discovery" className="text-muted-foreground hover:text-foreground">
              ← Discovery
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono">{device.device_ip}</span>
          </div>
          <h1 className="text-3xl font-bold font-serif">{device.hostname}</h1>
          <p className="text-muted-foreground">{device.vendor} {device.os}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            device.status === 'up' ? 'bg-green-100 text-green-800' :
            device.status === 'down' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {device.status.toUpperCase()}
          </span>
        </div>
      </motion.div>

      {/* Device Info Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">IP Address</h3>
          <p className="font-mono text-lg">{device.device_ip}</p>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Vendor</h3>
          <p className="text-lg">{device.vendor}</p>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">OS</h3>
          <p className="text-lg">{device.os}</p>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Last Seen</h3>
          <p className="text-sm">{new Date(device.last_seen).toLocaleString()}</p>
        </div>
      </motion.div>

      {/* Performance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card border border-border rounded-lg shadow-sm"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Performance History</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis 
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="CPU" 
                  stroke="var(--chart-1)" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="Memory" 
                  stroke="var(--chart-2)" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Interfaces and Traffic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interfaces Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Interfaces</h2>
            <div className="space-y-3">
              {device.interfaces?.map((iface) => (
                <div
                  key={iface.interface_name}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedInterface === iface.interface_name
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedInterface(iface.interface_name)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-mono font-medium">{iface.interface_name}</h3>
                      <p className="text-sm text-muted-foreground">{iface.description}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        iface.status === 'up' ? 'bg-green-100 text-green-800' :
                        iface.status === 'down' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {iface.status}
                      </span>
                      {iface.speed && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {iface.speed} Mbps
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Traffic Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              Traffic History
              {selectedInterface && ` - ${selectedInterface}`}
            </h2>
            {selectedInterface ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis 
                      dataKey="time" 
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="In (Mbps)" 
                      stackId="1"
                      stroke="var(--chart-1)" 
                      fill="var(--chart-1)"
                      fillOpacity={0.6}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="Out (Mbps)" 
                      stackId="1"
                      stroke="var(--chart-2)" 
                      fill="var(--chart-2)"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Select an interface to view traffic data
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Alerts and SNMP Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Device Alerts</h2>
            <div className="space-y-3">
              {deviceAlerts.length > 0 ? (
                deviceAlerts.map((alert) => (
                  <div key={alert.id} className="p-3 border border-border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">{alert.category}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {alert.severity}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-4xl mb-2">✅</div>
                  <p>No alerts for this device</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* SNMP Tools */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">SNMP Tools</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">OID</label>
                <input
                  type="text"
                  value={snmpOid}
                  onChange={(e) => setSnmpOid(e.target.value)}
                  placeholder="1.3.6.1.2.1.1.1.0"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSNMPQuery}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Query
                </button>
                <button
                  onClick={() => setSnmpOid('1.3.6.1.2.1.1.1.0')}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                >
                  sysDescr
                </button>
                <button
                  onClick={() => setSnmpOid('1.3.6.1.2.1.1.2.0')}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                >
                  sysObjectID
                </button>
              </div>
              {snmpResult && (
                <div>
                  <label className="block text-sm font-medium mb-2">Result</label>
                  <pre className="w-full p-3 bg-muted border border-border rounded-md text-sm font-mono overflow-x-auto">
                    {snmpResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
