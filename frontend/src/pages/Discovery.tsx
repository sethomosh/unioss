import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useDevices } from '../hooks/useApi';
import { DeviceCard } from '../components/DeviceCard';

export function Discovery() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const { data: devices, loading } = useDevices();

  const filteredDevices = devices?.filter(device => {
    const matchesSearch = device.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.device_ip.includes(searchTerm) ||
                         device.vendor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    const matchesVendor = vendorFilter === 'all' || device.vendor === vendorFilter;
    
    return matchesSearch && matchesStatus && matchesVendor;
  }) || [];

  const vendors = [...new Set(devices?.map(d => d.vendor) || [])];
  const statuses = ['up', 'down', 'unknown'];

  return (
    <div className="w-full mx-auto px-2 md:px-4 lg:px-6 py-4 md:py-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold font-serif mb-1">Device Discovery</h1>
        <p className="text-sm text-muted-foreground">Discover and manage network devices</p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-card border border-border rounded-lg shadow-sm p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Status</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Vendor</label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Vendors</option>
              {vendors.map(vendor => (
                <option key={vendor} value={vendor}>{vendor}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setVendorFilter('all');
              }}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </motion.div>

      {/* Results Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex justify-between items-center"
      >
        <div className="text-sm text-muted-foreground">
          Showing {filteredDevices.length} of {devices?.length || 0} devices
        </div>
        <div className="flex gap-2 text-sm">
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
            {devices?.filter(d => d.status === 'up').length || 0} Up
          </span>
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
            {devices?.filter(d => d.status === 'down').length || 0} Down
          </span>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
            {devices?.filter(d => d.status === 'unknown').length || 0} Unknown
          </span>
        </div>
      </motion.div>

      {/* Device Grid */}
      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-12"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {filteredDevices.map((device, index) => (
            <motion.div
              key={device.device_ip}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * index }}
            >
              <Link to={`/devices/${device.device_ip}`}>
                <DeviceCard device={device} />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Empty State */}
      {!loading && filteredDevices.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="text-muted-foreground">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold mb-2">No devices found</h3>
            <p className="text-sm">Try adjusting your search criteria or filters</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
