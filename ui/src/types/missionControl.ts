// Types for Mission Control v2
export interface ProviderStats {
  failureCount: number;
  inRecovery: boolean;
  [key: string]: any; // Permite alte proprietăți care ar putea exista
}

export interface ExecutionStats {
  deduplication: {
    totalCachedRequests: number;
    totalDuplicateRequestsBlocked: number;
    cacheHitRate: number;
    memoryUsage: number;
  };
  rateLimiting: {
    circuitBreakerState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
    totalRequestsTracked: number;
    rulesUsage: Record<string, any>;
  };
  queue: {
    currentSize: number;
    totalProcessed: number;
    averageWaitTime: number;
    processing: boolean;
  };
  retry: {
    totalRetries: number;
    successAfterRetry: number;
    finalFailures: number;
  };
  providers: Record<string, ProviderStats>;
}

export interface ModelStat {
  model: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  totalTokens: number;
  totalCost: number;
  lastUsed: number;
  errorRate: number;
  popularityScore: number;
}

export interface AggregatedData {
  modelStats: ModelStat[];
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
}

export interface HistoricalDataPoint {
  timestamp: number;
  time: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  errors: number;
}

export interface HealthHistoryData {
  provider: string;
  timestamp: string;
  successRate: number;
  avgResponseTime: number;
  errorCount: number;
  errorRate?: number;
  totalRequests?: number;
  hourlyStats?: any[];
}

export interface MissionControlConfig {
  routes: Record<string, string> | string[];
  executionGuard: {
    enabled: boolean;
    presets: {
      economy: { 
        minDelayMs: number;
        initialBackoffMs: number;
        maxQueueSize: number;
        maxRetries: number;
      };
      balanced: { 
        minDelayMs: number;
        initialBackoffMs: number;
        maxQueueSize: number;
        maxRetries: number;
      };
      highThroughput: { 
        minDelayMs: number;
        initialBackoffMs: number;
        maxQueueSize: number;
        maxRetries: number;
      };
    };
    current: {
      minDelayMs: number;
      initialBackoffMs: number;
      maxQueueSize: number;
      maxRetries: number;
      active: boolean;
    };
  };
}

export interface RawMissionControlData {
  live?: Partial<ExecutionStats>;
  aggregated?: Partial<AggregatedData>;
  historical?: HistoricalDataPoint[];
  config?: Partial<MissionControlConfig>;
  timestamp?: string;
  historicalProviders?: HealthHistoryData[];
}

export interface MissionControlData {
  live: ExecutionStats;
  aggregated: AggregatedData;
  historical: HistoricalDataPoint[];
  config: MissionControlConfig;
  timestamp: string;
  historicalProviders?: HealthHistoryData[]; // Added historicalProviders property
}

export type SystemPreset = 'economy' | 'balanced' | 'high-throughput';