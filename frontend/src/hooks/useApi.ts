import { useState, useEffect, useCallback } from 'react';
import { apiClient, getDashboardMetrics } from '../utils/api';
import type { Device, Performance, Traffic, Session, Alert, HealthStatus } from '../utils/api';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface ApiHook<T> extends ApiState<T> {
  refetch: () => Promise<void>;
}

// Generic hook factory
function useApiHook<T>(
  apiCall: () => Promise<T>,
  dependencies: unknown[] = []
): ApiHook<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await apiCall();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ 
        data: null, 
        loading: false, 
        error: error instanceof Error ? error.message : 'An error occurred' 
      });
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, dependencies);

  return {
    ...state,
    refetch: fetchData
  };
}

// Health check hook
export function useHealth(): ApiHook<HealthStatus> {
  return useApiHook(() => apiClient.getHealth());
}

// Device discovery hook
export function useDevices(): ApiHook<Device[]> {
  return useApiHook(() => apiClient.getDevices());
}

// Performance metrics hook
export function usePerformance(): ApiHook<Performance[]> {
  return useApiHook(() => apiClient.getPerformance());
}

// Performance history hook
export function usePerformanceHistory(deviceIp: string): ApiHook<Performance[]> {
  return useApiHook(
    () => apiClient.getPerformanceHistory(deviceIp),
    [deviceIp]
  );
}

// Traffic data hook
export function useTraffic(): ApiHook<Traffic[]> {
  return useApiHook(() => apiClient.getTraffic());
}

// Traffic history hook
export function useTrafficHistory(deviceIp: string, interfaceName: string): ApiHook<Traffic[]> {
  return useApiHook(
    () => apiClient.getTrafficHistory(deviceIp, interfaceName),
    [deviceIp, interfaceName]
  );
}

// Sessions hook
export function useSessions(): ApiHook<Session[]> {
  return useApiHook(() => apiClient.getSessions());
}

// Alerts hook
export function useAlerts(): ApiHook<Alert[]> {
  return useApiHook(() => apiClient.getAlerts());
}

// Dashboard metrics hook
export function useDashboardMetrics(): ApiHook<{
  total_devices: number;
  devices_up: number;
  devices_down: number;
  active_alerts: number;
  avg_cpu: number;
  total_throughput: number;
}> {
  return useApiHook<{
    total_devices: number;
    devices_up: number;
    devices_down: number;
    active_alerts: number;
    avg_cpu: number;
    total_throughput: number;
  }>(() => getDashboardMetrics());
}

// SNMP data hook
export function useSNMPData(deviceIp: string, oid: string): ApiHook<{ device_ip: string; oid: string; value: string; timestamp: string }> {
  return useApiHook(
    () => apiClient.getSNMPData(deviceIp, oid),
    [deviceIp, oid]
  );
}

// Alert acknowledgment hook
export function useAlertAcknowledgment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.acknowledgeAlert(alertId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert');
    } finally {
      setLoading(false);
    }
  }, []);

  return { acknowledgeAlert, loading, error };
}

// Polling hook for real-time updates
export function usePolling<T>(
  apiCall: () => Promise<T>,
  interval: number = 30000, // 30 seconds default
  dependencies: unknown[] = []
): ApiHook<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null
  });

  const fetchData = useCallback(async () => {
    try {
      const data = await apiCall();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'An error occurred' 
      }));
    }
  }, dependencies);

  useEffect(() => {
    fetchData(); // Initial fetch
    
    const intervalId = setInterval(fetchData, interval);
    return () => clearInterval(intervalId);
  }, dependencies);

  return {
    ...state,
    refetch: fetchData
  };
}
