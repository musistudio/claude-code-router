import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiPollingOptions<T> {
  interval?: number; // milliseconds for polling
  initialLoad?: boolean;
  retryCount?: number;
  endpoint: string;
}

interface UseApiPollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
}

const DEFAULT_OPTIONS = {
  interval: 5000, // 5 seconds for polling
  initialLoad: true,
  retryCount: 3,
};

export function useApiPolling<T>(
  options: UseApiPollingOptions<T>
): UseApiPollingReturn<T> {
  const { interval, initialLoad, retryCount, endpoint } = { ...DEFAULT_OPTIONS, ...options };
  
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (isRetry = false, isInitial = false) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (!isMountedRef.current) return;

    // Only show loading for initial load or retries, not for periodic updates
    if (isInitial || isRetry) {
      setLoading(true);
    }
    if (!isRetry) {
      setError(null);
    }

    try {
      const response = await fetch(endpoint, { signal });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!isMountedRef.current) return;

      setData(result);
      setLastUpdated(Date.now());
      retryCountRef.current = 0; // Reset retry count on success

    } catch (err: any) {
      if (!isMountedRef.current) return;

      // Don't set error state if the fetch was aborted
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }

      console.error(`Error fetching data from ${endpoint}:`, err);
      
      if (retryCountRef.current < (retryCount || DEFAULT_OPTIONS.retryCount)) {
        retryCountRef.current++;
        console.log(`Retrying... (${retryCountRef.current}/${retryCount || DEFAULT_OPTIONS.retryCount})`);
        setTimeout(() => fetchData(true, false), 1000 * retryCountRef.current);
      } else {
        setError(err.message || `Failed to fetch data from ${endpoint}`);
        setData(null);
      }
    } finally {
      if (isMountedRef.current && (isInitial || isRetry)) {
        setLoading(false);
      }
    }
  }, [endpoint, retryCount]);

  const refetch = useCallback(() => {
    retryCountRef.current = 0;
    return fetchData(false, true); // Manual refetch should show loading
  }, [fetchData]);

  useEffect(() => {
    isMountedRef.current = true;
    if (initialLoad) {
      fetchData(false, true); // Initial load should show loading
    }

    const intervalId = setInterval(() => {
      fetchData(false, false); // Periodic updates should NOT show loading
    }, interval);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      
      // Abort any ongoing request when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initialLoad, interval, fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    lastUpdated,
  };
}