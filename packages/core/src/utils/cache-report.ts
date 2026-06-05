/**
 * Cache Report - 缓存命中报表与节省成本计算
 *
 * Aggregates cache statistics across all layers:
 * - L1 Semantic Cache (in-memory)
 * - L2 Redis Cache (cross-process)
 * - L3 Vector Store (Qdrant)
 *
 * Calculates:
 * - Hit rates per layer
 * - Estimated cost savings
 * - Latency savings
 * - Token savings
 *
 * Design: Zero external dependencies. Reads stats from existing caches.
 */

export interface CacheReportConfig {
  enabled: boolean;
  /** Average cost per 1K input tokens (USD) */
  avgInputCostPer1k: number;
  /** Average cost per 1K output tokens (USD) */
  avgOutputCostPer1k: number;
  /** Average latency per request in ms */
  avgLatencyMs: number;
}

const DEFAULT_CONFIG: CacheReportConfig = {
  enabled: true,
  avgInputCostPer1k: 0.005,
  avgOutputCostPer1k: 0.015,
  avgLatencyMs: 2000,
};

export interface CacheLayerStats {
  name: string;
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
}

export interface CacheReport {
  timestamp: number;
  layers: CacheLayerStats[];
  total: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  savings: {
    estimatedCostUsd: number;
    estimatedTokens: number;
    estimatedLatencyMs: number;
  };
}

export class CacheReportAggregator {
  private config: CacheReportConfig;
  private logger?: any;
  private cumulativeHits = 0;
  private cumulativeMisses = 0;
  private cumulativeTokens = 0;

  constructor(config: Partial<CacheReportConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Generate a cache report from current stats.
   */
  generateReport(stats: {
    l1?: { hits: number; misses: number; entries: number };
    l2?: { hits: number; misses: number; connected: boolean };
    l3?: { initialized: boolean; collection: string };
  }): CacheReport {
    const layers: CacheLayerStats[] = [];

    // L1 Semantic Cache
    if (stats.l1) {
      const total = stats.l1.hits + stats.l1.misses;
      layers.push({
        name: 'L1 Semantic Cache (Memory)',
        hits: stats.l1.hits,
        misses: stats.l1.misses,
        hitRate: total > 0 ? Math.round((stats.l1.hits / total) * 100) / 100 : 0,
        entries: stats.l1.entries,
      });
    }

    // L2 Redis Cache
    if (stats.l2) {
      const total = stats.l2.hits + stats.l2.misses;
      layers.push({
        name: 'L2 Redis Cache',
        hits: stats.l2.hits,
        misses: stats.l2.misses,
        hitRate: total > 0 ? Math.round((stats.l2.hits / total) * 100) / 100 : 0,
        entries: 0,
      });
    }

    // L3 Vector Store
    if (stats.l3) {
      layers.push({
        name: 'L3 Vector Store (Qdrant)',
        hits: 0,
        misses: 0,
        hitRate: 0,
        entries: 0,
      });
    }

    // Aggregate totals
    const totalHits = layers.reduce((sum, l) => sum + l.hits, 0);
    const totalMisses = layers.reduce((sum, l) => sum + l.misses, 0);
    const totalRequests = totalHits + totalMisses;

    // Update cumulative stats
    this.cumulativeHits += totalHits;
    this.cumulativeMisses += totalMisses;

    // Estimate savings (each cache hit saves one API call)
    const estimatedTokensSaved = totalHits * 2000; // Assume avg 2K tokens per request
    const estimatedCostSaved = totalHits * (
      (2000 / 1000) * this.config.avgInputCostPer1k +
      (500 / 1000) * this.config.avgOutputCostPer1k
    );
    const estimatedLatencySaved = totalHits * this.config.avgLatencyMs;

    return {
      timestamp: Date.now(),
      layers,
      total: {
        hits: totalHits,
        misses: totalMisses,
        hitRate: totalRequests > 0 ? Math.round((totalHits / totalRequests) * 100) / 100 : 0,
      },
      savings: {
        estimatedCostUsd: Math.round(estimatedCostSaved * 1000) / 1000,
        estimatedTokens: estimatedTokensSaved,
        estimatedLatencyMs: estimatedLatencySaved,
      },
    };
  }

  /**
   * Get cumulative stats.
   */
  getCumulativeStats(): { totalHits: number; totalMisses: number; hitRate: number } {
    const total = this.cumulativeHits + this.cumulativeMisses;
    return {
      totalHits: this.cumulativeHits,
      totalMisses: this.cumulativeMisses,
      hitRate: total > 0 ? Math.round((this.cumulativeHits / total) * 100) / 100 : 0,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<CacheReportConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalReport: CacheReportAggregator | null = null;

export function getCacheReportAggregator(config?: Partial<CacheReportConfig>, logger?: any): CacheReportAggregator {
  if (!globalReport) {
    globalReport = new CacheReportAggregator(config, logger);
  } else if (config) {
    globalReport.updateConfig(config);
  }
  return globalReport;
}
