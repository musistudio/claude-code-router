export interface PrometheusMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  labels: string[];
}

interface MetricValue {
  value: number;
  labels: Record<string, string>;
}

export class PrometheusExporter {
  private counters: Map<string, MetricValue[]> = new Map();
  private gauges: Map<string, MetricValue[]> = new Map();
  private histograms: Map<string, { buckets: number[]; values: Map<string, { sum: number; count: number; buckets: Map<number, number> }> }> = new Map();
  private metrics: Map<string, PrometheusMetric> = new Map();
  private logger?: any;

  constructor(logger?: any) {
    this.logger = logger;
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics(): void {
    this.registerMetric({
      name: 'ccr_requests_total',
      help: 'Total number of proxy requests',
      type: 'counter',
      labels: ['provider', 'model', 'scenario', 'status'],
    });

    this.registerMetric({
      name: 'ccr_request_duration_seconds',
      help: 'Request duration in seconds',
      type: 'histogram',
      labels: ['provider', 'model'],
    });

    this.registerMetric({
      name: 'ccr_tokens_total',
      help: 'Total tokens consumed',
      type: 'counter',
      labels: ['provider', 'model', 'type'],
    });

    this.registerMetric({
      name: 'ccr_cost_total',
      help: 'Total estimated cost in USD',
      type: 'counter',
      labels: ['provider', 'model'],
    });

    this.registerMetric({
      name: 'ccr_cache_hits_total',
      help: 'Total cache hits',
      type: 'counter',
      labels: ['level'],
    });

    this.registerMetric({
      name: 'ccr_cache_misses_total',
      help: 'Total cache misses',
      type: 'counter',
      labels: ['level'],
    });

    this.registerMetric({
      name: 'ccr_fallback_total',
      help: 'Total fallback events',
      type: 'counter',
      labels: ['from_provider', 'to_provider', 'reason'],
    });

    this.registerMetric({
      name: 'ccr_circuit_breaker_state',
      help: 'Circuit breaker state (1=closed, 0.5=half-open, 0=open)',
      type: 'gauge',
      labels: ['provider'],
    });

    this.registerMetric({
      name: 'ccr_active_connections',
      help: 'Active connections per provider',
      type: 'gauge',
      labels: ['provider'],
    });

    this.registerMetric({
      name: 'ccr_reasoning_chain_steps_total',
      help: 'Total reasoning chain steps executed',
      type: 'counter',
      labels: ['chain_id', 'step_role', 'model'],
    });

    this.registerMetric({
      name: 'ccr_pii_redactions_total',
      help: 'Total PII patterns redacted',
      type: 'counter',
      labels: ['pattern_type'],
    });

    this.registerMetric({
      name: 'ccr_up',
      help: 'Service health (1=up)',
      type: 'gauge',
      labels: [],
    });

    this.increment('ccr_up', 1, {});
  }

  registerMetric(metric: PrometheusMetric): void {
    this.metrics.set(metric.name, metric);

    if (metric.type === 'histogram') {
      this.histograms.set(metric.name, {
        buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
        values: new Map(),
      });
    }
  }

  increment(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.logger?.warn(`Prometheus: Unknown metric ${name}`);
      return;
    }

    const store = metric.type === 'counter' ? this.counters : this.gauges;
    if (!store.has(name)) {
      store.set(name, []);
    }

    const entries = store.get(name)!;
    const key = this.labelKey(labels);
    const existing = entries.find(e => this.labelKey(e.labels) === key);

    if (existing) {
      existing.value += value;
    } else {
      entries.push({ value, labels });
    }
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }

    const entries = this.gauges.get(name)!;
    const key = this.labelKey(labels);
    const existing = entries.find(e => this.labelKey(e.labels) === key);

    if (existing) {
      existing.value = value;
    } else {
      entries.push({ value, labels });
    }
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const hist = this.histograms.get(name);
    if (!hist) return;

    const key = this.labelKey(labels);
    if (!hist.values.has(key)) {
      hist.values.set(key, {
        sum: 0,
        count: 0,
        buckets: new Map(hist.buckets.map(b => [b, 0])),
      });
    }

    const entry = hist.values.get(key)!;
    entry.sum += value;
    entry.count++;

    for (const bound of hist.buckets) {
      if (value <= bound) {
        entry.buckets.set(bound, (entry.buckets.get(bound) || 0) + 1);
      }
    }
  }

  recordRequest(params: {
    provider: string;
    model: string;
    scenario: string;
    status: 'success' | 'error' | 'timeout' | 'rate_limit';
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    cacheHit: boolean;
    cacheLevel?: string;
    fallback?: { from: string; to: string; reason: string };
  }): void {
    const { provider, model, scenario, status, durationMs, inputTokens, outputTokens, cost, cacheHit, cacheLevel, fallback } = params;

    this.increment('ccr_requests_total', 1, { provider, model, scenario, status });
    this.observe('ccr_request_duration_seconds', durationMs / 1000, { provider, model });
    this.increment('ccr_tokens_total', inputTokens, { provider, model, type: 'input' });
    this.increment('ccr_tokens_total', outputTokens, { provider, model, type: 'output' });
    this.increment('ccr_cost_total', cost, { provider, model });

    if (cacheHit && cacheLevel) {
      this.increment('ccr_cache_hits_total', 1, { level: cacheLevel });
    } else {
      this.increment('ccr_cache_misses_total', 1, { level: 'L1' });
    }

    if (fallback) {
      this.increment('ccr_fallback_total', 1, {
        from_provider: fallback.from,
        to_provider: fallback.to,
        reason: fallback.reason,
      });
    }
  }

  export(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);

      if (metric.type === 'counter' || metric.type === 'gauge') {
        const store = metric.type === 'counter' ? this.counters : this.gauges;
        const entries = store.get(name) || [];
        for (const entry of entries) {
          const labelStr = Object.entries(entry.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
          lines.push(`${name}{${labelStr}} ${entry.value}`);
        }
      } else if (metric.type === 'histogram') {
        const hist = this.histograms.get(name);
        if (hist) {
          for (const [labelKey, data] of hist.values) {
            const labels = JSON.parse(labelKey);
            const labelStr = Object.entries(labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',');

            for (const [bound, count] of data.buckets) {
              lines.push(`${name}_bucket{le="${bound}",${labelStr}} ${count}`);
            }
            lines.push(`${name}_bucket{le="+Inf",${labelStr}} ${data.count}`);
            lines.push(`${name}_sum{${labelStr}} ${data.sum}`);
            lines.push(`${name}_count{${labelStr}} ${data.count}`);
          }
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private labelKey(labels: Record<string, string>): string {
    return JSON.stringify(labels);
  }

  getContentType(): string {
    return 'text/plain; version=0.0.4; charset=utf-8';
  }
}

let _exporter: PrometheusExporter | null = null;

export function getPrometheusExporter(logger?: any): PrometheusExporter {
  if (!_exporter) {
    _exporter = new PrometheusExporter(logger);
  }
  return _exporter;
}
