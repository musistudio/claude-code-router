import { useState, useEffect, useCallback, useRef } from 'react';
import type { MissionControlData } from '@/types/missionControl';
import { missionControlAPI } from '@/lib/missionControlAPI';

interface UseMissionControlDataOptions {
  interval?: number; // milliseconds for polling
  initialLoad?: boolean;
  retryCount?: number;
}

interface UseMissionControlDataReturn {
  data: MissionControlData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
}

const DEFAULT_OPTIONS: Required<UseMissionControlDataOptions> = {
  interval: 5000, // 5 seconds for polling
  initialLoad: true,
  retryCount: 3,
};

export function useMissionControlData(
  options: UseMissionControlDataOptions = DEFAULT_OPTIONS
): UseMissionControlDataReturn {
  const [data, setData] = useState<MissionControlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);

  const { interval, initialLoad, retryCount } = { ...DEFAULT_OPTIONS, ...options };

  const fetchData = useCallback(async (isRetry = false, isInitial = false) => {
    if (!isMountedRef.current) return;

    // Only show loading for initial load or retries, not for periodic updates
    if (isInitial || isRetry) {
      setLoading(true);
    }
    if (!isRetry) {
      setError(null);
    }

    try {
      const result = await missionControlAPI.getMissionControlStats();
      
      if (!isMountedRef.current) return;

      const normalizedData = normalizeMissionControlData(result);
      setData(normalizedData);
      setLastUpdated(Date.now());
      retryCountRef.current = 0; // Reset retry count on success

    } catch (err: any) {
      if (!isMountedRef.current) return;

      console.error('Error fetching mission control data:', err);
      
      if (retryCountRef.current < retryCount) {
        retryCountRef.current++;
        console.log(`Retrying... (${retryCountRef.current}/${retryCount})`);
        setTimeout(() => fetchData(true, false), 1000 * retryCountRef.current);
      } else {
        setError(err.message || 'Failed to fetch mission control data');
        setData(null);
      }
    } finally {
      if (isMountedRef.current && (isInitial || isRetry)) {
        setLoading(false);
      }
    }
  }, [retryCount]);

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

// Normalize mission control data to ensure all properties exist
function normalizeMissionControlData(data: any): MissionControlData {
  return {
    live: {
      deduplication: {
        totalCachedRequests: data.live?.deduplication?.totalCachedRequests || 0,
        totalDuplicateRequestsBlocked: data.live?.deduplication?.totalDuplicateRequestsBlocked || 0,
        cacheHitRate: data.live?.deduplication?.cacheHitRate || 0,
        memoryUsage: data.live?.deduplication?.memoryUsage || 0,
      },
      rateLimiting: {
        circuitBreakerState: data.live?.rateLimiting?.circuitBreakerState || 'CLOSED',
        totalRequestsTracked: data.live?.rateLimiting?.totalRequestsTracked || 0,
        rulesUsage: data.live?.rateLimiting?.rulesUsage || {},
      },
      queue: {
        currentSize: data.live?.queue?.currentSize || 0,
        totalProcessed: data.live?.queue?.totalProcessed || 0,
        averageWaitTime: data.live?.queue?.averageWaitTime || 0,
        processing: data.live?.queue?.processing || false,
      },
      retry: {
        totalRetries: data.live?.retry?.totalRetries || 0,
        successAfterRetry: data.live?.retry?.successAfterRetry || 0,
        finalFailures: data.live?.retry?.finalFailures || 0,
      },
      providers: data.live?.providers || {},
    },
    aggregated: {
      modelStats: data.aggregated?.modelStats || [],
      totalRequests: data.aggregated?.totalRequests || 0,
      successRate: data.aggregated?.successRate || 0,
      avgResponseTime: data.aggregated?.avgResponseTime || 0,
    },
    historical: data.historical || [],
    config: {
      routes: data.config?.routes || [],
      executionGuard: {
        enabled: data.config?.executionGuard?.enabled || false,
        presets: {
          economy: {
            minDelayMs: data.config?.executionGuard?.presets?.economy?.minDelayMs || 1500,
            initialBackoffMs: data.config?.executionGuard?.presets?.economy?.initialBackoffMs || 3000,
            maxQueueSize: data.config?.executionGuard?.presets?.economy?.maxQueueSize || 100,
            maxRetries: data.config?.executionGuard?.presets?.economy?.maxRetries || 3,
          },
          balanced: {
            minDelayMs: data.config?.executionGuard?.presets?.balanced?.minDelayMs || 500,
            initialBackoffMs: data.config?.executionGuard?.presets?.balanced?.initialBackoffMs || 1000,
            maxQueueSize: data.config?.executionGuard?.presets?.balanced?.maxQueueSize || 200,
            maxRetries: data.config?.executionGuard?.presets?.balanced?.maxRetries || 5,
          },
          highThroughput: {
            minDelayMs: data.config?.executionGuard?.presets?.highThroughput?.minDelayMs || 200,
            initialBackoffMs: data.config?.executionGuard?.presets?.highThroughput?.initialBackoffMs || 500,
            maxQueueSize: data.config?.executionGuard?.presets?.highThroughput?.maxQueueSize || 500,
            maxRetries: data.config?.executionGuard?.presets?.highThroughput?.maxRetries || 2,
          },
        },
        current: {
          minDelayMs: data.config?.executionGuard?.current?.minDelayMs || 500,
          initialBackoffMs: data.config?.executionGuard?.current?.initialBackoffMs || 1000,
          maxQueueSize: data.config?.executionGuard?.current?.maxQueueSize || 200,
          maxRetries: data.config?.executionGuard?.current?.maxRetries || 5,
          active: data.config?.executionGuard?.current?.active || false,
        },
      },
    },
    timestamp: data.timestamp || new Date().toISOString(),
    historicalProviders: data.historicalProviders || [],
  };
}

// Hook for real-time data only (more aggressive polling)
export function useRealTimeMissionControl() {
  return useMissionControlData({
    interval: 2000, // 2 seconds for real-time
    initialLoad: true,
    retryCount: 2,
  });
}

// Hook for aggregated data (less frequent polling)
export function useAggregatedMissionControl() {
  return useMissionControlData({
    interval: 30000, // 30 seconds for aggregated data
    initialLoad: true,
    retryCount: 1,
  });
}