import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { 
  MissionControlData, 
  ExecutionStats, 
  AggregatedData, 
  HistoricalDataPoint,
  SystemPreset,
  HealthHistoryData
} from '@plugins/analytics/ui/types/missionControl';
import { useMissionControlData, type UseMissionControlDataReturn } from '@plugins/analytics/ui/hooks/useMissionControlData';

// Types for state
interface MissionControlState {
  data: MissionControlData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

type MissionControlAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DATA'; payload: MissionControlData }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_TIMESTAMP' }
  | { type: 'RESET' };

// Initial state
const initialState: MissionControlState = {
  data: null,
  loading: false,
  error: null,
  lastUpdated: null,
};

// Reducer
function missionControlReducer(
  state: MissionControlState,
  action: MissionControlAction
): MissionControlState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'SET_DATA':
      return { 
        ...state, 
        data: action.payload, 
        error: null, 
        lastUpdated: Date.now() 
      };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    
    case 'UPDATE_TIMESTAMP':
      return { ...state, lastUpdated: Date.now() };
    
    case 'RESET':
      return initialState;
    
    default:
      return state;
  }
}

// Context
const MissionControlContext = createContext<UseMissionControlDataReturn | null>(null);

// Provider
interface MissionControlProviderProps {
  children: ReactNode;
}

export function MissionControlProvider({ children }: MissionControlProviderProps) {
  const missionControlData = useMissionControlData();

  return (
    <MissionControlContext.Provider value={missionControlData}>
      {children}
    </MissionControlContext.Provider>
  );
}

// Hook
export function useMissionControl() {
  const context = useContext(MissionControlContext);
  
  if (!context) {
    throw new Error('useMissionControl must be used within MissionControlProvider');
  }

  return context;
}

// Selector hooks for performance optimization
export function useExecutionStats(): ExecutionStats | null {
  const context = useMissionControl();
  return context.data?.live || null;
}

export function useAggregatedData(): AggregatedData | null {
  const context = useMissionControl();
  return context.data?.aggregated || null;
}

export function useHistoricalData(): HistoricalDataPoint[] {
  const context = useMissionControl();
  return context.data?.historical || [];
}

export function useMissionControlState() {
  const context = useMissionControl();
  return {
    data: context.data,
    isLoading: context.loading,
    error: context.error,
    live: context.data?.live,
    historical: context.data?.historical || [],
    historicalProviders: context.data?.historicalProviders || [],
    aggregated: context.data?.aggregated
  };
}

export function useConfig() {
  const context = useMissionControl();
  return context.data?.config || null;
}