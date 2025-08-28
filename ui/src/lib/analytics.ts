import api from './api';

export interface RealtimeStats {
  current: {
    activeRequests: number;
    avgResponseTime: number;
    errorRate: number;
  };
  last1h: {
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
    topModels: Array<{ model: string; count: number }>;
  };
  last24h: {
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
    topModels: Array<{ model: string; count: number }>;
  };
}

export interface ModelStats {
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

export interface RequestLog {
  id: string;
  timestamp: number;
  model: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  userAgent?: string;
  ipAddress?: string;
  error?: string;
  timeAgo: string;
}

export interface TimeSeriesData {
  timestamp: number;
  time: string;
  requests: number;
  successRate: number;
  avgResponseTime: number;
  errors: number;
}

export interface ModelComparison {
  name: string;
  provider: string;
  requests: number;
  successRate: string;
  avgResponseTime: number;
  totalTokens: number;
  totalCost: string;
  lastUsed: number;
  popularity: number;
  errorRate: string;
}

export interface CostAnalytics {
  breakdown: Array<{
    model: string;
    provider: string;
    totalCost: number;
    costPerRequest: number;
    totalTokens: number;
    costPerToken: number;
  }>;
  summary: {
    totalCost: string;
    totalTokens: number;
    totalRequests: number;
    avgCostPerRequest: string;
    avgCostPerToken: string;
  };
}

class AnalyticsAPI {
  // Get real-time statistics
  async getRealtimeStats(): Promise<RealtimeStats> {
    const response = await fetch('/api/analytics/realtime');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch realtime stats');
    }
    
    return result.data;
  }

  // Get model statistics
  async getModelStats(): Promise<ModelStats[]> {
    const response = await fetch('/api/analytics/models');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch model stats');
    }
    
    return result.data;
  }

  // Get recent requests
  async getRecentRequests(limit: number = 50): Promise<RequestLog[]> {
    const response = await fetch(`/api/analytics/requests?limit=${limit}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch recent requests');
    }
    
    return result.data;
  }

  // Get time-series data for charts
  async getTimeSeriesData(hours: number = 24): Promise<TimeSeriesData[]> {
    const response = await fetch(`/api/analytics/timeseries?hours=${hours}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch time series data');
    }
    
    return result.data;
  }

  // Get model comparison data
  async getModelComparison(): Promise<ModelComparison[]> {
    const response = await fetch('/api/analytics/comparison');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch comparison data');
    }
    
    return result.data;
  }

  // Get top performing models
  async getTopModels(metric: string = 'requests', limit: number = 10): Promise<Array<{
    model: string;
    provider: string;
    value: number;
    totalRequests: number;
    lastUsed: number;
  }>> {
    const response = await fetch(`/api/analytics/top-models?metric=${metric}&limit=${limit}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch top models');
    }
    
    return result.data;
  }

  // Get cost analytics
  async getCostAnalytics(): Promise<CostAnalytics> {
    const response = await fetch('/api/analytics/costs');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch cost analytics');
    }
    
    return result.data;
  }

  // Get usage analytics by period
  async getUsageAnalytics(period: 'hour' | 'day' | 'week' | 'month'): Promise<TimeSeriesData[]> {
    const response = await fetch(`/api/analytics/usage/${period}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch usage analytics');
    }
    
    return result.data;
  }

  // Helper to format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount);
  }

  // Helper to format numbers
  formatNumber(num: number): string {
    if (num >= 1e6) {
      return (num / 1e6).toFixed(1) + 'M';
    } else if (num >= 1e3) {
      return (num / 1e3).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Helper to format response time
  formatResponseTime(ms: number): string {
    if (ms >= 1000) {
      return (ms / 1000).toFixed(1) + 's';
    }
    return ms.toFixed(0) + 'ms';
  }

  // Helper to format time ago
  formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  // Real-time data subscription (using polling for now)
  subscribeToRealtimeStats(callback: (stats: RealtimeStats) => void, interval: number = 5000): () => void {
    const intervalId = setInterval(async () => {
      try {
        const stats = await this.getRealtimeStats();
        callback(stats);
      } catch (error) {
        console.error('Failed to fetch realtime stats:', error);
      }
    }, interval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Export singleton instance
export const analyticsAPI = new AnalyticsAPI();
