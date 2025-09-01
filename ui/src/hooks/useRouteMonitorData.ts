import { useState, useEffect, useCallback, useRef } from 'react';
import type { MissionControlData } from '@/types/missionControl';
import { useMissionControlData } from './useMissionControlData';
import { missionControlAPI } from '@/lib/missionControlAPI';

interface RouteUsage {
  route: string; // 'default', 'background', 'think', 'webSearch', 'longContext'
  requests: number;
  configuredModel: string;
  actualModel: string;
  cost: number;
  avgResponseTime: number;
  successRate: number;
  recentLogs: ActivityLog[];
  status: 'active' | 'warning' | 'error';
}

interface ActivityLog {
  id: string;
  timestamp: Date;
  model: string;
  provider: string;
  route: string;
  status: 'success' | 'error' | 'retrying' | 'cached';
  latency: number;
  statusCode?: number;
}

interface SessionStats {
  totalRequests: number;
  totalCost: number;
  avgResponseTime: number;
  mostUsedRoute: string;
  modelOverrides: number;
  fallbacks: number;
  sessionStart: Date;
}

interface UseRouteMonitorDataOptions {
  interval?: number; // milliseconds for polling
  initialLoad?: boolean;
  retryCount?: number;
}

interface UseRouteMonitorDataReturn {
  routeData: { routes: RouteUsage[] } | null;
  sessionStats: SessionStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEFAULT_OPTIONS: Required<UseRouteMonitorDataOptions> = {
  interval: 5000, // 5 seconds for frequent updates
  initialLoad: true,
  retryCount: 3,
};

// Route configurations - will be populated from API data
const ROUTE_CONFIGURATIONS: Record<string, { configuredModel: string; priority: number }> = {};

export function useRouteMonitorData(
  options: UseRouteMonitorDataOptions = DEFAULT_OPTIONS
): UseRouteMonitorDataReturn {
  const { data, loading, error, refetch } = useMissionControlData(options);
  const [routeData, setRouteData] = useState<{ routes: RouteUsage[] } | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  // Process data to extract route-specific information
  const processRouteData = useCallback((missionControlData: MissionControlData | null) => {
    if (!missionControlData) {
      setRouteData(null);
      setSessionStats(null);
      return;
    }

    try {
      // Extract route data from live activity and aggregated stats
      const liveData = missionControlData.live || {};
      const aggregatedData = missionControlData.aggregated || {};
      const historicalData = missionControlData.historical || [];
      const configData = missionControlData.config || {};

      // Populate route configurations from actual config data
      let routesConfig: string[] = ['default', 'background', 'think', 'webSearch', 'longContext'];
      
      if (configData.routes) {
        if (Array.isArray(configData.routes)) {
          // If routes is an array, use it directly
          routesConfig = configData.routes as string[];
        } else if (typeof configData.routes === 'object' && !Array.isArray(configData.routes)) {
          // If routes is an object, get the keys
          const routeKeys = Object.keys(configData.routes);
          if (routeKeys.length > 0) {
            routesConfig = routeKeys;
          }
        }
        // If routes is a primitive or unexpected type, keep the default array
      }
      
      // Generate route usage data
      const routes: RouteUsage[] = [];
      try {
        // Ensure routesConfig is an array before mapping
        const safeRoutesConfig = Array.isArray(routesConfig) ? routesConfig : [];
        routes.push(...safeRoutesConfig.map((routeName) => {
          try {
            // Get configured model for this route from config
            let configuredModel = 'Unknown';
            if (Array.isArray(configData.routes)) {
              // If routes is an array, we don't have specific model configs
              configuredModel = 'Default';
            } else if (configData.routes && typeof configData.routes === 'object') {
              const routeConfig = (configData.routes as any)[routeName];
              if (routeConfig) {
                // Route config is in format "provider,model"
                const parts = typeof routeConfig === 'string' ? routeConfig.split(',') : [routeConfig];
                configuredModel = parts.length > 1 ? parts[1] : String(routeConfig);
              }
            }

            // Calculate stats for this specific route
            const routeStats = aggregatedData.modelStats?.filter((stat) => {
              // Filter by route if available, otherwise use model name
              return (stat as any).route === routeName || stat.model.includes(configuredModel);
            }) || [];

            const totalRequests = routeStats.reduce((sum, stat) => sum + (stat.totalRequests || 0), 0);
            const successfulRequests = routeStats.reduce((sum, stat) => sum + (stat.successfulRequests || 0), 0);
            const totalCost = routeStats.reduce((sum, stat) => sum + (stat.totalCost || 0), 0);
            const avgResponseTime = routeStats.length > 0
              ? routeStats.reduce((sum, stat) => sum + (stat.avgResponseTime || 0), 0) / routeStats.length
              : 0;

            const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

            // Determine actual model used (vs configured)
            const actualModel = routeStats.length > 0 ? routeStats[0].model : configuredModel;

            // Generate recent activity logs for this route
            const recentLogs: ActivityLog[] = [];
            try {
              if (historicalData && Array.isArray(historicalData)) {
                recentLogs.push(...historicalData
                  .filter(activity => (activity as any).route === routeName)
                  .slice(0, 5) // Last 5 logs
                  .map((activity) => ({
                    id: `log-${activity.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date(activity.timestamp),
                    model: (activity as any).model || configuredModel,
                    provider: (activity as any).provider || 'Unknown',
                    route: (activity as any).route || routeName,
                    status: ((activity as any).type === 'success' ? 'success' :
                            (activity as any).type === 'error' ? 'error' :
                            (activity as any).type === 'warning' ? 'retrying' : 'success') as ActivityLog['status'],
                    latency: (activity as any).responseTime || 0,
                    statusCode: (activity as any).statusCode,
                  })));
              }
            } catch (logError) {
              console.warn(`Error processing logs for route ${routeName}:`, logError);
              // recentLogs remains empty array
            }

            // Determine route status
            let status: 'active' | 'warning' | 'error' = 'active';
            if (successRate < 80) status = 'error';
            else if (successRate < 95 || avgResponseTime > 3000) status = 'warning';

            return {
              route: routeName,
              requests: totalRequests,
              configuredModel: configuredModel,
              actualModel,
              cost: totalCost,
              avgResponseTime: avgResponseTime,
              successRate,
              recentLogs,
              status,
            };
          } catch (routeError) {
            console.warn(`Error processing route ${routeName}:`, routeError);
            // Return a default route object
            return {
              route: routeName,
              requests: 0,
              configuredModel: 'Unknown',
              actualModel: 'Unknown',
              cost: 0,
              avgResponseTime: 0,
              successRate: 0,
              recentLogs: [],
              status: 'error' as const,
            };
          }
        }));
      } catch (routesError) {
        console.error('Error generating routes:', routesError);
        // routes remains empty array
      }
      const totalRequests = routes.reduce((sum, route) => sum + route.requests, 0);
      const totalCost = routes.reduce((sum, route) => sum + route.cost, 0);
      const avgResponseTime = routes.length > 0 
        ? routes.reduce((sum, route) => sum + route.avgResponseTime * route.requests, 0) / totalRequests 
        : 0;
      
      const mostUsedRoute = routes.length > 0 
        ? routes.reduce((maxRoute, route) => 
            route.requests > maxRoute.requests ? route : maxRoute, routes[0]
          )?.route 
        : 'default';

      const modelOverrides = routes.filter(route => route.actualModel !== route.configuredModel).length;
      const fallbacks = routes.filter(route => route.status !== 'active').length;

      const sessionStatsData: SessionStats = {
        totalRequests,
        totalCost,
        avgResponseTime,
        mostUsedRoute,
        modelOverrides,
        fallbacks,
        sessionStart: new Date(Date.now() - 3600000), // Assume session started 1 hour ago
      };

      setRouteData({ routes });
      setSessionStats(sessionStatsData);
    } catch (err) {
      console.error('Error processing route data:', err);
      setRouteData(null);
      setSessionStats(null);
    }
  }, []);

  // Process data whenever mission control data changes
  useEffect(() => {
    processRouteData(data);
  }, [data, processRouteData]);

  // Enhanced refetch function
  const enhancedRefetch = useCallback(async () => {
    await refetch();
    // Note: processRouteData will be called by the useEffect when data updates
  }, [refetch]);

  return {
    routeData,
    sessionStats,
    loading,
    error,
    refetch: enhancedRefetch,
  };
}

// Hook for getting real-time route updates (more frequent polling)
export function useRealTimeRouteMonitor() {
  return useRouteMonitorData({
    interval: 2000, // 2 seconds for real-time updates
    initialLoad: true,
    retryCount: 2,
  });
}

// Hook for getting route statistics (less frequent polling)
export function useRouteStatistics() {
  return useRouteMonitorData({
    interval: 15000, // 15 seconds for statistics
    initialLoad: true,
    retryCount: 1,
  });
}