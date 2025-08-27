// src/pages/DevicesPage.tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiClient, Device, Performance, Traffic } from '../utils/api';

type ConnectedDevice = { ip: string; interface: string; status: 'up' | 'down' };

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);

  // fetch devices and select first
  const fetchDevices = async () => {
    try {
      const deviceList = await apiClient.getDevices().catch(() => [] as Device[]);

      const devicesToUse =
        deviceList.length > 0
          ? deviceList
          : Array.from({ length: 10 }).map((_, i) => ({
              ip: `192.168.0.${i + 1}`,
              type: i % 2 === 0 ? 'Router' : 'Switch',
              status: i % 3 === 0 ? 'down' : 'up',
              last_updated: new Date().toISOString(),
            }));

      setDevices(devicesToUse);
      if (devicesToUse.length > 0) setSelectedDevice(devicesToUse[0]);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const fetchDeviceDetails = async (deviceIp: string) => {
    try {
      const [perf, traf] = await Promise.all([
        apiClient.getPerformance(deviceIp).catch(() => [] as Performance[]),
        apiClient.getTraffic(deviceIp).catch(() => [] as Traffic[]),
      ]);
      setPerformance(perf);
      setTraffic(traf);

      // mock connected devices for now
      const mockConnections: ConnectedDevice[] = Array.from({ length: 3 }).map((_, i) => ({
        ip: `192.168.0.${Math.floor(Math.random() * 10) + 1}`,
        interface: `eth${i}`,
        status: Math.random() > 0.3 ? 'up' : 'down',
      }));
      setConnectedDevices(mockConnections);
    } catch (err) {
      console.error('Failed to fetch device details', err);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) fetchDeviceDetails(selectedDevice.ip);
  }, [selectedDevice]);

  return (
    <div className="p-6 w-full space-y-6">
      <h1 className="text-3xl font-bold">Devices</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Devices Table */}
        <div className="flex-1 bg-card p-4 rounded shadow overflow-auto">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">All Devices</h2>
          <table className="min-w-full table-auto text-left border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-2 border-b">IP</th>
                <th className="px-4 py-2 border-b">Type</th>
                <th className="px-4 py-2 border-b">Status</th>
                <th className="px-4 py-2 border-b">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((dev) => (
                <tr
                  key={dev.ip}
                  className={`hover:bg-muted/10 cursor-pointer ${
                    selectedDevice?.ip === dev.ip ? 'bg-muted/20' : ''
                  }`}
                  onClick={() => setSelectedDevice(dev)}
                >
                  <td className="px-4 py-2">{dev.ip}</td>
                  <td className="px-4 py-2">{dev.type}</td>
                  <td className="px-4 py-2 text-white px-2 py-1 rounded-full text-center"
                      style={{ backgroundColor: dev.status === 'up' ? '#34d399' : '#f87171' }}>
                    {dev.status.toUpperCase()}
                  </td>
                  <td className="px-4 py-2">{new Date(dev.last_updated).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Device Details + Charts */}
        <div className="flex-1 flex flex-col gap-4">
          {selectedDevice && (
            <>
              {/* Connected Devices */}
              <div className="bg-card p-4 rounded shadow">
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                  Connected Devices
                </h2>
                <ul className="space-y-1">
                  {connectedDevices.map((c, idx) => (
                    <li key={idx} className="flex justify-between items-center px-2 py-1 border-b">
                      <span>{c.ip}</span>
                      <span
                        className={`text-white px-2 py-1 rounded-full`}
                        style={{ backgroundColor: c.status === 'up' ? '#34d399' : '#f87171' }}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CPU / Memory Chart */}
              <div className="bg-card p-4 rounded shadow">
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                  CPU & Memory Usage
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={performance}>
                    <XAxis dataKey="device_ip" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cpu_pct" stroke="#8884d8" name="CPU %" />
                    {performance.some((p) => p.memory_pct !== undefined) && (
                      <Line type="monotone" dataKey="memory_pct" stroke="#82ca9d" name="Memory %" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Traffic Chart */}
              <div className="bg-card p-4 rounded shadow">
                <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                  Interface Traffic
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={traffic}>
                    <XAxis dataKey="interface_name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="in_bps" stroke="#82ca9d" name="In" />
                    <Line type="monotone" dataKey="out_bps" stroke="#8884d8" name="Out" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevicesPage;
