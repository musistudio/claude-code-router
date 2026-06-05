export interface ABTestVariant {
  name: string;
  model: string;
  weight: number;
}

export interface ABTestExperiment {
  variants: ABTestVariant[];
}

export interface ABTestConfig {
  enabled: boolean;
  experiments: Record<string, ABTestExperiment>;
}

interface VariantResult {
  count: number;
  totalQuality: number;
  totalLatency: number;
  totalCost: number;
}

export class ABTestingFramework {
  private config: ABTestConfig;
  private assignments = new Map<string, string>();
  private results = new Map<string, Map<string, VariantResult>>();
  private stats = { assigned: 0, recorded: 0 };

  constructor(config: ABTestConfig) {
    this.config = config;
  }

  assignVariant(sessionId: string, experimentId: string): ABTestVariant | null {
    if (!this.config.enabled) return null;

    const experiment = this.config.experiments[experimentId];
    if (!experiment || experiment.variants.length === 0) return null;

    const key = `${sessionId}::${experimentId}`;
    const existing = this.assignments.get(key);
    if (existing) {
      return experiment.variants.find((v) => v.name === existing) ?? null;
    }

    const hash = this.deterministicHash(sessionId, experimentId);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let threshold = (hash % totalWeight);

    let assigned: ABTestVariant = experiment.variants[0];
    for (const variant of experiment.variants) {
      threshold -= variant.weight;
      if (threshold < 0) {
        assigned = variant;
        break;
      }
    }

    this.assignments.set(key, assigned.name);
    this.stats.assigned++;
    return assigned;
  }

  getVariant(sessionId: string, experimentId: string): ABTestVariant | null {
    const key = `${sessionId}::${experimentId}`;
    const variantName = this.assignments.get(key);
    if (!variantName) return null;

    const experiment = this.config.experiments[experimentId];
    if (!experiment) return null;

    return experiment.variants.find((v) => v.name === variantName) ?? null;
  }

  recordResult(
    sessionId: string,
    experimentId: string,
    variant: string,
    metrics: { quality?: number; latency?: number; cost?: number }
  ): void {
    if (!this.config.enabled) return;

    if (!this.results.has(experimentId)) {
      this.results.set(experimentId, new Map());
    }

    const experimentResults = this.results.get(experimentId)!;
    if (!experimentResults.has(variant)) {
      experimentResults.set(variant, { count: 0, totalQuality: 0, totalLatency: 0, totalCost: 0 });
    }

    const result = experimentResults.get(variant)!;
    result.count++;
    result.totalQuality += metrics.quality ?? 0;
    result.totalLatency += metrics.latency ?? 0;
    result.totalCost += metrics.cost ?? 0;
    this.stats.recorded++;
  }

  getResults(experimentId: string): Record<string, {
    count: number;
    avgQuality: number;
    avgLatency: number;
    avgCost: number;
  }> | null {
    const experimentResults = this.results.get(experimentId);
    if (!experimentResults) return null;

    const output: Record<string, {
      count: number;
      avgQuality: number;
      avgLatency: number;
      avgCost: number;
    }> = {};

    for (const [variant, result] of experimentResults) {
      output[variant] = {
        count: result.count,
        avgQuality: result.count > 0 ? result.totalQuality / result.count : 0,
        avgLatency: result.count > 0 ? result.totalLatency / result.count : 0,
        avgCost: result.count > 0 ? result.totalCost / result.count : 0,
      };
    }

    return output;
  }

  getStats() {
    return { ...this.stats, experiments: Object.keys(this.config.experiments) };
  }

  private deterministicHash(sessionId: string, experimentId: string): number {
    const input = `${sessionId}::${experimentId}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
