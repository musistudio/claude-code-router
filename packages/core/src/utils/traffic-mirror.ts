export interface TrafficMirrorConfig {
  enabled: boolean;
  targets: Array<{
    name: string;
    provider: string;
    model: string;
    percentage: number;
  }>;
  maxQueueSize: number;
  flushIntervalMs: number;
  compareOutput: boolean;
}

interface MirroredRequest {
  id: string;
  timestamp: number;
  originalProvider: string;
  originalModel: string;
  targetProvider: string;
  targetModel: string;
  request: any;
  originalResponse?: any;
  mirroredResponse?: any;
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  latencyMs?: number;
  error?: string;
}

const DEFAULT_CONFIG: TrafficMirrorConfig = {
  enabled: false,
  targets: [],
  maxQueueSize: 1000,
  flushIntervalMs: 1000,
  compareOutput: true,
};

export class TrafficMirror {
  private config: TrafficMirrorConfig;
  private queue: MirroredRequest[] = [];
  private results: MirroredRequest[] = [];
  private processing = false;
  private logger?: any;
  private callUpstream: ((provider: string, model: string, request: any) => Promise<{ content: string }>) | null = null;

  constructor(config: Partial<TrafficMirrorConfig>, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  setUpstreamCaller(caller: (provider: string, model: string, request: any) => Promise<{ content: string }>): void {
    this.callUpstream = caller;
  }

  async mirrorRequest(
    request: any,
    originalProvider: string,
    originalModel: string,
    originalResponse?: any
  ): Promise<void> {
    if (!this.config.enabled || !this.callUpstream) return;

    for (const target of this.config.targets) {
      if (Math.random() * 100 > target.percentage) continue;

      const mirrored: MirroredRequest = {
        id: `mirror-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
        originalProvider,
        originalModel,
        targetProvider: target.provider,
        targetModel: target.model,
        request: this.sanitizeRequest(request),
        originalResponse: originalResponse ? this.truncateResponse(originalResponse) : undefined,
        status: 'pending',
      };

      if (this.queue.length >= this.config.maxQueueSize) {
        this.queue.shift();
      }

      this.queue.push(mirrored);
    }

    if (!this.processing) {
      this.processQueue().catch(() => {});
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      const start = Date.now();

      try {
        const result = await Promise.race([
          this.callUpstream!(item.targetProvider, item.targetModel, item.request),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Mirror timeout')), 30000)
          ),
        ]);

        item.mirroredResponse = this.truncateResponse(result);
        item.status = 'completed';
        item.latencyMs = Date.now() - start;
      } catch (error: any) {
        item.status = 'timeout';
        item.error = error.message;
        item.latencyMs = Date.now() - start;
      }

      this.results.push(item);
      if (this.results.length > this.config.maxQueueSize) {
        this.results.shift();
      }
    }

    this.processing = false;
  }

  getResults(limit: number = 50): MirroredRequest[] {
    return this.results.slice(-limit);
  }

  getComparisonStats(): {
    totalMirrored: number;
    completed: number;
    failed: number;
    byTarget: Record<string, { count: number; avgLatencyMs: number; successRate: number }>;
  } {
    const byTarget: Record<string, { count: number; totalLatency: number; successCount: number }> = {};

    for (const r of this.results) {
      const key = `${r.targetProvider}/${r.targetModel}`;
      if (!byTarget[key]) {
        byTarget[key] = { count: 0, totalLatency: 0, successCount: 0 };
      }
      byTarget[key].count++;
      if (r.latencyMs) byTarget[key].totalLatency += r.latencyMs;
      if (r.status === 'completed') byTarget[key].successCount++;
    }

    const result: Record<string, { count: number; avgLatencyMs: number; successRate: number }> = {};
    for (const [key, stats] of Object.entries(byTarget)) {
      result[key] = {
        count: stats.count,
        avgLatencyMs: stats.count > 0 ? stats.totalLatency / stats.count : 0,
        successRate: stats.count > 0 ? stats.successCount / stats.count : 0,
      };
    }

    return {
      totalMirrored: this.results.length,
      completed: this.results.filter(r => r.status === 'completed').length,
      failed: this.results.filter(r => r.status !== 'completed').length,
      byTarget: result,
    };
  }

  private sanitizeRequest(request: any): any {
    const sanitized = { ...request };
    if (sanitized.apiKey) delete sanitized.apiKey;
    if (sanitized.key) delete sanitized.key;
    return sanitized;
  }

  private truncateResponse(response: any): any {
    if (typeof response === 'string' && response.length > 2000) {
      return response.substring(0, 2000) + '...[truncated]';
    }
    if (typeof response === 'object' && response?.content) {
      return { ...response, content: typeof response.content === 'string' ? response.content.substring(0, 2000) : response.content };
    }
    return response;
  }

  updateConfig(config: Partial<TrafficMirrorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let _mirror: TrafficMirror | null = null;

export function getTrafficMirror(config?: Partial<TrafficMirrorConfig>, logger?: any): TrafficMirror {
  if (!_mirror) {
    _mirror = new TrafficMirror(config || {}, logger);
  }
  return _mirror;
}
