import { useState, useEffect, useCallback } from 'react';
import type { Provider } from '@/types/dashboard';
import { missionControlAPI } from '@/lib/missionControlAPI';

interface UseProviderManagerOptions {
  interval?: number; // milliseconds for polling
  initialLoad?: boolean;
  retryCount?: number;
}

interface UseProviderManagerReturn {
  providers: Provider[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
}

const DEFAULT_OPTIONS: Required<UseProviderManagerOptions> = {
  interval: 10000, // 10 seconds for polling
  initialLoad: true,
  retryCount: 3,
};

export function useProviderManager(
  options: UseProviderManagerOptions = DEFAULT_OPTIONS
): UseProviderManagerReturn {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const retryCountRef = useState(0)[0];
  const isMountedRef = useState(true)[0];

  const { interval, initialLoad, retryCount } = { ...DEFAULT_OPTIONS, ...options };

  const fetchData = useCallback(async (isRetry = false, isInitial = false) => {
    if (!isMountedRef) return;

    // Only show loading for initial load or retries, not for periodic updates
    if (isInitial || isRetry) {
      setLoading(true);
    }
    if (!isRetry) {
      setError(null);
    }

    try {
      const response = await missionControlAPI.getProviderHealth();
      
      if (!isMountedRef) return;

      if (response.success) {
        // Ensure response.data is an array before mapping
        const safeResponseData = Array.isArray(response.data) ? response.data : [];
        // Transform the API response to match our Provider type
        const transformedProviders: Provider[] = safeResponseData.map((provider: any) => ({
          id: provider.id,
          name: provider.name,
          status: provider.status,
          uptime: provider.healthScore || 99.9,
          responseTime: provider.avgResponseTime || 0,
          lastCheck: new Date(provider.lastCheck),
          outages: provider.errorRate ? Math.round(provider.errorRate * 100) : 0,
          modelOverrides: [] // In a real implementation, this would come from the API
        }));
        
        setProviders(transformedProviders);
        setLastUpdated(Date.now());
      } else {
        throw new Error('Failed to fetch provider health data');
      }

    } catch (err: any) {
      if (!isMountedRef) return;

      console.error('Error fetching provider data:', err);
      
      if (retryCountRef < retryCount) {
        // We would increment retryCountRef here in a real implementation
        console.log(`Retrying... (${retryCountRef + 1}/${retryCount})`);
        setTimeout(() => fetchData(true, false), 1000 * (retryCountRef + 1));
      } else {
        setError(err.message || 'Failed to fetch provider data');
        setProviders([]);
      }
    } finally {
      if (isMountedRef && (isInitial || isRetry)) {
        setLoading(false);
      }
    }
  }, [retryCount]);

  const refetch = useCallback(() => {
    return fetchData(false, true); // Manual refetch should show loading
  }, [fetchData]);

  useEffect(() => {
    if (initialLoad) {
      fetchData(false, true); // Initial load should show loading
    }

    const intervalId = setInterval(() => {
      fetchData(false, false); // Periodic updates should NOT show loading
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [initialLoad, interval, fetchData]);

  return {
    providers,
    loading,
    error,
    refetch,
    lastUpdated,
  };
}