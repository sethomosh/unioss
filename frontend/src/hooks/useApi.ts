// src/hooks/useApi.ts
import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface ApiHook<T> extends ApiState<T> {
  refetch: () => Promise<void>;
}

// Generic hook factory
function useApiHook<T>(apiCall: () => Promise<T>): ApiHook<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
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
        error: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [apiCall]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refetch: fetchData,
  };
}

// Health check hook
export function useHealth() {
  return useApiHook(() => apiService.getHealth());
}

// Device discovery hook
export function useDevices() {
  return useApiHook(() => apiService.getDevices());
}

// Performance metrics hook
export function usePerformance() {
  return useApiHook(() => apiService.getPerformance());
}

// Performance history hook
export function usePerformanceHistory(deviceIp: string) {
  return useApiHook(() => apiService.getPerformanceHistory(deviceIp));
}

// Traffic data hook
export function useTraffic() {
  return useApiHook(() => apiService.getTraffic());
}

// Traffic history hook
export function useTrafficHistory(deviceIp: string, interfaceName: string) {
  return useApiHook(() => apiService.getTrafficHistory(deviceIp, interfaceName));
}

// Sessions hook
export function useSessions() {
  return useApiHook(() => apiService.getSessions());
}

// Alerts hook
export function useAlerts(opts?: { limit?: number; intervalMs?: number }) {
  const limit = opts?.limit ?? 10;
  const interval = opts?.intervalMs ?? 5000; // 5s polling by default
  return usePolling(() => apiService.getAlerts(limit), interval);
}

// Dashboard metrics hook
export function useDashboardMetrics() {
  return useApiHook(() => apiService.getDashboardMetrics());
}

// SNMP data hook
export function useSNMPData(deviceIp: string, oid: string) {
  return useApiHook(() => apiService.getSNMPData(deviceIp, oid));
}

// Polling hook for real-time updates
export function usePolling<T>(
  apiCall: () => Promise<T>,
  interval: number = 30000
): ApiHook<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const data = await apiCall();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An error occurred',
      }));
    }
  }, [apiCall]);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, interval);
    return () => clearInterval(intervalId);
  }, [fetchData, interval]);

  return {
    ...state,
    refetch: fetchData,
  };
}
