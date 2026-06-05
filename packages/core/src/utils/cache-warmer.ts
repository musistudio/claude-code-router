/**
 * Cache Warmer - 缓存预热
 *
 * Pre-computes and caches responses for common queries:
 * - Frequently asked questions
 * - Market data queries
 * - Strategy analysis patterns
 *
 * Design: Reads warmup queries from config, pre-populates semantic cache.
 */

export interface CacheWarmerConfig {
  enabled: boolean;
  /** Warmup queries to pre-cache */
  queries: Array<{ prompt: string; model: string; provider: string }>;
  /** Interval to re-warm in ms */
  intervalMs: number;
  /** Max concurrent warmup requests */
  concurrency: number;
}

const DEFAULT_CONFIG: CacheWarmerConfig = {
  enabled: false,
  queries: [],
  intervalMs: 3600000,
  concurrency: 2,
};

export class CacheWarmer {
  private config: CacheWarmerConfig;
  private logger?: any;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastWarmup = 0;
  private warmedCount = 0;

  constructor(config: Partial<CacheWarmerConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  start(): void {
    if (!this.config.enabled || this.config.queries.length === 0) return;
    this.warmup();
    this.intervalId = setInterval(() => this.warmup(), this.config.intervalMs);
    this.logger?.info(`CacheWarmer: started (${this.config.queries.length} queries, interval=${this.config.intervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  async warmup(): Promise<number> {
    if (!this.config.enabled) return 0;
    const startTime = Date.now();
    let warmed = 0;

    for (let i = 0; i < this.config.queries.length; i += this.config.concurrency) {
      const batch = this.config.queries.slice(i, i + this.config.concurrency);
      await Promise.allSettled(batch.map(async (query) => {
        try {
          await fetch(`http://127.0.0.1:${3456}/v1/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'warmup' },
            body: JSON.stringify({ model: query.model, messages: [{ role: 'user', content: query.prompt }], stream: false }),
          });
          warmed++;
        } catch {}
      }));
    }

    this.lastWarmup = Date.now();
    this.warmedCount += warmed;
    this.logger?.info(`CacheWarmer: warmed ${warmed} queries in ${Date.now() - startTime}ms`);
    return warmed;
  }

  getStats(): { enabled: boolean; queries: number; lastWarmup: number; totalWarmed: number } {
    return { enabled: this.config.enabled, queries: this.config.queries.length, lastWarmup: this.lastWarmup, totalWarmed: this.warmedCount };
  }

  updateConfig(config: Partial<CacheWarmerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

let globalWarmer: CacheWarmer | null = null;
export function getCacheWarmer(config?: Partial<CacheWarmerConfig>, logger?: any): CacheWarmer {
  if (!globalWarmer) globalWarmer = new CacheWarmer(config, logger);
  else if (config) globalWarmer.updateConfig(config);
  return globalWarmer;
}
