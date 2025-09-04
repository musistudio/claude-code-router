import React, { createContext, useContext, useMemo } from 'react';
import { useApiPolling } from '@/hooks/useApiPolling';
import type { Provider } from '@/types/dashboard';

// Define the context shape
interface ProviderManagerContextType {
  providers: Provider[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  lastUpdated: number | null;
}

// Create the context with default values
const ProviderManagerContext = createContext<ProviderManagerContextType>({
  providers: null,
  loading: false,
  error: null,
  refetch: () => {},
  lastUpdated: null,
});

// Custom hook to use the provider manager context
export const useProviderManager = () => {
  const context = useContext(ProviderManagerContext);
  if (!context) {
    throw new Error('useProviderManager must be used within a ProviderManagerProvider');
  }
  return context;
};

// Provider component that fetches and provides provider data
export const ProviderManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use the generic polling hook to fetch provider data
  const { data: providers, loading, error, refetch, lastUpdated } = useApiPolling<Provider[]>({
    endpoint: '/api/v1/providers/health-check',
    interval: 10000, // 10 seconds
    initialLoad: true,
    retryCount: 3,
  });

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    providers,
    loading,
    error,
    refetch,
    lastUpdated,
  }), [providers, loading, error, refetch, lastUpdated]);

  return (
    <ProviderManagerContext.Provider value={contextValue}>
      {children}
    </ProviderManagerContext.Provider>
  );
};