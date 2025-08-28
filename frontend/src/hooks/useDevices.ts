// src/hooks/useDevices.ts
import { useEffect, useState } from "react";
import { apiService } from "../services/apiService";
import type { Device } from "../types/types";

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      try {
        const res: Device[] = await apiService.getDevices();
        setDevices(res);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch devices";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, []);

  return { devices, loading, error };
}
