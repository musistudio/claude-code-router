import { useApiPolling } from './useApiPolling';
import { useProviderManager } from '@/contexts/ProviderManagerContext';
import type { PerformanceAlert } from '@/types/dashboard';

interface UsePerformanceAlertsReturn {
  alerts: PerformanceAlert[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  resolveAlert: (id: string) => Promise<void>;
  resolveAllAlerts: () => Promise<void>;
  autoResolveAlert: (id: string) => Promise<void>;
}

export function usePerformanceAlerts(): UsePerformanceAlertsReturn {
  // Get provider data from the context
  const { providers, loading: providersLoading, error: providersError } = useProviderManager();
  
  // Use the generic polling hook to fetch performance alerts
  const { 
    data: alertsData, 
    loading: alertsLoading, 
    error: alertsError, 
    refetch 
  } = useApiPolling<PerformanceAlert[]>({
    endpoint: '/api/v1/mission-control/threat-matrix',
    interval: 10000, // 10 seconds
    initialLoad: true,
    retryCount: 3,
  });

  // Combine loading states
  const loading = providersLoading || alertsLoading;
  
  // Combine error states
  const error = providersError || alertsError;

  // In a real implementation, we would process the alerts based on providers
  // For now, we'll just return the alerts data as is
  const alerts = alertsData || [];

  return {
    alerts,
    loading,
    error,
    refresh: refetch,
    resolveAlert: async (id: string) => {
      try {
        const response = await fetch('/api/v1/mission-control/resolve-alert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Refresh the data after resolving alert
        refetch();
      } catch (err) {
        console.error('Error resolving alert:', err);
        throw err;
      }
    },
    resolveAllAlerts: async () => {
      try {
        const response = await fetch('/api/v1/mission-control/resolve-alert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ resolveAll: true }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Refresh the data after resolving all alerts
        refetch();
      } catch (err) {
        console.error('Error resolving all alerts:', err);
        throw err;
      }
    },
    autoResolveAlert: async (id: string) => {
      try {
        const response = await fetch('/api/v1/mission-control/resolve-alert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, autoResolve: true }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Refresh the data after auto-resolving alert
        refetch();
      } catch (err) {
        console.error('Error auto-resolving alert:', err);
        throw err;
      }
    }
  };
}