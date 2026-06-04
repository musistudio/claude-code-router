/**
 * Metrics - 指标收集 + 成本追踪 + Prometheus导出
 *
 * Collects request metrics, token usage, cost, latency, and cache stats.
 * Exports in Prometheus exposition format.
 *
 * Design: Zero external dependencies. In-memory counters and histograms.
 * Thread-safe via synchronous operations on single-threaded Node.js event loop.
 */

// ============================================================================
// Cost Table (per 1M tokens, USD)
// ============================================================================

export const MODEL_COST_TABLE: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-6':        { input: 3.0,   output: 15.0 },
  'claude-sonnet-4-5':        { input: 3.0,   output: 15.0 },
  'claude-haiku-3-5':         { input: 0.8,   output: 4.0 },
  'claude-opus-4':            { input: 15.0,  output: 75.0 },
  // DeepSeek
  'deepseek-chat':            { input: 0.14,  output: 0.28 },
  'deepseek-reasoner':        { input: 0.55,  output: 2.19 },
  'deepseek-v4-pro':          { input: 0.55,  output: 2.19 },
  'deepseek-v4-flash':        { input: 0.14,  output: 0.28 },
  // OpenAI
  'gpt-4o':                   { input: 2.5,   output: 10.0 },
  'gpt-4o-mini':              { input: 0.15,  output: 0.6 },
  'gpt-4-turbo':              { input: 10.0,  output: 30.0 },
  'o1':                       { input: 15.0,  output: 60.0 },
  'o1-mini':                  { input: 3.0,   output: 12.0 },
  'o3-mini':                  { input: 1.1,   output: 4.4 },
  // Gemini
  'gemini-2.5-pro':           { input: 1.25,  output: 10.0 },
  'gemini-2.5-flash':         { input: 0.15,  output: 0.6 },
  'gemini-2.0-flash':         { input: 0.1,   output: 0.4 },
  // Default fallback for unknown models
  '_default':                 { input: 3.0,   output: 15.0 },
};

// ============================================================================
// Metric Types
// ============================================================================

interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  sum: number;
  count: number;
  buckets: Map<number, number>; // upper_bound -> count
  labels: Record<string, string>;
}

interface Gauge {
  value: number;
  labels: Record<string, string>;
}

// ============================================================================
// Metrics Registry
// ============================================================================

export class MetricsRegistry {
  // Counters
  private requestTotal = 0;
  private requestByProvider: Map<string, number> = new Map();
  private requestByModel: Map<string, number> = new Map();
  private requestByStatus: Map<string, number> = new Map();
  private requestByScenario: Map<string, number> = new Map();
  private retryTotal = 0;
  private circuitOpenTotal = 0;
  private cacheHitTotal = 0;
  private cacheMissTotal = 0;
  private errorTotal = 0;
  private rateLimitHitTotal = 0;

  // Token counters
  private tokensInputTotal = 0;
  private tokensOutputTotal = 0;
  private tokensByProvider: Map<string, { input: number; output: number }> = new Map();
  private tokensByModel: Map<string, { input: number; output: number }> = new Map();

  // Cost tracking
  private costTotalUsd = 0;
  private costByProvider: Map<string, number> = new Map();
  private costByModel: Map<string, number> = new Map();
  private costBySession: Map<string, number> = new Map();

  // Histograms (latency)
  private latencyBuckets = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];
  private requestLatency: Map<string, { sum: number; count: number; buckets: Map<number, number> }> = new Map();

  // Gauges
  private activeRequests = 0;
  private queueDepth = 0;
  private providerHealth: Map<string, boolean> = new Map();
  private circuitState: Map<string, string> = new Map();

  // Time series (last N data points for dashboard)
  private requestTimeline: Array<{ timestamp: number; count: number; errors: number }> = [];
  private costTimeline: Array<{ timestamp: number; costUsd: number }> = [];
  private readonly timelineMaxPoints = 1440; // 24 hours at 1/min

  // Snapshot ring buffer for /api/metrics/history
  private snapshotBuffer: Array<Record<string, any>> = [];
  private readonly snapshotMaxSize = 100;

  private logger?: any;

  constructor(logger?: any) {
    this.logger = logger;

    // Record timeline data point every minute
    setInterval(() => {
      this.recordTimelinePoint();
      this.pushSnapshot();
    }, 60000);
  }

  // =========================================================================
  // Recording Methods
  // =========================================================================

  /**
   * Record a completed request.
   */
  recordRequest(params: {
    provider: string;
    model: string;
    scenario?: string;
    statusCode: number;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheHit?: boolean;
    retryCount?: number;
    sessionId?: string;
    error?: string;
  }): void {
    const {
      provider, model, scenario, statusCode, latencyMs,
      inputTokens, outputTokens, cacheHit, retryCount, sessionId, error,
    } = params;

    // Request counts
    this.requestTotal++;
    this.requestByProvider.set(provider, (this.requestByProvider.get(provider) || 0) + 1);
    this.requestByModel.set(model, (this.requestByModel.get(model) || 0) + 1);
    this.requestByStatus.set(String(statusCode), (this.requestByStatus.get(String(statusCode)) || 0) + 1);
    if (scenario) {
      this.requestByScenario.set(scenario, (this.requestByScenario.get(scenario) || 0) + 1);
    }

    // Error count
    if (statusCode >= 400 || error) {
      this.errorTotal++;
    }

    // Retry count
    if (retryCount && retryCount > 0) {
      this.retryTotal += retryCount;
    }

    // Cache
    if (cacheHit) {
      this.cacheHitTotal++;
    } else {
      this.cacheMissTotal++;
    }

    // Tokens
    this.tokensInputTotal += inputTokens;
    this.tokensOutputTotal += outputTokens;

    const providerTokens = this.tokensByProvider.get(provider) || { input: 0, output: 0 };
    providerTokens.input += inputTokens;
    providerTokens.output += outputTokens;
    this.tokensByProvider.set(provider, providerTokens);

    const modelTokens = this.tokensByModel.get(model) || { input: 0, output: 0 };
    modelTokens.input += inputTokens;
    modelTokens.output += outputTokens;
    this.tokensByModel.set(model, modelTokens);

    // Cost calculation
    const cost = this.calculateCost(model, inputTokens, outputTokens);
    this.costTotalUsd += cost;
    this.costByProvider.set(provider, (this.costByProvider.get(provider) || 0) + cost);
    this.costByModel.set(model, (this.costByModel.get(model) || 0) + cost);
    if (sessionId) {
      this.costBySession.set(sessionId, (this.costBySession.get(sessionId) || 0) + cost);
    }

    // Latency histogram
    this.recordLatency(provider, latencyMs);
    this.recordLatency(model, latencyMs);
    this.recordLatency('_all', latencyMs);
  }

  /**
   * Increment active requests gauge.
   */
  incrementActive(): void {
    this.activeRequests++;
  }

  /**
   * Decrement active requests gauge.
   */
  decrementActive(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * Update queue depth gauge.
   */
  setQueueDepth(depth: number): void {
    this.queueDepth = depth;
  }

  /**
   * Update provider health gauge.
   */
  setProviderHealth(provider: string, healthy: boolean): void {
    this.providerHealth.set(provider, healthy);
  }

  /**
   * Update circuit breaker state.
   */
  setCircuitState(provider: string, state: string): void {
    this.circuitState.set(provider, state);
  }

  /**
   * Record a rate limit hit.
   */
  recordRateLimitHit(): void {
    this.rateLimitHitTotal++;
  }

  /**
   * Record a circuit open rejection.
   */
  recordCircuitOpen(): void {
    this.circuitOpenTotal++;
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get cost for a specific session.
   */
  getSessionCost(sessionId: string): number {
    return this.costBySession.get(sessionId) || 0;
  }

  /**
   * Get total cost.
   */
  getTotalCost(): number {
    return this.costTotalUsd;
  }

  /**
   * Get comprehensive stats for dashboard.
   */
  getStats(): {
    requests: { total: number; errors: number; retries: number; rateLimited: number };
    tokens: { inputTotal: number; outputTotal: number; byProvider: Record<string, { input: number; output: number }> };
    cost: { totalUsd: number; byProvider: Record<string, number>; byModel: Record<string, number> };
    cache: { hits: number; misses: number; hitRate: number };
    latency: { p50: number; p95: number; p99: number };
    active: { requests: number; queueDepth: number };
    circuit: Record<string, string>;
    health: Record<string, boolean>;
  } {
    const totalCache = this.cacheHitTotal + this.cacheMissTotal;
    const allLatency = this.requestLatency.get('_all');

    return {
      requests: {
        total: this.requestTotal,
        errors: this.errorTotal,
        retries: this.retryTotal,
        rateLimited: this.rateLimitHitTotal,
      },
      tokens: {
        inputTotal: this.tokensInputTotal,
        outputTotal: this.tokensOutputTotal,
        byProvider: Object.fromEntries(this.tokensByProvider),
      },
      cost: {
        totalUsd: Math.round(this.costTotalUsd * 10000) / 10000,
        byProvider: Object.fromEntries(
          Array.from(this.costByProvider.entries()).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
        ),
        byModel: Object.fromEntries(
          Array.from(this.costByModel.entries()).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
        ),
      },
      cache: {
        hits: this.cacheHitTotal,
        misses: this.cacheMissTotal,
        hitRate: totalCache > 0 ? Math.round((this.cacheHitTotal / totalCache) * 10000) / 100 : 0,
      },
      latency: {
        p50: allLatency ? this.getPercentile(allLatency, 50) : 0,
        p95: allLatency ? this.getPercentile(allLatency, 95) : 0,
        p99: allLatency ? this.getPercentile(allLatency, 99) : 0,
      },
      active: {
        requests: this.activeRequests,
        queueDepth: this.queueDepth,
      },
      circuit: Object.fromEntries(this.circuitState),
      health: Object.fromEntries(this.providerHealth),
    };
  }

  /**
   * Export metrics in Prometheus exposition format.
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Request metrics
    lines.push('# HELP ccr_requests_total Total number of requests');
    lines.push('# TYPE ccr_requests_total counter');
    lines.push(`ccr_requests_total ${this.requestTotal}`);

    lines.push('# HELP ccr_requests_by_provider Requests by provider');
    lines.push('# TYPE ccr_requests_by_provider counter');
    for (const [provider, count] of this.requestByProvider) {
      lines.push(`ccr_requests_by_provider{provider="${provider}"} ${count}`);
    }

    lines.push('# HELP ccr_requests_by_model Requests by model');
    lines.push('# TYPE ccr_requests_by_model counter');
    for (const [model, count] of this.requestByModel) {
      lines.push(`ccr_requests_by_model{model="${model}"} ${count}`);
    }

    lines.push('# HELP ccr_requests_by_status Requests by HTTP status');
    lines.push('# TYPE ccr_requests_by_status counter');
    for (const [status, count] of this.requestByStatus) {
      lines.push(`ccr_requests_by_status{status="${status}"} ${count}`);
    }

    lines.push('# HELP ccr_requests_by_scenario Requests by scenario');
    lines.push('# TYPE ccr_requests_by_scenario counter');
    for (const [scenario, count] of this.requestByScenario) {
      lines.push(`ccr_requests_by_scenario{scenario="${scenario}"} ${count}`);
    }

    // Error/retry/rate limit
    lines.push(`# HELP ccr_errors_total Total errors`);
    lines.push(`# TYPE ccr_errors_total counter`);
    lines.push(`ccr_errors_total ${this.errorTotal}`);

    lines.push(`# HELP ccr_retries_total Total retries`);
    lines.push(`# TYPE ccr_retries_total counter`);
    lines.push(`ccr_retries_total ${this.retryTotal}`);

    lines.push(`# HELP ccr_circuit_open_total Circuit breaker rejections`);
    lines.push(`# TYPE ccr_circuit_open_total counter`);
    lines.push(`ccr_circuit_open_total ${this.circuitOpenTotal}`);

    lines.push(`# HELP ccr_rate_limit_hits_total Rate limit hits`);
    lines.push(`# TYPE ccr_rate_limit_hits_total counter`);
    lines.push(`ccr_rate_limit_hits_total ${this.rateLimitHitTotal}`);

    // Token metrics
    lines.push(`# HELP ccr_tokens_input_total Total input tokens`);
    lines.push(`# TYPE ccr_tokens_input_total counter`);
    lines.push(`ccr_tokens_input_total ${this.tokensInputTotal}`);

    lines.push(`# HELP ccr_tokens_output_total Total output tokens`);
    lines.push(`# TYPE ccr_tokens_output_total counter`);
    lines.push(`ccr_tokens_output_total ${this.tokensOutputTotal}`);

    lines.push('# HELP ccr_tokens_by_provider Tokens by provider');
    lines.push('# TYPE ccr_tokens_by_provider counter');
    for (const [provider, tokens] of this.tokensByProvider) {
      lines.push(`ccr_tokens_by_provider{provider="${provider}",direction="input"} ${tokens.input}`);
      lines.push(`ccr_tokens_by_provider{provider="${provider}",direction="output"} ${tokens.output}`);
    }

    // Cost metrics
    lines.push(`# HELP ccr_cost_total_usd Total cost in USD`);
    lines.push(`# TYPE ccr_cost_total_usd counter`);
    lines.push(`ccr_cost_total_usd ${Math.round(this.costTotalUsd * 10000) / 10000}`);

    lines.push('# HELP ccr_cost_by_provider_usd Cost by provider in USD');
    lines.push('# TYPE ccr_cost_by_provider_usd counter');
    for (const [provider, cost] of this.costByProvider) {
      lines.push(`ccr_cost_by_provider_usd{provider="${provider}"} ${Math.round(cost * 10000) / 10000}`);
    }

    lines.push('# HELP ccr_cost_by_model_usd Cost by model in USD');
    lines.push('# TYPE ccr_cost_by_model_usd counter');
    for (const [model, cost] of this.costByModel) {
      lines.push(`ccr_cost_by_model_usd{model="${model}"} ${Math.round(cost * 10000) / 10000}`);
    }

    // Cache metrics
    lines.push(`# HELP ccr_cache_hits_total Cache hits`);
    lines.push(`# TYPE ccr_cache_hits_total counter`);
    lines.push(`ccr_cache_hits_total ${this.cacheHitTotal}`);

    lines.push(`# HELP ccr_cache_misses_total Cache misses`);
    lines.push(`# TYPE ccr_cache_misses_total counter`);
    lines.push(`ccr_cache_misses_total ${this.cacheMissTotal}`);

    // Latency histograms
    for (const [key, hist] of this.requestLatency) {
      const label = key === '_all' ? '' : `{target="${key}"}`;
      lines.push(`# HELP ccr_request_latency_ms Request latency in ms`);
      lines.push(`# TYPE ccr_request_latency_ms histogram`);
      for (const bucket of this.latencyBuckets) {
        const count = hist.buckets.get(bucket) || 0;
        lines.push(`ccr_request_latency_ms_bucket${label ? label.replace('}', `,le="${bucket}"}`) : `{le="${bucket}"}`} ${count}`);
      }
      lines.push(`ccr_request_latency_ms_bucket${label ? label.replace('}', ',le="+Inf"') : '{le="+Inf"}'} ${hist.count}`);
      lines.push(`ccr_request_latency_ms_sum${label} ${Math.round(hist.sum)}`);
      lines.push(`ccr_request_latency_ms_count${label} ${hist.count}`);
    }

    // Gauges
    lines.push(`# HELP ccr_active_requests Currently active requests`);
    lines.push(`# TYPE ccr_active_requests gauge`);
    lines.push(`ccr_active_requests ${this.activeRequests}`);

    lines.push(`# HELP ccr_queue_depth Current queue depth`);
    lines.push(`# TYPE ccr_queue_depth gauge`);
    lines.push(`ccr_queue_depth ${this.queueDepth}`);

    lines.push('# HELP ccr_provider_health Provider health status');
    lines.push('# TYPE ccr_provider_health gauge');
    for (const [provider, healthy] of this.providerHealth) {
      lines.push(`ccr_provider_health{provider="${provider}"} ${healthy ? 1 : 0}`);
    }

    lines.push('# HELP ccr_circuit_state Circuit breaker state (0=closed, 1=open, 2=half_open)');
    lines.push('# TYPE ccr_circuit_state gauge');
    for (const [provider, state] of this.circuitState) {
      const stateValue = state === 'CLOSED' ? 0 : state === 'OPEN' ? 1 : 2;
      lines.push(`ccr_circuit_state{provider="${provider}"} ${stateValue}`);
    }

    return lines.join('\n') + '\n';
  }

  // =========================================================================
  // Private
  // =========================================================================

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_COST_TABLE[model] || MODEL_COST_TABLE['_default'];
    if (!pricing) return 0;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  private recordLatency(key: string, latencyMs: number): void {
    let hist = this.requestLatency.get(key);
    if (!hist) {
      hist = { sum: 0, count: 0, buckets: new Map() };
      this.requestLatency.set(key, hist);
    }
    hist.sum += latencyMs;
    hist.count++;

    for (const bucket of this.latencyBuckets) {
      if (latencyMs <= bucket) {
        hist.buckets.set(bucket, (hist.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  private getPercentile(hist: { sum: number; count: number; buckets: Map<number, number> }, percentile: number): number {
    const target = Math.ceil((percentile / 100) * hist.count);
    // Buckets are cumulative (each includes all values <= bound)
    for (const bucket of this.latencyBuckets) {
      const count = hist.buckets.get(bucket) || 0;
      if (count >= target) return bucket;
    }
    return this.latencyBuckets[this.latencyBuckets.length - 1] || 0;
  }

  private recordTimelinePoint(): void {
    const now = Date.now();
    this.requestTimeline.push({
      timestamp: now,
      count: this.requestTotal,
      errors: this.errorTotal,
    });
    this.costTimeline.push({
      timestamp: now,
      costUsd: this.costTotalUsd,
    });

    // Trim old points
    if (this.requestTimeline.length > this.timelineMaxPoints) {
      this.requestTimeline.shift();
    }
    if (this.costTimeline.length > this.timelineMaxPoints) {
      this.costTimeline.shift();
    }
  }

  pushSnapshot(): void {
    const stats = this.getStats();
    this.snapshotBuffer.push({
      timestamp: new Date().toISOString(),
      ...stats,
    });
    if (this.snapshotBuffer.length > this.snapshotMaxSize) {
      this.snapshotBuffer.shift();
    }
  }

  getHistory(): Array<Record<string, any>> {
    return this.snapshotBuffer;
  }
}

// Singleton
let globalMetrics: MetricsRegistry | null = null;

export function getMetrics(logger?: any): MetricsRegistry {
  if (!globalMetrics) {
    globalMetrics = new MetricsRegistry(logger);
  }
  return globalMetrics;
}
