import apiClient from './api';

export interface CircuitBreakerResetResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

export interface ExecutionGuardUpdateResponse {
  success: boolean;
  message: string;
  timestamp: string;
  newConfig: any;
}

export interface RouteConfigUpdateResponse {
  success: boolean;
  message: string;
  timestamp: string;
  oldRoute: string;
  newModel: string;
}

export interface ProviderTestResponse {
  success: boolean;
  message: string;
  status: 'online' | 'offline' | 'unknown';
  responseTime?: number;
  timestamp: string;
}

export interface ProviderHealthResponse {
  success: boolean;
  data: ProviderHealthStatus[];
  timestamp: string;
}

export interface HealthHistoryResponse {
  success: boolean;
  data: HealthHistoryData[];
  timestamp: string;
}

export interface ProviderHealthStatus {
  id: string;
  name: string;
  provider: string;
  status: 'online' | 'offline' | 'degraded';
  healthScore: number;
  avgResponseTime: number;
  errorRate: number;
  totalRequests: number;
  lastCheck: string;
  features: string[];
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

/**
 * Mission Control API Client
 * Provides specialized API methods for the Mission Control dashboard
 */
class MissionControlAPI {
  private baseUrl: string = '/api';

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  /**
   * Get provider health status
   */
  async getProviderHealth(): Promise<ProviderHealthResponse> {
    return apiClient.get<ProviderHealthResponse>('/v1/mission-control/provider-health');
  }

  /**
   * Get provider health history
   */
  async getProviderHealthHistory(): Promise<HealthHistoryResponse> {
    return apiClient.get<HealthHistoryResponse>('/v1/mission-control/provider-health-history');
  }

  /**
   * Reset the circuit breaker manually
   */
  async resetCircuitBreaker(): Promise<CircuitBreakerResetResponse> {
    return apiClient.post<CircuitBreakerResetResponse>('/v1/mission-control/reset-circuit-breaker');
  }

  /**
   * Update ExecutionGuard configuration with preset
   */
  async updateExecutionGuardPreset(
    preset: 'economy' | 'balanced' | 'high-throughput'
  ): Promise<ExecutionGuardUpdateResponse> {
    return apiClient.post<ExecutionGuardUpdateResponse>('/v1/mission-control/update-execution-guard', {
      action: 'update-preset',
      preset,
    });
  }

  /**
   * Update ExecutionGuard with custom configuration
   */
  async updateExecutionGuardCustom(
    config: Partial<{
      minDelayMs: number;
      initialBackoffMs: number;
      maxQueueSize: number;
      maxRetries: number;
    }>
  ): Promise<ExecutionGuardUpdateResponse> {
    return apiClient.post<ExecutionGuardUpdateResponse>('/v1/mission-control/update-execution-guard', {
      action: 'update-custom',
      config,
    });
  }

  /**
   * Update route configuration (model assignment)
   */
  async updateRouteConfig(
    routeName: string, 
    newModel: string
  ): Promise<RouteConfigUpdateResponse> {
    return apiClient.post<RouteConfigUpdateResponse>('/v1/mission-control/update-route', {
      routeName,
      newModel,
    });
  }

  /**
   * Test a provider connectivity
   */
  async testProvider(provider: string): Promise<ProviderTestResponse> {
    return apiClient.post<ProviderTestResponse>('/v1/mission-control/test-provider', {
      provider,
      testAction: 'ping',
    });
  }

  /**
   * Get aggregated analytics data
   */
  async getAggregatedData(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/aggregated-data');
  }

  /**
   * Get live activity feed
   */
  async getLiveActivity(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/live-activity');
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/system-health');
  }

  /**
   * Get threat matrix data
   */
  async getThreatMatrix(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/threat-matrix');
  }

  /**
   * Get route efficiency data
   */
  async getRouteEfficiency(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/route-efficiency');
  }

  /**
   * Get model performance leaderboard
   */
  async getModelPerformance(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/model-performance');
  }

  /**
   * Get historical performance data
   */
  async getHistoricalPerformance(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/historical-performance');
  }

  /**
   * Get ALL mission control data in a single unified endpoint
   */
  async getMissionControlStats(): Promise<any> {
    return apiClient.get<any>('/v1/mission-control/stats');
  }

  /**
   * Emergency stop all operations
   */
  async emergencyStop(): Promise<{ success: boolean; message: string }> {
    return apiClient.post<{ success: boolean; message: string }>('/v1/mission-control/emergency-stop');
  }

  /**
   * Resume operations after emergency stop
   */
  async resumeOperations(): Promise<{ success: boolean; message: string }> {
    return apiClient.post<{ success: boolean; message: string }>('/v1/mission-control/resume');
  }
}

// Export singleton instance
export const missionControlAPI = new MissionControlAPI();

// Export class for custom instances if needed
export { MissionControlAPI };