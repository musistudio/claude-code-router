/**
 * ExecutionGuard - Unified Traffic Control & Request Management System
 * 
 * CONSOLIDATES: request-deduplication, ai-request-controller, request-queue, 
 * provider-fallback, fetch-interceptor, rate-limiter
 * 
 * EXCLUDES: dynamic-provider-detector (manual provider control required)
 */

import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { info, warn, error } from './log';

// ========================================================================================
// INTERFACES & TYPES
// ========================================================================================

export interface ExecutionGuardConfig {
  deduplication: {
    enabled: boolean;
    ttlSeconds: number;
    maxCacheSize: number;
    excludeEndpoints: string[];
  };
  rateLimiting: {
    enabled: boolean;
    rules: {
      perMinute: RateLimitRule;
      perHour: RateLimitRule;
      perDay: RateLimitRule;
      burst: RateLimitRule;
    };
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeMs: number;
  };
  queue: {
    enabled: boolean;
    minDelayMs: number;
    maxQueueSize: number;
  };
  retry: {
    enabled: boolean;
    maxRetries: number;
    initialBackoffMs: number;
    maxBackoffMs: number;
    jitterMs: number;
    retryableStatusCodes: number[];
  };
  fallback: {
    enabled: boolean;
    recoveryWindowMs: number;
  };
  persistence: {
    enabled: boolean;
    dataFile?: string;
  };
}

export interface RateLimitRule {
  requests: number;
  windowMs: number;
}

export interface RequestCache {
  hash: string;
  response: any;
  timestamp: number;
  ttl: number;
  hitCount: number;
}

export interface QueuedRequest {
  id: string;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  fn: () => Promise<any>;
  req?: any;
  providerName?: string | (() => string);
}

export interface RequestRecord {
  timestamp: number;
  sessionId: string;
  fingerprint: string;
}

export interface ProviderStatus {
  name: string;
  lastFailure?: number;
  failureCount: number;
  inRecovery: boolean;
  isOnline: boolean;
  responseTime?: number;
  errorRate?: number;
  totalRequests?: number;
}

export interface ExecutionStats {
  deduplication: {
    totalCachedRequests: number;
    totalDuplicateRequestsBlocked: number;
    cacheHitRate: number;
    memoryUsage: number;
  };
  rateLimiting: {
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    totalRequestsTracked: number;
    rulesUsage: { [ruleName: string]: any };
  };
  queue: {
    currentSize: number;
    totalProcessed: number;
    averageWaitTime: number;
    processing: boolean;
  };
  retry: {
    totalRetries: number;
    successAfterRetry: number;
    finalFailures: number;
  };
  providers: { [providerName: string]: ProviderStatus };
}

// ========================================================================================
// MAIN EXECUTION GUARD CLASS
// ========================================================================================

export class ExecutionGuard {
  private cache = new Map<string, RequestCache>();
  private requestRecords: RequestRecord[] = [];
  private queue: QueuedRequest[] = [];
  private providerStatus = new Map<string, ProviderStatus>();
  private processing = false;
  private lastRequestTime = 0;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private failureCount = 0;
  private config: ExecutionGuardConfig;
  private dataFile: string;
  private stats = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalWaitTime: 0,
    retryAttempts: 0,
    successAfterRetry: 0,
    finalFailures: 0,
    lastResetTime: Date.now()
  };

  constructor(config?: Partial<ExecutionGuardConfig>) {
    this.config = this.mergeWithDefaults(config);
    this.dataFile = this.config.persistence.dataFile || 
                   join(homedir(), '.claude-code-router', 'execution-guard.json');
    
    if (this.config.persistence.enabled) {
      this.loadPersistedData();
    }
    
    setInterval(() => this.cleanup(), 60000);
  }

  // ========================================================================================
  // MAIN EXECUTION METHOD
  // ========================================================================================

  async execute<T>(
    requestFn: () => Promise<T>,
    context: {
      req?: any;
      keyId?: string;
      providerName?: string | (() => string);
      skipDeduplication?: boolean;
      skipQueue?: boolean;
    } = {}
  ): Promise<T> {
    const { req, skipDeduplication, skipQueue } = context;
    const providerName = context.providerName; // Keep function reference without calling
    
    if (this.circuitBreakerState === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
    }
    
    if (this.config.rateLimiting.enabled) {
      const rateLimitResult = this.checkRateLimit(req);
      if (rateLimitResult.limited) {
        throw new Error(`Rate limit exceeded: ${rateLimitResult.reason}. Retry after ${rateLimitResult.retryAfter}s`);
      }
    }
    
    if (this.config.deduplication.enabled && !skipDeduplication && req) {
      const dedupResult = this.checkDeduplication(req);
      if (dedupResult.isDuplicate) {
        info(`[ExecutionGuard] Request deduplicated, returning cached response`);
        return dedupResult.cachedResponse;
      }
    }
    
    if (this.config.queue.enabled && !skipQueue) {
      return this.enqueue(requestFn, { req, providerName });
    } else {
      const actualProviderName = typeof providerName === 'function' ? providerName() : providerName;
      return this.executeWithRetry(requestFn, req, actualProviderName);
    }
  }

  // ========================================================================================
  // DEDUPLICATION SYSTEM
  // ========================================================================================

  private generateRequestHash(req: any): string {
    const { body, headers, url, method } = req;
    
    const fingerprint = {
      url: url || '',
      method: method || 'POST',
      body: typeof body === 'object' ? JSON.stringify(body) : body || '',
      userAgent: headers?.['user-agent'] || '',
      sessionId: req.sessionId || 'anonymous',
      timeWindow: Math.floor(Date.now() / 5000) * 5000
    };

    return createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex');
  }

  private checkDeduplication(req: any): { isDuplicate: boolean; cachedResponse?: any } {
    if (this.config.deduplication.excludeEndpoints.some(endpoint => 
        req.url?.startsWith(endpoint))) {
      return { isDuplicate: false };
    }

    const hash = this.generateRequestHash(req);
    const cached = this.cache.get(hash);

    if (cached && Date.now() - cached.timestamp < cached.ttl * 1000) {
      cached.hitCount++;
      return { 
        isDuplicate: true, 
        cachedResponse: cached.response === undefined ? undefined : JSON.parse(JSON.stringify(cached.response))
      };
    }

    return { isDuplicate: false };
  }

  private cacheResponse(req: any, response: any): void {
    // Skip caching if response is undefined (e.g., from router function)
    if (response === undefined) {
      return;
    }
    
    const hash = this.generateRequestHash(req);
    
    if (this.cache.size >= this.config.deduplication.maxCacheSize) {
      const [oldestKey] = this.cache.keys();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      hash,
      response: JSON.parse(JSON.stringify(response)),
      timestamp: Date.now(),
      ttl: this.config.deduplication.ttlSeconds,
      hitCount: 1
    });
  }

  // ========================================================================================
  // RATE LIMITING & CIRCUIT BREAKER
  // ========================================================================================

  private checkRateLimit(req?: any): { limited: boolean; reason?: string; retryAfter?: number } {
    const now = Date.now();
    const sessionId = req?.sessionId || req?.ip || 'anonymous';

    this.cleanupRequestRecords(now);

    const sortedRules = Object.entries(this.config.rateLimiting.rules)
      .sort(([, ruleA], [, ruleB]) => ruleA.windowMs - ruleB.windowMs);

    for (const [ruleName, rule] of sortedRules) {
      const windowStart = now - rule.windowMs;
      const requestsInWindow = this.requestRecords.filter(r => 
        r.timestamp >= windowStart && 
        (r.sessionId === 'global' || r.sessionId === sessionId)
      );

      if (requestsInWindow.length >= rule.requests) {
        const oldestRequestInWindow = requestsInWindow.length > 0 ? requestsInWindow[0] : null;
        const retryAfter = oldestRequestInWindow 
          ? Math.ceil((oldestRequestInWindow.timestamp + rule.windowMs - now) / 1000)
          : Math.ceil(rule.windowMs / 1000);
        
        // NOTE: This now only acts as a potential trigger, the main logic is in executeWithRetry
        if (ruleName === 'burst' && this.config.circuitBreaker.enabled) {
          this.failureCount++;
          if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
            this.openCircuitBreaker();
          }
        }

        return {
          limited: true,
          reason: `${rule.requests} requests per ${this.formatWindowMs(rule.windowMs)}`,
          retryAfter: Math.max(0, retryAfter)
        };
      }
    }

    this.requestRecords.push({
      timestamp: now,
      sessionId,
      fingerprint: req ? this.generateRequestHash(req) : `req_${now}`
    });

    return { limited: false };
  }

  private openCircuitBreaker(): void {
    if (this.circuitBreakerState === 'OPEN') return;
    this.circuitBreakerState = 'OPEN';
    warn(`[ExecutionGuard] ⚡ Circuit breaker OPENED - blocking requests`);
    
    if (this.circuitBreakerTimer) clearTimeout(this.circuitBreakerTimer);
    
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerState = 'HALF_OPEN';
      info(`[ExecutionGuard] 🔄 Circuit breaker HALF-OPEN - testing recovery`);
    }, this.config.circuitBreaker.recoveryTimeMs);
  }

  private closeCircuitBreaker(): void {
    if (this.circuitBreakerState === 'CLOSED') return;
    this.circuitBreakerState = 'CLOSED';
    this.failureCount = 0;
    info(`[ExecutionGuard] ✅ Circuit breaker CLOSED - normal operation`);
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
  }

  // ========================================================================================
  // QUEUE MANAGEMENT
  // ========================================================================================

  private async enqueue<T>(
    fn: () => Promise<T>,
    context: { req?: any, providerName?: string | (() => string) }
  ): Promise<T> {
    if (this.queue.length >= this.config.queue.maxQueueSize) {
      throw new Error(`Queue full (${this.config.queue.maxQueueSize} items). Request rejected.`);
    }

    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
        resolve,
        reject,
        fn,
        req: context.req,
        providerName: context.providerName
      };

      this.queue.push(request);
      this.stats.totalRequests++;
      info(`[ExecutionGuard] Queued request (${request.id}). Queue size: ${this.queue.length}`);
      
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      try {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.queue.minDelayMs) {
          await this.sleep(this.config.queue.minDelayMs - timeSinceLastRequest);
        }

        this.lastRequestTime = Date.now();
        const startTime = Date.now();
        
        const actualProviderName = typeof request.providerName === 'function' ? request.providerName() : request.providerName;
        const result = await this.executeWithRetry(request.fn, request.req, actualProviderName);

        const waitTime = startTime - request.timestamp;
        
        this.stats.completedRequests++;
        this.stats.totalWaitTime += waitTime;
        
        request.resolve(result);
        
      } catch (err) {
        this.stats.failedRequests++;
        request.reject(err);
      }
    }

    this.processing = false;
  }

  // ========================================================================================
  // RETRY LOGIC WITH EXPONENTIAL BACKOFF
  // ========================================================================================

  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    req?: any,
    providerName?: string | (() => string)
  ): Promise<T> {
    let lastError: Error | undefined;

    if (this.circuitBreakerState === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
    }
    
    for (let attempt = 1; attempt <= this.config.retry.maxRetries + 1; attempt++) {
      try {
        const result = await requestFn();
        
        // On success, reset the failure count.
        this.failureCount = 0;
        
        if (this.config.deduplication.enabled && req) {
            const isExcluded = this.config.deduplication.excludeEndpoints.some(endpoint => req.url?.startsWith(endpoint));
            if (!isExcluded) {
                this.cacheResponse(req, result);
            }
        }
        
        if (this.circuitBreakerState === 'HALF_OPEN') {
          this.closeCircuitBreaker();
        }
        
        if (providerName) {
          const actualProviderName = typeof providerName === 'function' ? providerName() : providerName;
          this.recordProviderSuccess(actualProviderName);
        }
        
        if (attempt > 1) {
          this.stats.successAfterRetry++;
        }
        
        return result;
        
      } catch (err: any) {
        lastError = err;
        const status = err.status || err.response?.status;
        
        // FIX: Connect actual execution failures to the Circuit Breaker.
        if (this.config.circuitBreaker.enabled) {
          this.failureCount++;
          if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
            this.openCircuitBreaker();
          }
        }
        
        if (providerName) {
          const actualProviderName = typeof providerName === 'function' ? providerName() : providerName;
          this.recordProviderFailure(actualProviderName);
        }
        
        if (!this.isRetryableError(err) || attempt > this.config.retry.maxRetries) {
          this.stats.finalFailures++;
          throw err;
        }
        
        this.stats.retryAttempts++;
        
        const backoffTime = Math.min(
          this.config.retry.initialBackoffMs * Math.pow(2, attempt - 1),
          this.config.retry.maxBackoffMs
        );
        const jitter = Math.random() * this.config.retry.jitterMs;
        const waitTime = Math.round(backoffTime + jitter);
        
        warn(`[ExecutionGuard] Attempt ${attempt}/${this.config.retry.maxRetries+1} failed (${status}). Retrying in ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }

  private isRetryableError(error: any): boolean {
    // If error has no status, it's a code error, not a network one. Don't retry.
    if (error.status === undefined && error.response?.status === undefined) {
      return false;
    }
    const status = error.status || error.response?.status;
    return this.config.retry.retryableStatusCodes.includes(status);
  }

  // ========================================================================================
  // PROVIDER FALLBACK MANAGEMENT
  // ========================================================================================

  private recordProviderSuccess(providerName: string): void {
    const status = this.providerStatus.get(providerName) || {
        name: providerName,
        failureCount: 0,
        inRecovery: false,
        isOnline: true
    };
    status.failureCount = 0;
    status.inRecovery = false;
    status.isOnline = true;
    status.lastFailure = undefined;
    this.providerStatus.set(providerName, status);
  }

  private recordProviderFailure(providerName: string): void {
    const status = this.providerStatus.get(providerName) || {
      name: providerName,
      failureCount: 0,
      inRecovery: false,
      isOnline: true
    };
    
    status.lastFailure = Date.now();
    status.failureCount++;
    status.inRecovery = true;
    status.isOnline = false;
    
    this.providerStatus.set(providerName, status);
    
    setTimeout(() => {
      const currentStatus = this.providerStatus.get(providerName);
      if (currentStatus?.inRecovery) {
        currentStatus.inRecovery = false;
        this.providerStatus.set(providerName, currentStatus);
      }
    }, this.config.fallback.recoveryWindowMs);
  }

  public isProviderInRecovery(providerName: string): boolean {
    const status = this.providerStatus.get(providerName);
    return status ? status.inRecovery : false;
  }
  
  // ========================================================================================
    // STATISTICS & MONITORING
    // ========================================================================================

    public getStats(): ExecutionStats {
        const totalCached = this.cache.size;
        const totalDuplicates = Array.from(this.cache.values())
            .reduce((sum, cache) => sum + (cache.hitCount - 1), 0);

        return {
            deduplication: {
                totalCachedRequests: totalCached,
                totalDuplicateRequestsBlocked: totalDuplicates,
                cacheHitRate: (totalCached + totalDuplicates) > 0 ? (totalDuplicates / (totalCached + totalDuplicates)) : 0,
                memoryUsage: this.cache.size * 2048 
            },
            rateLimiting: {
                circuitBreakerState: this.circuitBreakerState,
                totalRequestsTracked: this.requestRecords.length,
                rulesUsage: this.getRulesUsage()
            },
            queue: {
                currentSize: this.queue.length,
                totalProcessed: this.stats.completedRequests,
                averageWaitTime: this.stats.completedRequests > 0 ?
                    (this.stats.totalWaitTime / this.stats.completedRequests) : 0,
                processing: this.processing
            },
            retry: {
                totalRetries: this.stats.retryAttempts,
                successAfterRetry: this.stats.successAfterRetry,
                finalFailures: this.stats.finalFailures
            },
            providers: Object.fromEntries(this.providerStatus)
        };
    }

    private getRulesUsage(): { [ruleName: string]: any } {
        const now = Date.now();
        const usage: any = {};

        for (const [ruleName, rule] of Object.entries(this.config.rateLimiting.rules)) {
            const windowStart = now - rule.windowMs;
            const requestsInWindow = this.requestRecords.filter(r => r.timestamp >= windowStart).length;

            usage[`${ruleName}Usage`] = {
                current: requestsInWindow,
                limit: rule.requests,
                percentage: rule.requests > 0 ? Math.round((requestsInWindow / rule.requests) * 100) : 0,
                windowMs: rule.windowMs
            };
        }

        return usage;
    }

    // ========================================================================================
    // CONFIGURATION & UTILITIES
    // ========================================================================================

    public updateConfig(newConfig: Partial<ExecutionGuardConfig>): void {
        this.config = this.mergeWithDefaults(newConfig);
    }

    public getConfig(): ExecutionGuardConfig {
        return { ...this.config };
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public clearAllRecords(): void {
        this.cache.clear();
        this.requestRecords = [];
        this.queue = [];
        this.providerStatus.clear();
    }

    public resetCircuitBreaker(): void {
        this.closeCircuitBreaker();
    }

    private cleanup(): void {
        const now = Date.now();

        const expiredHashes: string[] = [];
        this.cache.forEach((cached, hash) => {
            if (now - cached.timestamp > cached.ttl * 1000) {
                expiredHashes.push(hash);
            }
        });
        expiredHashes.forEach(hash => this.cache.delete(hash));

        this.cleanupRequestRecords(now);

        if (this.config.persistence.enabled) {
            this.savePersistedData();
        }
    }

    private cleanupRequestRecords(now: number): void {
        const maxWindow = Math.max(
            ...Object.values(this.config.rateLimiting.rules).map(r => r.windowMs)
        );

        const cutoff = now - maxWindow;
        if (this.requestRecords.length > 0 && this.requestRecords[0].timestamp < cutoff) {
          this.requestRecords = this.requestRecords.filter(r => r.timestamp >= cutoff);
        }
    }

    private formatWindowMs(windowMs: number): string {
        if (windowMs < 1000) return `${windowMs}ms`;
        if (windowMs < 60000) return `${windowMs / 1000}s`;
        if (windowMs < 3600000) return `${windowMs / 60000}m`;
        if (windowMs < 86400000) return `${windowMs / 3600000}h`;
        return `${windowMs / 86400000}d`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================================================================
    // PERSISTENCE
    // ========================================================================================

    private loadPersistedData(): void {
        try {
            if (existsSync(this.dataFile)) {
                const data = JSON.parse(readFileSync(this.dataFile, 'utf8'));
                const now = Date.now();

                if (data.cache) {
                    for (const [hash, cached] of Object.entries(data.cache)) {
                        const cacheEntry = cached as RequestCache;
                        if (now - cacheEntry.timestamp < cacheEntry.ttl * 1000) {
                            this.cache.set(hash, cacheEntry);
                        }
                    }
                }

                if (data.providers) {
                    for (const [name, status] of Object.entries(data.providers)) {
                        this.providerStatus.set(name, status as ProviderStatus);
                    }
                }

                info(`[ExecutionGuard] Loaded persisted data: ${this.cache.size} cache entries, ${this.providerStatus.size} provider statuses`);
            }
        } catch (err: any) {
            error(`[ExecutionGuard] Error loading persisted data: ${err.message}`);
        }
    }

    private savePersistedData(): void {
        try {
            const data = {
                cache: Object.fromEntries(this.cache),
                providers: Object.fromEntries(this.providerStatus),
                stats: this.stats,
                timestamp: Date.now()
            };

            writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (err: any) {
            error(`[ExecutionGuard] Error saving persisted data: ${err.message}`);
        }
    }

    private mergeWithDefaults(config?: Partial<ExecutionGuardConfig>): ExecutionGuardConfig {
      const defaultConfig: ExecutionGuardConfig = {
        deduplication: { enabled: true, ttlSeconds: 30, maxCacheSize: 1000, excludeEndpoints: ['/api/analytics'] },
        rateLimiting: { enabled: true, rules: { perMinute: { requests: 60, windowMs: 60000 }, perHour: { requests: 500, windowMs: 3600000 }, perDay: { requests: 5000, windowMs: 86400000 }, burst: { requests: 10, windowMs: 10000 }}},
        circuitBreaker: { enabled: true, failureThreshold: 20, recoveryTimeMs: 60000 },
        queue: { enabled: true, minDelayMs: 1000, maxQueueSize: 100 },
        retry: { enabled: true, maxRetries: 5, initialBackoffMs: 1000, maxBackoffMs: 30000, jitterMs: 500, retryableStatusCodes: [429, 500, 502, 503, 504] },
        fallback: { enabled: true, recoveryWindowMs: 60000 },
        persistence: { enabled: true, dataFile: join(homedir(), '.claude-code-router', 'execution-guard.json') }
      };
  
      const mergedConfig = JSON.parse(JSON.stringify(defaultConfig));
      if (config) {
        for (const key in config) {
          const k = key as keyof ExecutionGuardConfig;
          if (config[k] && typeof config[k] === 'object' && !Array.isArray(config[k])) {
            mergedConfig[k] = { ...mergedConfig[k], ...config[k] };
          } else if(config[k] !== undefined) {
            mergedConfig[k] = config[k];
          }
        }
      }
      return mergedConfig;
    }
}

// ========================================================================================
// SINGLETON EXPORT & CONVENIENCE FUNCTIONS
// ========================================================================================

export const executionGuard = new ExecutionGuard();

export async function guardedExecute<T>(
  requestFn: () => Promise<T>,
  context?: {
    req?: any;
    keyId?: string;
    providerName?: string | (() => string);
    skipDeduplication?: boolean;
    skipQueue?: boolean;
  }
): Promise<T> {
  // Adaugă log pentru detectarea scurgerilor
  const providerName = typeof context?.providerName === 'function' ? context.providerName() : context?.providerName;
  info(`🔒 GUARDED EXECUTE CALLED at ${new Date().toISOString()} for provider: ${providerName || 'unknown'}`);
  return executionGuard.execute(requestFn, context);
}

export function canMakeRequest(req?: any): boolean {
  const guard = executionGuard as any; 
  const result = guard.checkRateLimit(req);
  return !result.limited;
}

export function isProviderHealthy(providerName: string): boolean {
  return !executionGuard.isProviderInRecovery(providerName);
}