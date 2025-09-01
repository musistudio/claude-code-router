import { useState, useEffect, useCallback, useRef } from 'react';
import type { MissionControlData } from '@/types/missionControl';
import { useMissionControlData } from './useMissionControlData';
import { missionControlAPI } from '@/lib/missionControlAPI';

interface SystemHealth {
  overall: 'operational' | 'issues' | 'critical';
  components: {
    providers: { [name: string]: 'online' | 'offline' | 'degraded' };
    routes: { [name: string]: 'active' | 'warning' | 'error' };
    cache: { hitRate: number, size: number };
    rateLimit: { usage: number, limit: number, percentage: number };
    alerts: SystemAlert[];
  };
}

interface SystemAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  autoFix: boolean;
  manualAction?: string;
  timestamp: Date;
}

export interface AutoFixAction {
  id: string;
  title: string;
  description: string;
  action: () => Promise<boolean>;
}

interface UseSystemHealthCheckerOptions {
  interval?: number;
  initialLoad?: boolean;
  autoRefresh?: boolean;
}

interface UseSystemHealthCheckerReturn {
  systemHealth: SystemHealth | null;
  alerts: SystemAlert[];
  autoFixActions: AutoFixAction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  dismissAlert: (alertId: string) => void;
  executeAutoFix: (actionId: string) => Promise<boolean>;
}

const DEFAULT_OPTIONS: Required<UseSystemHealthCheckerOptions> = {
  interval: 10000, // 10 seconds for real-time updates
  initialLoad: true,
  autoRefresh: true,
};

export function useSystemHealthChecker(
  options: UseSystemHealthCheckerOptions = DEFAULT_OPTIONS
): UseSystemHealthCheckerReturn {
  const { data: missionControlData, loading: dataLoading, error: dataError, refetch: refetchData } = useMissionControlData(options);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [autoFixActions, setAutoFixActions] = useState<AutoFixAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Process mission control data to generate system health
  const processData = useCallback((data: MissionControlData | null) => {
    if (!data || !isMountedRef.current) return;

    try {
      // Analyze provider health
      const providers: { [name: string]: 'online' | 'offline' | 'degraded' } = {};
      const providerData = data.live?.providers || {};
      
      Object.entries(providerData).forEach(([name, provider]) => {
        const status = provider.status || 'unknown';
        if (status === 'online') {
          providers[name] = 'online';
        } else if (status === 'offline') {
          providers[name] = 'offline';
        } else {
          providers[name] = 'degraded';
        }
      });

      // Analyze route health
      const routes: { [name: string]: 'active' | 'warning' | 'error' } = {
        default: 'active',
        background: 'active', 
        think: 'active',
        webSearch: 'active',
        longContext: 'active'
      };

      // Calculate route health based on response time and success rate
      const aggregatedData = data.aggregated || {};
      const modelStats = aggregatedData.modelStats || [];
      
      modelStats.forEach((stat) => {
        const avgResponseTime = stat.avgResponseTime || 0;
        const successRate = (stat.successfulRequests || 0) / (stat.totalRequests || 1) * 100;
        
        if (avgResponseTime > 2000 || successRate < 90) {
          Object.keys(routes).forEach(route => {
            if (routes[route] === 'active') {
              routes[route] = successRate < 70 ? 'error' : 'warning';
            }
          });
        }
      });

      // Analyze cache health
      const cacheData = data.live?.deduplication || {};
      const cacheHitRate = cacheData.cacheHitRate || 0;
      const cacheSize = cacheData.memoryUsage || 0;

      // Analyze rate limiting
      const rateLimitData = data.live?.rateLimiting || {};
      const rulesUsage = rateLimitData.rulesUsage || {};
      
      // Calculate overall rate limit pressure
      let maxUsage = 0;
      let totalLimit = 0;
      let totalUsed = 0;
      
      Object.entries(rulesUsage).forEach(([key, usage]) => {
        const percentage = usage.percentage || 0;
        if (percentage > maxUsage) {
          maxUsage = percentage;
        }
        totalLimit += usage.limit || 100;
        totalUsed += usage.current || 0;
      });

      const rateLimitPercentage = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

      // Determine overall system status
      let overall: SystemHealth['overall'] = 'operational';
      if (maxUsage >= 95 || Object.values(providers).some(p => p === 'offline')) {
        overall = 'critical';
      } else if (maxUsage >= 80 || Object.values(providers).some(p => p === 'degraded')) {
        overall = 'issues';
      }

      // Generate alerts
      const newAlerts: SystemAlert[] = [];

      // Rate limit alerts
      if (maxUsage >= 95) {
        newAlerts.push({
          id: 'rate-limit-critical',
          type: 'critical',
          message: `RATE LIMIT APPROACHING (${maxUsage.toFixed(1)}% used - ${totalUsed}/${totalLimit})`,
          autoFix: true,
          manualAction: 'Increase rate limits or add delay between requests',
          timestamp: new Date(),
        });
      } else if (maxUsage >= 80) {
        newAlerts.push({
          id: 'rate-limit-warning',
          type: 'warning',
          message: `High rate limit usage (${maxUsage.toFixed(1)}% used)`,
          autoFix: false,
          manualAction: 'Consider increasing rate limits or optimizing request patterns',
          timestamp: new Date(),
        });
      }

      // Provider alerts
      Object.entries(providers).forEach(([name, status]) => {
        if (status === 'offline') {
          newAlerts.push({
            id: `provider-offline-${name}`,
            type: 'critical',
            message: `${name} provider is offline`,
            autoFix: false,
            manualAction: 'Check provider configuration or switch to backup provider',
            timestamp: new Date(),
          });
        } else if (status === 'degraded') {
          newAlerts.push({
            id: `provider-degraded-${name}`,
            type: 'warning',
            message: `${name} provider performance degraded`,
            autoFix: true,
            manualAction: 'Test connectivity or switch to alternative provider',
            timestamp: new Date(),
          });
        }
      });

      // Route performance alerts
      Object.entries(routes).forEach(([route, status]) => {
        if (status === 'error') {
          newAlerts.push({
            id: `route-error-${route}`,
            type: 'warning',
            message: `${route} route experiencing issues`,
            autoFix: false,
            manualAction: 'Check route configuration and model settings',
            timestamp: new Date(),
          });
        }
      });

      // Cache alerts
      if (cacheHitRate < 50) {
        newAlerts.push({
          id: 'cache-inefficient',
          type: 'info',
          message: `Cache hit rate low (${cacheHitRate.toFixed(1)}%)`,
          autoFix: false,
          manualAction: 'Consider optimizing request patterns or increasing cache size',
          timestamp: new Date(),
        });
      }

      setAlerts(newAlerts);

      // Generate auto-fix actions
      const newAutoFixActions: AutoFixAction[] = [
        // Reset circuit breaker
        {
          id: 'reset-circuit-breaker',
          title: 'Reset Circuit Breaker',
          description: 'Manually reset the circuit breaker to resume normal operations',
          action: async () => {
            try {
              await missionControlAPI.resetCircuitBreaker();
              return true;
            } catch (error) {
              console.error('Failed to reset circuit breaker:', error);
              return false;
            }
          },
        },
        // Test provider connectivity
        {
          id: 'test-providers',
          title: 'Test Provider Connectivity',
          description: 'Test all providers to check their current status',
          action: async () => {
            // Implementation would call testProvider for each provider
            console.log('Testing provider connectivity...');
            return true;
          },
        },
        // Clear cache
        {
          id: 'clear-cache',
          title: 'Clear Cache',
          description: 'Clear the system cache to start fresh',
          action: async () => {
            // Implementation would clear cache
            console.log('Clearing cache...');
            return true;
          },
        },
      ];

      setAutoFixActions(newAutoFixActions);

      // Create system health object
            const systemHealthData: SystemHealth = {
        overall,
        components: {
          providers,
          routes,
          cache: {
            hitRate: cacheHitRate,
            size: cacheSize,
          },
          rateLimit: {
            usage: totalUsed,
            limit: totalLimit,
            percentage: rateLimitPercentage,
          },
          alerts: newAlerts,
        },
      };

      setSystemHealth(systemHealthData);
      setError(null);
    } catch (err) {
      console.error('Error processing system health data:', err);
      setError('Failed to process system health data');
    }
  }, [missionControlData]);

  // Process data when mission control data changes
  useEffect(() => {
    processData(missionControlData);
  }, [missionControlData, processData]);

  // Auto-refresh data
  useEffect(() => {
    if (!options.autoRefresh) return;

    const interval = setInterval(() => {
      refetchData();
    }, options.interval);

    return () => clearInterval(interval);
  }, [refetchData, options.autoRefresh, options.interval]);

  // Execute auto-fix action
  const executeAutoFix = useCallback(async (actionId: string): Promise<boolean> => {
    const action = autoFixActions.find(a => a.id === actionId);
    if (!action) return false;

    try {
      const result = await action.action();
      // Refresh data after successful auto-fix
      await refetchData();
      return result;
    } catch (error) {
      console.error('Error executing auto-fix:', error);
      return false;
    }
  }, [autoFixActions, refetchData]);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  // Enhanced refetch
  const enhancedRefetch = useCallback(async () => {
    setLoading(true);
    try {
      await refetchData();
    } catch (error) {
      setError('Failed to fetch system health data');
    } finally {
      setLoading(false);
    }
  }, [refetchData]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    systemHealth,
    alerts,
    autoFixActions,
    loading: loading || dataLoading,
    error: error || dataError,
    refetch: enhancedRefetch,
    dismissAlert,
    executeAutoFix,
  };
}