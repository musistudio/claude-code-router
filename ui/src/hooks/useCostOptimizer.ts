import { useState, useEffect, useCallback, useRef } from 'react';
import type { CostOptimization, OptimizationRecommendation } from '@/types/dashboard';
import { missionControlAPI } from '@/lib/missionControlAPI';

interface UseCostOptimizerOptions {
  interval?: number; // milliseconds for polling
  initialLoad?: boolean;
  retryCount?: number;
}

interface UseCostOptimizerReturn {
  costData: CostOptimization | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdated: number | null;
  applyRecommendation: (id: string) => Promise<boolean>;
  dismissRecommendation: (id: string) => Promise<boolean>;
}

const DEFAULT_OPTIONS: Required<UseCostOptimizerOptions> = {
  interval: 30000, // 30 seconds for polling
  initialLoad: true,
  retryCount: 3,
};

export function useCostOptimizer(
  options: UseCostOptimizerOptions = DEFAULT_OPTIONS
): UseCostOptimizerReturn {
  const [costData, setCostData] = useState<CostOptimization | null>(null);
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
      // Fetch real data from the API
      const response = await fetch('/api/analytics/costs');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch cost analytics data');
      }
      
      const costData = result.data;
      
      // Defensive programming: validate API response structure
      if (!costData || !costData.summary || typeof costData.summary.totalCost === 'undefined') {
        throw new Error('Invalid cost data structure from API');
      }
      
      // Transform the API data into the format expected by the CostOptimization interface
      const totalCost = parseFloat(costData.summary.totalCost) || 0;
      const transformedData: CostOptimization = {
        totalSavings: totalCost * 0.2, // Estimate 20% savings
        currentMonthlyCost: totalCost,
        projectedMonthlyCost: totalCost * 0.8, // Estimate 20% reduction
        recommendations: [
          {
            id: 'rec-1',
            title: 'Activează cache-ul pentru request-uri repetitive',
            description: 'Activarea cache-ului poate reduce costurile cu până la 30% pentru request-urile repetitive.',
            savings: parseFloat(costData.summary.totalCost) * 0.15, // 15% of total cost
            action: 'auto-apply' as const,
            status: 'pending' as const
          },
          {
            id: 'rec-2',
            title: 'Schimbă la model mai ieftin pentru sarcini simple',
            description: 'Pentru sarcini simple, folosește modele mai ieftine precum GPT-3.5 în loc de GPT-4.',
            savings: parseFloat(costData.summary.totalCost) * 0.10, // 10% of total cost
            action: 'settings-change' as const,
            status: 'pending' as const
          },
          {
            id: 'rec-3',
            title: 'Rate limiting pentru utilizatori intensivi',
            description: 'Implementează rate limiting pentru utilizatorii care consumă resurse excesive.',
            savings: parseFloat(costData.summary.totalCost) * 0.05, // 5% of total cost
            action: 'manual' as const,
            status: 'pending' as const
          }
        ]
      };
      
      if (!isMountedRef.current) return;

      setCostData(transformedData);
      setLastUpdated(Date.now());

    } catch (err: any) {
      if (!isMountedRef.current) return;

      console.error('Error fetching cost optimization data:', err);
      
      if (retryCountRef.current < retryCount) {
        retryCountRef.current++;
        console.log(`Retrying... (${retryCountRef.current}/${retryCount})`);
        setTimeout(() => fetchData(true, false), 1000 * retryCountRef.current);
      } else {
        setError(err.message || 'Failed to fetch cost optimization data');
        setCostData(null);
      }
    } finally {
      if (isMountedRef.current && (isInitial || isRetry)) {
        setLoading(false);
      }
    }
  }, [retryCount]);

  const refetch = useCallback(() => {
    return fetchData(false, true); // Manual refetch should show loading
  }, [fetchData]);

  const applyRecommendation = useCallback(async (id: string): Promise<boolean> => {
    try {
      // In a real implementation, this would make an API call
      // For now, we'll just update the local state
      setCostData(prev => {
        if (!prev) return prev;
        
        const updatedRecommendations = Array.isArray(prev.recommendations) 
          ? prev.recommendations.map(rec => 
              rec.id === id ? { ...rec, status: 'applied' as const } : rec
            )
          : [];
        
        // Calculate new savings
        const appliedSavings = updatedRecommendations
          .filter(rec => rec.status === 'applied')
          .reduce((sum, rec) => sum + rec.savings, 0);
          
        return {
          ...prev,
          totalSavings: appliedSavings,
          recommendations: updatedRecommendations
        };
      });
      
      return true;
    } catch (error) {
      console.error('Error applying recommendation:', error);
      return false;
    }
  }, []);

  const dismissRecommendation = useCallback(async (id: string): Promise<boolean> => {
    try {
      // In a real implementation, this would make an API call
      // For now, we'll just update the local state
      setCostData(prev => {
        if (!prev) return prev;
        
        const updatedRecommendations = Array.isArray(prev.recommendations)
          ? prev.recommendations.map(rec => 
              rec.id === id ? { ...rec, status: 'dismissed' as const } : rec
            )
          : [];
        
        return {
          ...prev,
          recommendations: updatedRecommendations
        };
      });
      
      return true;
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    retryCountRef.current = 0;
    
    if (initialLoad) {
      fetchData(false, true);
    }
    
    let intervalId: NodeJS.Timeout | null = null;
    if (interval > 0) {
      intervalId = setInterval(() => {
        if (isMountedRef.current) {
          fetchData();
        }
      }, interval);
    }
    
    return () => {
      isMountedRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchData, initialLoad, interval]);

  return {
    costData,
    loading,
    error,
    refetch,
    lastUpdated,
    applyRecommendation,
    dismissRecommendation
  };
}