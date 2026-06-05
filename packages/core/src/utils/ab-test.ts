/**
 * A/B Test - A/B测试分流
 *
 * Routes requests to different models/prompts for comparison:
 * - Weighted random routing
 * - Session-based sticky assignment
 * - Result tracking for comparison
 */

export interface ABTestConfig {
  enabled: boolean;
  experiments: Array<{
    name: string;
    variants: Array<{ name: string; model: string; weight: number }>;
    /** Percentage of traffic to include (0-100) */
    trafficPercent: number;
  }>;
}

const DEFAULT_CONFIG: ABTestConfig = { enabled: false, experiments: [] };

export interface ABAssignment {
  experiment: string;
  variant: string;
  model: string;
}

export class ABTester {
  private config: ABTestConfig;
  private logger?: any;
  private assignments: Map<string, Map<string, ABAssignment>> = new Map();
  private stats: Map<string, Map<string, { count: number; totalLatency: number }>> = new Map();

  constructor(config: Partial<ABTestConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  assign(sessionId: string, experimentName: string): ABAssignment | null {
    if (!this.config.enabled) return null;

    const experiment = this.config.experiments.find((e) => e.name === experimentName);
    if (!experiment) return null;

    // Check traffic percent
    if (Math.random() * 100 > experiment.trafficPercent) return null;

    // Check sticky assignment
    const sessionAssignments = this.assignments.get(sessionId);
    if (sessionAssignments?.has(experimentName)) {
      return sessionAssignments.get(experimentName)!;
    }

    // Weighted random selection
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;
    for (const variant of experiment.variants) {
      random -= variant.weight;
      if (random <= 0) {
        const assignment: ABAssignment = {
          experiment: experimentName,
          variant: variant.name,
          model: variant.model,
        };

        if (!this.assignments.has(sessionId)) {
          this.assignments.set(sessionId, new Map());
        }
        this.assignments.get(sessionId)!.set(experimentName, assignment);

        return assignment;
      }
    }

    return null;
  }

  recordResult(experiment: string, variant: string, latencyMs: number): void {
    if (!this.stats.has(experiment)) this.stats.set(experiment, new Map());
    const experimentStats = this.stats.get(experiment)!;
    const current = experimentStats.get(variant) || { count: 0, totalLatency: 0 };
    current.count++;
    current.totalLatency += latencyMs;
    experimentStats.set(variant, current);
  }

  getStats(): Record<string, Record<string, { count: number; avgLatency: number }>> {
    const result: Record<string, Record<string, { count: number; avgLatency: number }>> = {};
    for (const [exp, variants] of this.stats) {
      result[exp] = {};
      for (const [variant, stats] of variants) {
        result[exp][variant] = { count: stats.count, avgLatency: Math.round(stats.totalLatency / stats.count) };
      }
    }
    return result;
  }

  updateConfig(config: Partial<ABTestConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalAB: ABTester | null = null;
export function getABTester(config?: Partial<ABTestConfig>, logger?: any): ABTester {
  if (!globalAB) globalAB = new ABTester(config, logger);
  else if (config) globalAB.updateConfig(config);
  return globalAB;
}
