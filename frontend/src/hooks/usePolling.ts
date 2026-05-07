import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { StatusResponse } from '@/lib/types';

export function usePolling(intervalMs: number = 4000): StatusResponse | null {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getStatus();
        setStatus(data);
      } catch {
        // Swallow network errors during polling — do not update state
      }
    };

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs]);

  return status;
}
