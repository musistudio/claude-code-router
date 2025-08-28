import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { 
  MissionControlData, 
  ExecutionStats, 
  AggregatedData, 
  HistoricalDataPoint,
  SystemPreset,
  HealthHistoryData
} from '@/types/missionControl';

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
const MissionControlContext = createContext<{
  state: MissionControlState;
  dispatch: React.Dispatch<MissionControlAction>;
} | null>(null);

// Provider
interface MissionControlProviderProps {
  children: ReactNode;
}

export function MissionControlProvider({ children }: MissionControlProviderProps) {
  const [state, dispatch] = useReducer(missionControlReducer, initialState);

  return (
    <MissionControlContext.Provider value={{ state, dispatch }}>
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

  const { state, dispatch } = context;

  return {
    ...state,
    setData: (data: MissionControlData) => dispatch({ type: 'SET_DATA', payload: data }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    updateTimestamp: () => dispatch({ type: 'UPDATE_TIMESTAMP' }),
    reset: () => dispatch({ type: 'RESET' }),
  };
}

// Selector hooks for performance optimization
export function useExecutionStats(): ExecutionStats | null {
  const { data } = useMissionControl();
  return data?.live || null;
}

export function useAggregatedData(): AggregatedData | null {
  const { data } = useMissionControl();
  return data?.aggregated || null;
}

export function useHistoricalData(): HistoricalDataPoint[] {
  const { data } = useMissionControl();
  return data?.historical || [];
}

export function useMissionControlData() {
  const { data, loading, error } = useMissionControl();
  return {
    data,
    isLoading: loading,
    error,
    live: data?.live,
    historical: data?.historical || [],
    historicalProviders: data?.historicalProviders || [],
    aggregated: data?.aggregated
  };
}

export function useConfig() {
  const { data } = useMissionControl();
  return data?.config || null;
}