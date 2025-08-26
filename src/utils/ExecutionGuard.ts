/**
 * ExecutionGuard - Unified Traffic Control & Request Management System
 * 
 * CONSOLIDATES: request-deduplication, ai-request-controller, request-queue, 
 * provider-fallback, fetch-interceptor, rate-limiter
 * 
 * EXCLUDES: dynamic-provider-detector (manual provider control required)
 * 
 * FEATURES:
 * 1. Advanced Request Deduplication with SHA256 fingerprinting
 * 2. Multi-tier Rate Limiting (per minute/hour/day + burst protection)
 * 3. Circuit Breaker for flood prevention
 * 4. Queue Management with controlled traffic flow
 * 5. Retry Logic with Exponential Backoff
 * 6. Provider Fallback (manual control)
 * 7. Comprehensive Analytics & Monitoring
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
  // Deduplication
  deduplication: {
    enabled: boolean;
    ttlSeconds: number;
    maxCacheSize: number;
    excludeEndpoints: string[];
  };
  
  // Rate Limiting
  rateLimiting: {
    enabled: boolean;
    rules: {
      perMinute: RateLimitRule;
      perHour: RateLimitRule; 
      perDay: RateLimitRule;
      burst: RateLimitRule;
    };
  };
  
  // Circuit Breaker
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeMs: number;
  };
  
  // Queue Management
  queue: {
    enabled: boolean;
    minDelayMs: number;
    maxQueueSize: number;
  };
  
  // Retry Logic
  retry: {
    enabled: boolean;
    maxRetries: number;
    initialBackoffMs: number;
    maxBackoffMs: number;
    jitterMs: number;
    retryableStatusCodes: number[];
  };
  
  // Provider Fallback
  fallback: {
    enabled: boolean;
    recoveryWindowMs: number;
  };
  
  // Persistence
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
  keyId: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  fn: () => Promise<any>;
  context?: string;
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
}

export interface ExecutionStats {
  // Deduplication
  deduplication: {
    totalCachedRequests: number;
    totalDuplicateRequestsBlocked: number;
    cacheHitRate: number;
    memoryUsage: number;
  };
  
  // Rate Limiting
  rateLimiting: {
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    totalRequestsTracked: number;
    rulesUsage: { [ruleName: string]: any };
  };
  
  // Queue
  queue: {
    currentSize: number;
    totalProcessed: number;
    averageWaitTime: number;
    processing: boolean;
  };
  
  // Retry
  retry: {
    totalRetries: number;
    successAfterRetry: number;
    finalFailures: number;
  };
  
  // Provider Status
  providers: { [providerName: string]: ProviderStatus };
}

// ========================================================================================
// MAIN EXECUTION GUARD CLASS
// ========================================================================================

export class ExecutionGuard {
  // Core components
  private cache = new Map<string, RequestCache>();
  private requestRecords: RequestRecord[] = [];
  private queue: QueuedRequest[] = [];
  private providerStatus = new Map<string, ProviderStatus>();
  
  // State management
  private processing = false;
  private lastRequestTime = 0;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private failureCount = 0;
  
  // Configuration
  private config: ExecutionGuardConfig;
  private dataFile: string;
  
  // Statistics
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
    
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  // ========================================================================================
  // MAIN EXECUTION METHOD
  // ========================================================================================

  /**
   * Main execution method - handles the complete request lifecycle
   */
  async execute<T>(
    requestFn: () => Promise<T>,
    context: {
      req?: any;
      keyId?: string;
      providerName?: string;
      skipDeduplication?: boolean;
      skipQueue?: boolean;
    } = {}
  ): Promise<T> {
    const { req, keyId = 'default', providerName, skipDeduplication, skipQueue } = context;
    
    // Step 1: Rate limiting check
    if (this.config.rateLimiting.enabled) {
      const rateLimitResult = this.checkRateLimit(req);
      if (rateLimitResult.limited) {
        throw new Error(`Rate limit exceeded: ${rateLimitResult.reason}. Retry after ${rateLimitResult.retryAfter}s`);
      }
    }
    
    // Step 2: Circuit breaker check
    if (this.circuitBreakerState === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
    }
    
    // Step 3: Deduplication check
    if (this.config.deduplication.enabled && !skipDeduplication && req) {
      const dedupResult = this.checkDeduplication(req);
      if (dedupResult.isDuplicate) {
        info(`[ExecutionGuard] Request deduplicated, returning cached response`);
        return dedupResult.cachedResponse;
      }
    }
    
    // Step 4: Queue or execute directly
    if (this.config.queue.enabled && !skipQueue) {
      return this.enqueue(requestFn, keyId, 'execution');
    } else {
      return this.executeWithRetry(requestFn, req, providerName);
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
      // Round timestamp to 5-second windows to group rapid requests
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
        cachedResponse: JSON.parse(JSON.stringify(cached.response))
      };
    }

    return { isDuplicate: false };
  }

  private cacheResponse(req: any, response: any): void {
    const hash = this.generateRequestHash(req);
    
    // Respect cache size limits
    if (this.cache.size >= this.config.deduplication.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
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

    // Check each rate limit rule
    for (const [ruleName, rule] of Object.entries(this.config.rateLimiting.rules)) {
      const windowStart = now - rule.windowMs;
      const requestsInWindow = this.requestRecords.filter(r => 
        r.timestamp >= windowStart && 
        (sessionId === 'global' || r.sessionId === sessionId)
      ).length;

      if (requestsInWindow >= rule.requests) {
        const retryAfter = Math.ceil(rule.windowMs / 1000);
        
        // Trigger circuit breaker if burst limit exceeded
        if (ruleName === 'burst' && this.config.circuitBreaker.enabled) {
          this.failureCount++;
          if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
            this.openCircuitBreaker();
          }
        }

        return {
          limited: true,
          reason: `${rule.requests} requests per ${this.formatWindowMs(rule.windowMs)}`,
          retryAfter
        };
      }
    }

    // Record this request
    this.requestRecords.push({
      timestamp: now,
      sessionId,
      fingerprint: req ? this.generateRequestHash(req) : `req_${now}`
    });

    return { limited: false };
  }

  private openCircuitBreaker(): void {
    this.circuitBreakerState = 'OPEN';
    warn(`[ExecutionGuard] ⚡ Circuit breaker OPENED - blocking requests`);
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }
    
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerState = 'HALF_OPEN';
      this.failureCount = 0;
      info(`[ExecutionGuard] 🔄 Circuit breaker HALF-OPEN - testing recovery`);
    }, this.config.circuitBreaker.recoveryTimeMs);
  }

  private closeCircuitBreaker(): void {
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
    keyId: string,
    context: string = 'request'
  ): Promise<T> {
    if (this.queue.length >= this.config.queue.maxQueueSize) {
      throw new Error(`Queue full (${this.config.queue.maxQueueSize} items). Request rejected.`);
    }

    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now(),
        keyId,
        resolve,
        reject,
        fn,
        context
      };

      this.queue.push(request);
      this.stats.totalRequests++;
      info(`[ExecutionGuard] Queued ${context} (${request.id}). Queue size: ${this.queue.length}`);
      
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
        // Ensure minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.queue.minDelayMs) {
          const delayNeeded = this.config.queue.minDelayMs - timeSinceLastRequest;
          await this.sleep(delayNeeded);
        }

        this.lastRequestTime = Date.now();
        const startTime = Date.now();
        
        const result = await request.fn();
        const waitTime = startTime - request.timestamp;
        
        this.stats.completedRequests++;
        this.stats.totalWaitTime += waitTime;
        
        request.resolve(result);
        
      } catch (error) {
        this.stats.failedRequests++;
        request.reject(error);
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
    providerName?: string
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.retry.maxRetries + 1; attempt++) {
      try {
        const result = await requestFn();
        
        // Cache successful response if deduplication enabled
        if (this.config.deduplication.enabled && req) {
          this.cacheResponse(req, result);
        }
        
        // Record success for circuit breaker
        if (this.circuitBreakerState === 'HALF_OPEN') {
          this.closeCircuitBreaker();
        }
        
        // Record provider success
        if (providerName) {
          this.recordProviderSuccess(providerName);
        }
        
        if (attempt > 1) {
          this.stats.successAfterRetry++;
        }
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.response?.status;
        
        // Record provider failure
        if (providerName) {
          this.recordProviderFailure(providerName);
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt > this.config.retry.maxRetries) {
          this.stats.finalFailures++;
          throw error;
        }
        
        this.stats.retryAttempts++;
        
        // Calculate backoff time
        const backoffTime = Math.min(
          this.config.retry.initialBackoffMs * Math.pow(2, attempt - 1),
          this.config.retry.maxBackoffMs
        );
        const jitter = Math.random() * this.config.retry.jitterMs;
        const waitTime = Math.round(backoffTime + jitter);
        
        warn(`[ExecutionGuard] Attempt ${attempt}/${this.config.retry.maxRetries} failed (${status}). Retrying in ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }

  private isRetryableError(error: any): boolean {
    const status = error.status || error.response?.status;
    return this.config.retry.retryableStatusCodes.includes(status);
  }

  // ========================================================================================
  // PROVIDER FALLBACK MANAGEMENT
  // ========================================================================================

  private recordProviderSuccess(providerName: string): void {
    this.providerStatus.delete(providerName);
  }

  private recordProviderFailure(providerName: string): void {
    const status = this.providerStatus.get(providerName) || {
      name: providerName,
      failureCount: 0,
      inRecovery: false
    };
    
    status.lastFailure = Date.now();
    status.failureCount++;
    status.inRecovery = true;
    
    this.providerStatus.set(providerName, status);
    
    // Clear recovery flag after window
    setTimeout(() => {
      const currentStatus = this.providerStatus.get(providerName);
      if (currentStatus) {
        currentStatus.inRecovery = false;
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
        cacheHitRate: totalCached > 0 ? (totalDuplicates / (totalCached + totalDuplicates)) : 0,
        memoryUsage: this.cache.size * 1024
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
        percentage: Math.round((requestsInWindow / rule.requests) * 100),
        windowMs: rule.windowMs
      };
    }

    return usage;
  }

  // ========================================================================================
  // CONFIGURATION & UTILITIES
  // ========================================================================================

  public updateConfig(newConfig: Partial<ExecutionGuardConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public clearCache(): void {
    this.cache.clear();
    this.requestRecords = [];
    this.queue = [];
    this.providerStatus.clear();
  }

  public resetCircuitBreaker(): void {
    this.closeCircuitBreaker();
    this.failureCount = 0;
  }

  private cleanup(): void {
    const now = Date.now();
    
    // Cleanup expired cache entries
    const expiredHashes: string[] = [];
    this.cache.forEach((cached, hash) => {
      if (now - cached.timestamp > cached.ttl * 1000) {
        expiredHashes.push(hash);
      }
    });
    expiredHashes.forEach(hash => this.cache.delete(hash));
    
    // Cleanup old request records
    this.cleanupRequestRecords(now);
    
    // Save data if persistence enabled
    if (this.config.persistence.enabled) {
      this.savePersistedData();
    }
  }

  private cleanupRequestRecords(now: number): void {
    const maxWindow = Math.max(
      this.config.rateLimiting.rules.perMinute.windowMs,
      this.config.rateLimiting.rules.perHour.windowMs,
      this.config.rateLimiting.rules.perDay.windowMs,
      this.config.rateLimiting.rules.burst.windowMs
    );
    
    this.requestRecords = this.requestRecords.filter(r => now - r.timestamp < maxWindow);
  }

  private formatWindowMs(windowMs: number): string {
    if (windowMs < 60000) return `${windowMs/1000}s`;
    if (windowMs < 3600000) return `${windowMs/60000}m`;
    if (windowMs < 86400000) return `${windowMs/3600000}h`;
    return `${windowMs/86400000}d`;
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
        
        // Restore cache (validate TTL)
        const now = Date.now();
        for (const [hash, cached] of Object.entries(data.cache || {})) {
          const cacheEntry = cached as RequestCache;
          if (now - cacheEntry.timestamp < cacheEntry.ttl * 1000) {
            this.cache.set(hash, cacheEntry);
          }
        }
        
        // Restore provider status
        if (data.providers) {
          for (const [name, status] of Object.entries(data.providers)) {
            this.providerStatus.set(name, status as ProviderStatus);
          }
        }
        
        info(`[ExecutionGuard] Loaded persisted data: ${this.cache.size} cache entries, ${this.providerStatus.size} provider statuses`);
      }
    } catch (error: any) {
      error(`[ExecutionGuard] Error loading persisted data: ${error.message}`);
    }
  }

  private savePersistedData(): void {
    try {
      const cacheEntries: Array<[string, RequestCache]> = [];
      this.cache.forEach((value, key) => {
        cacheEntries.push([key, value]);
      });
      
      const providerEntries: Array<[string, ProviderStatus]> = [];
      this.providerStatus.forEach((value, key) => {
        providerEntries.push([key, value]);
      });
      
      const data = {
        cache: Object.fromEntries(cacheEntries),
        providers: Object.fromEntries(providerEntries),
        stats: this.stats,
        timestamp: Date.now()
      };
      
      writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error: any) {
      error(`[ExecutionGuard] Error saving persisted data: ${error.message}`);
    }
  }

  private mergeWithDefaults(config?: Partial<ExecutionGuardConfig>): ExecutionGuardConfig {
    return {
      deduplication: {
        enabled: true,
        ttlSeconds: 30,
        maxCacheSize: 1000,
        excludeEndpoints: ['/api/analytics', '/ui/', '/api/test'],
        ...(config?.deduplication || {})
      },
      rateLimiting: {
        enabled: true,
        rules: {
          perMinute: { requests: 60, windowMs: 60000 },
          perHour: { requests: 500, windowMs: 3600000 },
          perDay: { requests: 5000, windowMs: 86400000 },
          burst: { requests: 10, windowMs: 10000 }
        },
        ...(config?.rateLimiting || {})
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 20,
        recoveryTimeMs: 60000,
        ...(config?.circuitBreaker || {})
      },
      queue: {
        enabled: true,
        minDelayMs: 1000,
        maxQueueSize: 100,
        ...(config?.queue || {})
      },
      retry: {
        enabled: true,
        maxRetries: 5,
        initialBackoffMs: 1000,
        maxBackoffMs: 30000,
        jitterMs: 500,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        ...(config?.retry || {})
      },
      fallback: {
        enabled: true,
        recoveryWindowMs: 60000,
        ...(config?.fallback || {})
      },
      persistence: {
        enabled: true,
        dataFile: join(homedir(), '.claude-code-router', 'execution-guard.json'),
        ...(config?.persistence || {})
      }
    };
  }
}

// ========================================================================================
// SINGLETON EXPORT
// ========================================================================================

export const executionGuard = new ExecutionGuard();

// ========================================================================================
// CONVENIENCE FUNCTIONS
// ========================================================================================

/**
 * Execute a request with full ExecutionGuard protection
 */
export async function guardedExecute<T>(
  requestFn: () => Promise<T>,
  context?: {
    req?: any;
    keyId?: string;
    providerName?: string;
    skipDeduplication?: boolean;
    skipQueue?: boolean;
  }
): Promise<T> {
  return executionGuard.execute(requestFn, context);
}

/**
 * Quick rate limit check
 */
export function canMakeRequest(req?: any): boolean {
  const guard = executionGuard as any;
  const result = guard.checkRateLimit(req);
  return !result.limited;
}

/**
 * Check if provider is in recovery
 */
export function isProviderHealthy(providerName: string): boolean {
  return !executionGuard.isProviderInRecovery(providerName);
}