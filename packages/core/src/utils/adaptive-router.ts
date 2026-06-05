import { createHash } from 'crypto';

export interface AdaptiveRouterConfig {
  strategy: 'wrr' | 'least-connections' | 'least-latency' | 'cost-priority';
  healthCheckIntervalMs: number;
  latencyDecayFactor: number;
  costWeights: Record<string, number>;
  defaultWeight: number;
}

interface ProviderMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
  lastSuccess: boolean;
  lastErrorTime: number;
  activeConnections: number;
  weightedScore: number;
}

interface RouteCandidate {
  provider: string;
  model: string;
  weight: number;
}

export interface AdaptiveRouteResult {
  provider: string;
  model: string;
  reason: string;
  estimatedLatency: number;
  fallbackChain: string[];
}

const DEFAULT_CONFIG: AdaptiveRouterConfig = {
  strategy: 'least-latency',
  healthCheckIntervalMs: 30000,
  latencyDecayFactor: 0.7,
  costWeights: {},
  defaultWeight: 100,
};

export class AdaptiveRouter {
  private metrics: Map<string, ProviderMetrics> = new Map();
  private config: AdaptiveRouterConfig;
  private logger?: any;
  private fallbackConfig: Record<string, string[]>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: Partial<AdaptiveRouterConfig> = {},
    fallbackConfig: Record<string, string[]> = {},
    logger?: any
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fallbackConfig = fallbackConfig;
    this.logger = logger;
  }

  registerProvider(providerName: string, initialWeight?: number): void {
    if (!this.metrics.has(providerName)) {
      this.metrics.set(providerName, {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        lastSuccess: true,
        lastErrorTime: 0,
        activeConnections: 0,
        weightedScore: initialWeight || this.config.defaultWeight,
      });
    }
  }

  route(candidates: RouteCandidate[], scenarioType: string = 'default'): AdaptiveRouteResult {
    if (candidates.length === 0) {
      throw new Error('No route candidates available');
    }

    if (candidates.length === 1) {
      const c = candidates[0];
      return {
        provider: c.provider,
        model: c.model,
        reason: 'single-candidate',
        estimatedLatency: this.getEstimatedLatency(c.provider),
        fallbackChain: this.getFallbackChain(scenarioType),
      };
    }

    const scored = candidates.map(c => ({
      ...c,
      score: this.calculateScore(c),
    }));

    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    this.logger?.info(
      `AdaptiveRouter: Selected ${selected.provider}/${selected.model} ` +
      `(score: ${selected.score.toFixed(2)}, strategy: ${this.config.strategy})`
    );

    return {
      provider: selected.provider,
      model: selected.model,
      reason: `${this.config.strategy}:score=${selected.score.toFixed(2)}`,
      estimatedLatency: this.getEstimatedLatency(selected.provider),
      fallbackChain: this.getFallbackChain(scenarioType),
    };
  }

  reportSuccess(provider: string, latencyMs: number): void {
    const metrics = this.getOrCreateMetrics(provider);
    metrics.totalRequests++;
    metrics.successCount++;
    metrics.lastSuccess = true;
    metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

    metrics.lastLatencyMs = latencyMs;
    metrics.totalLatencyMs = metrics.totalLatencyMs * this.config.latencyDecayFactor + latencyMs;

    this.recalculateScore(provider);
  }

  reportFailure(provider: string, errorType: 'timeout' | 'rate_limit' | 'server_error' | 'content_filter' | 'unknown'): void {
    const metrics = this.getOrCreateMetrics(provider);
    metrics.totalRequests++;
    metrics.failureCount++;
    metrics.lastSuccess = false;
    metrics.lastErrorTime = Date.now();
    metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);

    const penalty: Record<string, number> = {
      timeout: 30,
      rate_limit: 20,
      server_error: 25,
      content_filter: 5,
      unknown: 10,
    };

    metrics.weightedScore = Math.max(0, metrics.weightedScore - (penalty[errorType] || 10));
    this.recalculateScore(provider);
  }

  reportConnectionStart(provider: string): void {
    const metrics = this.getOrCreateMetrics(provider);
    metrics.activeConnections++;
  }

  getProviderMetrics(provider: string): ProviderMetrics | null {
    return this.metrics.get(provider) || null;
  }

  getAllMetrics(): Record<string, ProviderMetrics & { errorRate: number; avgLatency: number }> {
    const result: Record<string, ProviderMetrics & { errorRate: number; avgLatency: number }> = {};
    for (const [name, m] of this.metrics) {
      result[name] = {
        ...m,
        errorRate: m.totalRequests > 0 ? m.failureCount / m.totalRequests : 0,
        avgLatency: m.totalRequests > 0 ? m.totalLatencyMs / m.totalRequests : 0,
      };
    }
    return result;
  }

  startHealthChecks(checkFn: (provider: string) => Promise<boolean>): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(async () => {
      for (const [provider, metrics] of this.metrics) {
        try {
          const healthy = await checkFn(provider);
          if (healthy) {
            metrics.weightedScore = Math.min(metrics.weightedScore + 5, this.config.defaultWeight);
          } else {
            metrics.weightedScore = Math.max(0, metrics.weightedScore - 20);
            metrics.lastSuccess = false;
            metrics.lastErrorTime = Date.now();
          }
        } catch {
          metrics.weightedScore = Math.max(0, metrics.weightedScore - 10);
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private calculateScore(candidate: RouteCandidate): number {
    const metrics = this.metrics.get(candidate.provider);
    if (!metrics) {
      return candidate.weight;
    }

    const errorRate = metrics.totalRequests > 0
      ? metrics.failureCount / metrics.totalRequests
      : 0;

    const avgLatency = metrics.totalRequests > 0
      ? metrics.totalLatencyMs / metrics.totalRequests
      : 1000;

    const errorPenalty = errorRate * 100;
    const latencyPenalty = Math.log1p(avgLatency) * 5;
    const connectionPenalty = metrics.activeConnections * 2;

    const recentFailPenalty = this.getRecentFailPenalty(metrics);

    const costWeight = this.config.costWeights[candidate.provider] || 1.0;
    const costBonus = costWeight < 1.0 ? (1.0 - costWeight) * 20 : 0;

    const baseScore = candidate.weight;
    const dynamicScore = metrics.weightedScore * 0.5;

    return Math.max(0, baseScore + dynamicScore - errorPenalty - latencyPenalty - connectionPenalty - recentFailPenalty + costBonus);
  }

  private getRecentFailPenalty(metrics: ProviderMetrics): number {
    if (metrics.lastErrorTime === 0) return 0;
    const elapsed = Date.now() - metrics.lastErrorTime;
    if (elapsed < 10000) return 50;
    if (elapsed < 30000) return 30;
    if (elapsed < 60000) return 15;
    if (elapsed < 300000) return 5;
    return 0;
  }

  private getEstimatedLatency(provider: string): number {
    const metrics = this.metrics.get(provider);
    if (!metrics || metrics.totalRequests === 0) return 2000;
    return metrics.totalLatencyMs / metrics.totalRequests;
  }

  private getFallbackChain(scenarioType: string): string[] {
    return this.fallbackConfig[scenarioType] || this.fallbackConfig['default'] || [];
  }

  private recalculateScore(provider: string): void {
    const metrics = this.metrics.get(provider);
    if (!metrics) return;

    if (metrics.totalRequests === 0) {
      metrics.weightedScore = this.config.defaultWeight;
      return;
    }

    const successRate = metrics.successCount / metrics.totalRequests;
    const recoveryBonus = Math.min(10, successRate * 10);

    metrics.weightedScore = Math.min(
      this.config.defaultWeight,
      metrics.weightedScore + recoveryBonus
    );
  }

  private getOrCreateMetrics(provider: string): ProviderMetrics {
    if (!this.metrics.has(provider)) {
      this.registerProvider(provider);
    }
    return this.metrics.get(provider)!;
  }
}

let _router: AdaptiveRouter | null = null;

export function getAdaptiveRouter(
  config?: Partial<AdaptiveRouterConfig>,
  fallbackConfig?: Record<string, string[]>,
  logger?: any
): AdaptiveRouter {
  if (!_router) {
    _router = new AdaptiveRouter(config, fallbackConfig, logger);
  }
  return _router;
}
