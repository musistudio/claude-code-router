import { useState, useEffect } from 'react';

interface RouteEfficiencyData {
  route: string;
  model: string;
  provider: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  efficiency: number;
  cost: number;
  lastUsed: number;
}

interface RouteStatsData {
  route: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  totalTokens: number;
  totalCost: number;
  models: Record<string, number>;
  lastUsed: number;
}

interface RouteEfficiencyResponse {
  routes: RouteEfficiencyData[];
  summary: {
    totalRoutes: number;
    avgEfficiency: number;
    bestPerforming: string;
    needsOptimization: number;
  };
}

export interface RouteEfficiencyHookData {
  routes: RouteEfficiencyData[];
  stats: RouteStatsData[];
  summary: RouteEfficiencyResponse['summary'];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Custom hook for fetching real route efficiency data from API endpoints
 * created in Task #1. Replaces hardcoded logic with real analytics data.
 */
export function useRouteEfficiency(): RouteEfficiencyHookData {
  const [data, setData] = useState<{
    routes: RouteEfficiencyData[];
    stats: RouteStatsData[];
    summary: RouteEfficiencyResponse['summary'];
  }>({
    routes: [],
    stats: [],
    summary: {
      totalRoutes: 0,
      avgEfficiency: 0,
      bestPerforming: 'none',
      needsOptimization: 0,
    },
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRouteEfficiency = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [efficiencyResponse, statsResponse] = await Promise.all([
        fetch('/api/v1/mission-control/route-efficiency'),
        fetch('/api/v1/mission-control/route-stats')
      ]);

      if (!efficiencyResponse.ok || !statsResponse.ok) {
        throw new Error(`API Error: ${efficiencyResponse.status} / ${statsResponse.status}`);
      }

      const efficiencyData = await efficiencyResponse.json();
      const statsData = await statsResponse.json();

      if (!efficiencyData.success || !statsData.success) {
        throw new Error('API returned error response');
      }

      setData({
        routes: efficiencyData.data.routes || [],
        stats: statsData.data || [],
        summary: efficiencyData.data.summary || {
          totalRoutes: 0,
          avgEfficiency: 0,
          bestPerforming: 'none',
          needsOptimization: 0,
        },
      });

    } catch (err) {
      console.error('Failed to fetch route efficiency data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch route data');
      
      // Fallback to empty data instead of mock data
      setData({
        routes: [],
        stats: [],
        summary: {
          totalRoutes: 0,
          avgEfficiency: 0,
          bestPerforming: 'none',
          needsOptimization: 0,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRouteEfficiency();
  }, []);

  return {
    routes: data.routes,
    stats: data.stats,
    summary: data.summary,
    isLoading,
    error,
    refetch: fetchRouteEfficiency,
  };
}