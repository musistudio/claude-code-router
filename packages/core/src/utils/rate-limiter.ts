/**
 * Rate Limiter - 令牌桶限速
 *
 * Token bucket algorithm for per-user, per-IP, and per-API-key rate limiting.
 * Also supports global rate limits and budget enforcement.
 *
 * Design: Zero external dependencies. In-memory token buckets with automatic refill.
 */

export interface RateLimiterConfig {
  /** Requests per window per key */
  requestsPerWindow: number;
  /** Window duration in ms (default: 60000 = 1 min) */
  windowMs: number;
  /** Token budget per window per key (0 = no limit) */
  tokensPerWindow: number;
  /** Global requests per window */
  globalRequestsPerWindow: number;
  /** Global token budget per window */
  globalTokensPerWindow: number;
  /** Enable per-IP limiting */
  perIp: boolean;
  /** Enable per-API-key limiting */
  perApiKey: boolean;
  /** Enable per-user limiting (via x-user-id header) */
  perUser: boolean;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerWindow: 60,
  windowMs: 60000,
  tokensPerWindow: 0,
  globalRequestsPerWindow: 0,
  globalTokensPerWindow: 0,
  perIp: true,
  perApiKey: true,
  perUser: false,
};

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestCount: number;
  windowStart: number;
  tokenBudgetUsed: number;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: RateLimiterConfig;
  private globalBucket: TokenBucket;
  private logger?: any;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config: Partial<RateLimiterConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    this.globalBucket = {
      tokens: this.config.globalRequestsPerWindow || Infinity,
      lastRefill: Date.now(),
      requestCount: 0,
      windowStart: Date.now(),
      tokenBudgetUsed: 0,
    };

    // Cleanup stale buckets every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Check if a request is allowed. Returns { allowed, retryAfterMs, reason }.
   */
  check(params: {
    ip?: string;
    apiKey?: string;
    userId?: string;
    estimatedTokens?: number;
  }): { allowed: boolean; retryAfterMs?: number; reason?: string } {
    const now = Date.now();

    // Global rate limit
    if (this.config.globalRequestsPerWindow > 0) {
      this.refillBucket(this.globalBucket, now, this.config.globalRequestsPerWindow);
      if (this.globalBucket.requestCount >= this.config.globalRequestsPerWindow) {
        const retryAfterMs = this.globalBucket.windowStart + this.config.windowMs - now;
        return { allowed: false, retryAfterMs, reason: 'global_rate_limit' };
      }
    }

    // Global token budget
    if (this.config.globalTokensPerWindow > 0 && params.estimatedTokens) {
      this.refillBucket(this.globalBucket, now, this.config.globalRequestsPerWindow);
      if (this.globalBucket.tokenBudgetUsed + params.estimatedTokens > this.config.globalTokensPerWindow) {
        const retryAfterMs = this.globalBucket.windowStart + this.config.windowMs - now;
        return { allowed: false, retryAfterMs, reason: 'global_token_budget' };
      }
    }

    // Per-IP limiting
    if (this.config.perIp && params.ip) {
      const result = this.checkKey(`ip:${params.ip}`, now, params.estimatedTokens);
      if (!result.allowed) return { ...result, reason: 'ip_rate_limit' };
    }

    // Per-API-key limiting
    if (this.config.perApiKey && params.apiKey) {
      const result = this.checkKey(`key:${params.apiKey}`, now, params.estimatedTokens);
      if (!result.allowed) return { ...result, reason: 'api_key_rate_limit' };
    }

    // Per-user limiting
    if (this.config.perUser && params.userId) {
      const result = this.checkKey(`user:${params.userId}`, now, params.estimatedTokens);
      if (!result.allowed) return { ...result, reason: 'user_rate_limit' };
    }

    // All checks passed - record the request
    this.recordRequest(params);

    return { allowed: true };
  }

  /**
   * Get rate limiter stats for monitoring.
   */
  getStats(): {
    activeBuckets: number;
    globalRequests: number;
    globalTokensUsed: number;
    config: RateLimiterConfig;
  } {
    return {
      activeBuckets: this.buckets.size,
      globalRequests: this.globalBucket.requestCount,
      globalTokensUsed: this.globalBucket.tokenBudgetUsed,
      config: this.config,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Destroy and cleanup.
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }

  // =========================================================================
  // Private
  // =========================================================================

  private checkKey(
    key: string,
    now: number,
    estimatedTokens?: number
  ): { allowed: boolean; retryAfterMs?: number } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.requestsPerWindow,
        lastRefill: now,
        requestCount: 0,
        windowStart: now,
        tokenBudgetUsed: 0,
      };
      this.buckets.set(key, bucket);
    }

    this.refillBucket(bucket, now, this.config.requestsPerWindow);

    // Check request count
    if (bucket.requestCount >= this.config.requestsPerWindow) {
      const retryAfterMs = bucket.windowStart + this.config.windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    // Check token budget
    if (this.config.tokensPerWindow > 0 && estimatedTokens) {
      if (bucket.tokenBudgetUsed + estimatedTokens > this.config.tokensPerWindow) {
        const retryAfterMs = bucket.windowStart + this.config.windowMs - now;
        return { allowed: false, retryAfterMs };
      }
    }

    return { allowed: true };
  }

  private refillBucket(bucket: TokenBucket, now: number, maxRequests: number): void {
    const elapsed = now - bucket.windowStart;
    if (elapsed >= this.config.windowMs) {
      // New window
      bucket.windowStart = now;
      bucket.requestCount = 0;
      bucket.tokenBudgetUsed = 0;
    }
  }

  private recordRequest(params: {
    ip?: string;
    apiKey?: string;
    userId?: string;
    estimatedTokens?: number;
  }): void {
    const now = Date.now();

    // Global
    this.refillBucket(this.globalBucket, now, this.config.globalRequestsPerWindow);
    this.globalBucket.requestCount++;
    if (params.estimatedTokens) {
      this.globalBucket.tokenBudgetUsed += params.estimatedTokens;
    }

    // Per-key
    const keys: string[] = [];
    if (this.config.perIp && params.ip) keys.push(`ip:${params.ip}`);
    if (this.config.perApiKey && params.apiKey) keys.push(`key:${params.apiKey}`);
    if (this.config.perUser && params.userId) keys.push(`user:${params.userId}`);

    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          tokens: this.config.requestsPerWindow,
          lastRefill: now,
          requestCount: 0,
          windowStart: now,
          tokenBudgetUsed: 0,
        };
        this.buckets.set(key, bucket);
      }
      this.refillBucket(bucket, now, this.config.requestsPerWindow);
      bucket.requestCount++;
      if (params.estimatedTokens) {
        bucket.tokenBudgetUsed += params.estimatedTokens;
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = now - this.config.windowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart < staleThreshold) {
        this.buckets.delete(key);
      }
    }
  }
}

// Singleton
let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimiterConfig>, logger?: any): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(config, logger);
  } else if (config) {
    globalRateLimiter.updateConfig(config);
  }
  return globalRateLimiter;
}
