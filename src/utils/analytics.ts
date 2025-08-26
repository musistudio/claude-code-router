import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface RequestMetrics {
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
}

interface ModelStats {
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

interface DailyStats {
  date: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgResponseTime: number;
  errorRate: number;
  modelBreakdown: Record<string, number>;
}

class AnalyticsManager {
  private dataDir: string;
  private metricsFile: string;
  private statsFile: string;
  private dailyStatsFile: string;
  private cache: {
    metrics: RequestMetrics[];
    modelStats: Record<string, ModelStats>;
    dailyStats: Record<string, DailyStats>;
  };
  private pendingBatch: RequestMetrics[];
  private batchSize: number;
  private saveFrequency: number;
  private lastSave: number;
  private analyticsEnabled: boolean;

  constructor(config?: any) {
    this.dataDir = join(homedir(), '.claude-code-router', 'analytics');
    this.metricsFile = join(this.dataDir, 'metrics.json');
    this.statsFile = join(this.dataDir, 'model-stats.json');
    this.dailyStatsFile = join(this.dataDir, 'daily-stats.json');
    
    // Initialize optimization settings from config
    const optimization = config?.optimization || {};
    this.analyticsEnabled = optimization.analyticsEnabled !== false;
    this.batchSize = optimization.batchSize || 10;
    this.saveFrequency = optimization.saveFrequency || 5000; // 5 seconds
    this.lastSave = Date.now();
    this.pendingBatch = [];
    
    // Ensure directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Initialize cache with empty data structure
    this.cache = {
      metrics: [],
      modelStats: {},
      dailyStats: {}
    };

    // Load existing data if available (safe loading with validation)
    if (this.analyticsEnabled) {
      this.loadData();
    }
  }

  // Method to clear all analytics data
  clearAllData() {
    this.cache = {
      metrics: [],
      modelStats: {},
      dailyStats: {}
    };
    this.saveData();
  }

  private loadData() {
    try {
      // Load metrics (keep only last 1000 entries for performance)
      if (existsSync(this.metricsFile)) {
        const rawData = readFileSync(this.metricsFile, 'utf8');
        if (rawData.trim()) {
          const metrics = JSON.parse(rawData);
          if (Array.isArray(metrics)) {
            this.cache.metrics = metrics.slice(-1000);
            console.log(`Loaded ${this.cache.metrics.length} analytics metrics`);
          }
        }
      }

      // Load model stats
      if (existsSync(this.statsFile)) {
        const rawData = readFileSync(this.statsFile, 'utf8');
        if (rawData.trim()) {
          const stats = JSON.parse(rawData);
          if (typeof stats === 'object' && stats !== null) {
            this.cache.modelStats = stats;
            console.log(`Loaded stats for ${Object.keys(stats).length} models`);
          }
        }
      }

      // Load daily stats
      if (existsSync(this.dailyStatsFile)) {
        const rawData = readFileSync(this.dailyStatsFile, 'utf8');
        if (rawData.trim()) {
          const dailyStats = JSON.parse(rawData);
          if (typeof dailyStats === 'object' && dailyStats !== null) {
            this.cache.dailyStats = dailyStats;
            console.log(`Loaded daily stats for ${Object.keys(dailyStats).length} days`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
      // Keep cache in safe empty state if loading fails
      this.cache = {
        metrics: [],
        modelStats: {},
        dailyStats: {}
      };
    }
  }

  private saveData() {
    try {
      writeFileSync(this.metricsFile, JSON.stringify(this.cache.metrics, null, 2));
      writeFileSync(this.statsFile, JSON.stringify(this.cache.modelStats, null, 2));
      writeFileSync(this.dailyStatsFile, JSON.stringify(this.cache.dailyStats, null, 2));
    } catch (error) {
      console.error('Error saving analytics data:', error);
    }
  }

  // Track a new request with batching optimization
  trackRequest(request: Omit<RequestMetrics, 'id' | 'timestamp'>) {
    // Skip tracking if analytics disabled
    if (!this.analyticsEnabled) {
      return;
    }
    
    // Only track requests to AI model endpoints (v1 API)
    if (!request.endpoint.startsWith('/v1/')) {
      return; // Skip tracking non-AI requests
    }

    const metric: RequestMetrics = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...request
    };

    // Add to pending batch instead of immediate processing
    this.pendingBatch.push(metric);
    
    // Process batch if size reached or enough time passed
    const shouldFlush = this.pendingBatch.length >= this.batchSize || 
                        (Date.now() - this.lastSave) >= this.saveFrequency;
    
    if (shouldFlush) {
      this.flushBatch();
    }

    return metric.id;
  }
  
  // Flush pending batch to cache and storage
  private flushBatch() {
    if (this.pendingBatch.length === 0) {
      return;
    }
    
    // Process all pending metrics
    this.pendingBatch.forEach(metric => {
      this.cache.metrics.push(metric);
      this.updateModelStats(metric);
      this.updateDailyStats(metric);
    });
    
    // Keep only last 1000 metrics in memory
    if (this.cache.metrics.length > 1000) {
      this.cache.metrics = this.cache.metrics.slice(-1000);
    }
    
    // Clear batch and save
    this.pendingBatch = [];
    this.lastSave = Date.now();
    this.saveData();
  }

  private updateModelStats(metric: RequestMetrics) {
    const key = `${metric.provider}_${metric.model}`;
    
    if (!this.cache.modelStats[key]) {
      this.cache.modelStats[key] = {
        model: metric.model,
        provider: metric.provider,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        totalTokens: 0,
        totalCost: 0,
        lastUsed: 0,
        errorRate: 0,
        popularityScore: 0
      };
    }

    const stats = this.cache.modelStats[key];
    stats.totalRequests++;
    stats.lastUsed = metric.timestamp;

    if (metric.statusCode >= 200 && metric.statusCode < 300) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    // Update average response time
    stats.avgResponseTime = ((stats.avgResponseTime * (stats.totalRequests - 1)) + metric.responseTime) / stats.totalRequests;
    
    // Update token count
    if (metric.tokenCount) {
      stats.totalTokens += metric.tokenCount;
    }

    // Update cost
    if (metric.cost) {
      stats.totalCost += metric.cost;
    }

    // Calculate error rate
    stats.errorRate = (stats.failedRequests / stats.totalRequests) * 100;

    // Calculate popularity score (requests in last 24h)
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const recent = this.cache.metrics.filter(m => 
      m.timestamp > last24h && `${m.provider}_${m.model}` === key
    ).length;
    stats.popularityScore = recent;
  }

  private updateDailyStats(metric: RequestMetrics) {
    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    
    if (!this.cache.dailyStats[date]) {
      this.cache.dailyStats[date] = {
        date,
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0,
        modelBreakdown: {}
      };
    }

    const stats = this.cache.dailyStats[date];
    stats.totalRequests++;

    if (metric.tokenCount) {
      stats.totalTokens += metric.tokenCount;
    }

    if (metric.cost) {
      stats.totalCost += metric.cost;
    }

    // Update average response time
    stats.avgResponseTime = ((stats.avgResponseTime * (stats.totalRequests - 1)) + metric.responseTime) / stats.totalRequests;

    // Update model breakdown
    const modelKey = `${metric.provider}_${metric.model}`;
    stats.modelBreakdown[modelKey] = (stats.modelBreakdown[modelKey] || 0) + 1;

    // Calculate error rate for the day
    const todayMetrics = this.cache.metrics.filter(m => 
      new Date(m.timestamp).toISOString().split('T')[0] === date
    );
    const errors = todayMetrics.filter(m => m.statusCode >= 400).length;
    stats.errorRate = (errors / todayMetrics.length) * 100;
  }

  // Get real-time statistics
  getRealtimeStats() {
    const last5min = Date.now() - (5 * 60 * 1000);
    const last1h = Date.now() - (60 * 60 * 1000);
    const last24h = Date.now() - (24 * 60 * 60 * 1000);

    const metrics5min = this.cache.metrics.filter(m => m.timestamp > last5min);
    const metrics1h = this.cache.metrics.filter(m => m.timestamp > last1h);
    const metrics24h = this.cache.metrics.filter(m => m.timestamp > last24h);

    return {
      current: {
        activeRequests: metrics5min.length,
        avgResponseTime: this.calculateAvgResponseTime(metrics5min),
        errorRate: this.calculateErrorRate(metrics5min)
      },
      last1h: {
        totalRequests: metrics1h.length,
        avgResponseTime: this.calculateAvgResponseTime(metrics1h),
        errorRate: this.calculateErrorRate(metrics1h),
        topModels: this.getTopModels(metrics1h, 3)
      },
      last24h: {
        totalRequests: metrics24h.length,
        avgResponseTime: this.calculateAvgResponseTime(metrics24h),
        errorRate: this.calculateErrorRate(metrics24h),
        topModels: this.getTopModels(metrics24h, 5)
      }
    };
  }

  // Get model statistics
  getModelStats() {
    return Object.values(this.cache.modelStats)
      .sort((a, b) => b.popularityScore - a.popularityScore);
  }

  // Get recent requests
  getRecentRequests(limit: number = 50) {
    return this.cache.metrics
      .slice(-limit)
      .reverse()
      .map(m => ({
        ...m,
        timeAgo: this.formatTimeAgo(m.timestamp)
      }));
  }

  // Get time-series data for charts
  getTimeSeriesData(hours: number = 24) {
    // Safeguard against invalid or empty metrics cache
    if (!this.cache.metrics || !Array.isArray(this.cache.metrics) || this.cache.metrics.length === 0) {
      console.warn('Analytics metrics cache is empty or invalid. Returning empty time series data.');
      return [];
    }
    const now = Date.now();
    const start = now - (hours * 60 * 60 * 1000);
    const interval = hours <= 1 ? 5 * 60 * 1000 : hours <= 6 ? 15 * 60 * 1000 : 60 * 60 * 1000; // 5min, 15min, or 1h intervals
    
    const data = [];
    for (let time = start; time <= now; time += interval) {
      const windowStart = time;
      const windowEnd = time + interval;
      const windowMetrics = this.cache.metrics.filter(m => 
        m.timestamp >= windowStart && m.timestamp < windowEnd
      );

      data.push({
        timestamp: time,
        time: new Date(time).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        requests: windowMetrics.length,
        successRate: this.calculateSuccessRate(windowMetrics),
        avgResponseTime: this.calculateAvgResponseTime(windowMetrics),
        errors: windowMetrics.filter(m => m.statusCode >= 400).length
      });
    }

    return data;
  }

  private calculateAvgResponseTime(metrics: RequestMetrics[]): number {
    if (metrics.length === 0) return 0;
    return Math.round(metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length);
  }

  private calculateErrorRate(metrics: RequestMetrics[]): number {
    if (metrics.length === 0) return 0;
    const errors = metrics.filter(m => m.statusCode >= 400).length;
    return Math.round((errors / metrics.length) * 100 * 10) / 10;
  }

  private calculateSuccessRate(metrics: RequestMetrics[]): number {
    if (metrics.length === 0) return 100;
    const successful = metrics.filter(m => m.statusCode >= 200 && m.statusCode < 300).length;
    return Math.round((successful / metrics.length) * 100 * 10) / 10;
  }

  private getTopModels(metrics: RequestMetrics[], limit: number) {
    const modelCounts: Record<string, number> = {};
    metrics.forEach(m => {
      const key = `${m.provider}_${m.model}`;
      modelCounts[key] = (modelCounts[key] || 0) + 1;
    });

    return Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  // Update analytics settings from config
  updateConfig(config: any) {
    const optimization = config?.optimization || {};
    this.analyticsEnabled = optimization.analyticsEnabled !== false;
    this.batchSize = optimization.batchSize || 10;
    this.saveFrequency = optimization.saveFrequency || 5000;
    
    // Flush any pending batch when settings change
    if (this.analyticsEnabled && this.pendingBatch.length > 0) {
      this.flushBatch();
    }
  }
  
  // Force flush any pending data
  forceFlush() {
    if (this.pendingBatch.length > 0) {
      this.flushBatch();
    }
  }

  // Cleanup old data (keep last 30 days)
  cleanup() {
    if (!this.analyticsEnabled) {
      return;
    }
    
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    this.cache.metrics = this.cache.metrics.filter(m => m.timestamp > cutoff);
    
    // Remove old daily stats
    Object.keys(this.cache.dailyStats).forEach(date => {
      if (new Date(date).getTime() < cutoff) {
        delete this.cache.dailyStats[date];
      }
    });

    this.saveData();
  }
}

// Singleton instance - will be initialized with config in index.ts
let analyticsInstance: AnalyticsManager | null = null;

export function initializeAnalytics(config?: any) {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsManager(config);
  } else {
    analyticsInstance.updateConfig(config);
  }
  return analyticsInstance;
}

export function getAnalytics(): AnalyticsManager {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsManager();
  }
  return analyticsInstance;
}

// Legacy export for backward compatibility
export const analytics = getAnalytics();

// Cleanup old data daily with conditional execution
setInterval(() => {
  const instance = getAnalytics();
  if (instance) {
    instance.cleanup();
  }
}, 24 * 60 * 60 * 1000);

// Ensure any pending data is flushed on process exit
process.on('exit', () => {
  const instance = getAnalytics();
  if (instance) {
    instance.forceFlush();
  }
});

process.on('SIGINT', () => {
  const instance = getAnalytics();
  if (instance) {
    instance.forceFlush();
  }
  process.exit(0);
});
