interface RateLimitRule {
  requests: number;
  windowMs: number;
  burstAllowed?: number;
}

interface RateLimitConfig {
  enabled: boolean;
  rules: {
    perMinute: RateLimitRule;
    perHour: RateLimitRule;
    perDay: RateLimitRule;
    burst: RateLimitRule;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number; // requests
    recoveryTimeMs: number;
  };
}

interface RequestRecord {
  timestamp: number;
  sessionId: string;
}

/**
 * Rate Limiter & Circuit Breaker for Claude Code Router
 * 
 * SOLUTION FOR: Excessive API consumption from multiple internal requests
 * 
 * FEATURES:
 * 1. Multi-tier rate limiting (per minute, hour, day)
 * 2. Burst protection for rapid-fire requests
 * 3. Circuit breaker to stop flood patterns
 * 4. Session-based and global limits
 * 5. Configurable through UI
 */
export class RateLimiter {
  private requests: RequestRecord[] = [];
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private failureCount = 0;
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      enabled: true,
      rules: {
        perMinute: { requests: 60, windowMs: 60000 }, // 60 requests per minute
        perHour: { requests: 500, windowMs: 3600000 }, // 500 requests per hour
        perDay: { requests: 5000, windowMs: 86400000 }, // 5000 requests per day
        burst: { requests: 10, windowMs: 10000 } // Max 10 requests in 10 seconds
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 20, // Open circuit after 20 rapid requests
        recoveryTimeMs: 60000 // Try recovery after 1 minute
      },
      ...config
    };
  }

  /**
   * Check if request should be rate limited
   */
  shouldLimit(req: any): { limited: boolean; reason?: string; retryAfter?: number } {
    if (!this.config.enabled) {
      return { limited: false };
    }

    // Circuit breaker check first
    if (this.circuitBreakerState === 'OPEN') {
      return { 
        limited: true, 
        reason: 'Circuit breaker is OPEN - too many rapid requests detected',
        retryAfter: Math.ceil((this.config.circuitBreaker.recoveryTimeMs) / 1000)
      };
    }

    const now = Date.now();
    const sessionId = req.sessionId || req.ip || 'anonymous';

    // Clean old requests
    this.cleanup(now);

    // Check each rate limit rule
    for (const [ruleName, rule] of Object.entries(this.config.rules)) {
      const windowStart = now - rule.windowMs;
      const requestsInWindow = this.requests.filter(r => 
        r.timestamp >= windowStart && (sessionId === 'global' || r.sessionId === sessionId)
      ).length;

      if (requestsInWindow >= rule.requests) {
        const retryAfter = Math.ceil((rule.windowMs - (now - windowStart)) / 1000);
        
        // Trigger circuit breaker if burst limit exceeded
        if (ruleName === 'burst' && this.config.circuitBreaker.enabled) {
          this.failureCount++;
          if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
            this.openCircuitBreaker();
          }
        }

        return {
          limited: true,
          reason: `Rate limit exceeded: ${rule.requests} requests per ${this.formatWindowMs(rule.windowMs)}`,
          retryAfter
        };
      }
    }

    // Record this request
    this.requests.push({
      timestamp: now,
      sessionId
    });

    // Half-open circuit breaker test
    if (this.circuitBreakerState === 'HALF_OPEN') {
      this.closeCircuitBreaker();
    }

    return { limited: false };
  }

  /**
   * Open circuit breaker
   */
  private openCircuitBreaker(): void {
    this.circuitBreakerState = 'OPEN';
    console.warn('⚡ Circuit breaker OPENED - blocking requests to prevent API flood');
    
    // Set recovery timer
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }
    
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerState = 'HALF_OPEN';
      this.failureCount = 0;
      console.log('🔄 Circuit breaker HALF-OPEN - testing recovery');
    }, this.config.circuitBreaker.recoveryTimeMs);
  }

  /**
   * Close circuit breaker
   */
  private closeCircuitBreaker(): void {
    this.circuitBreakerState = 'CLOSED';
    this.failureCount = 0;
    console.log('✅ Circuit breaker CLOSED - normal operation restored');
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
  }

  /**
   * Get current rate limiting statistics
   */
  getStats() {
    const now = Date.now();
    const stats: any = {
      circuitBreakerState: this.circuitBreakerState,
      failureCount: this.failureCount,
      totalRequestsTracked: this.requests.length
    };

    // Calculate current usage for each rule
    for (const [ruleName, rule] of Object.entries(this.config.rules)) {
      const windowStart = now - rule.windowMs;
      const requestsInWindow = this.requests.filter(r => r.timestamp >= windowStart).length;
      
      stats[`${ruleName}Usage`] = {
        current: requestsInWindow,
        limit: rule.requests,
        percentage: Math.round((requestsInWindow / rule.requests) * 100),
        windowMs: rule.windowMs
      };
    }

    return stats;
  }

  /**
   * Check if a request can be made (simple boolean check)
   */
  canMakeRequest(req?: any): boolean {
    const limitResult = this.shouldLimit(req || {});
    return !limitResult.limited;
  }
  
  /**
   * Record a successful request
   */
  recordSuccess(req?: any): void {
    const sessionId = req?.sessionId || req?.ip || 'anonymous';
    this.requests.push({
      timestamp: Date.now(),
      sessionId
    });
    
    // Reset failure count on success
    if (this.failureCount > 0) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }
  
  /**
   * Record a failed request
   */
  recordFailure(req?: any): void {
    this.failureCount++;
    
    // Open circuit breaker if too many failures
    if (this.circuitBreakerState === 'CLOSED' && 
        this.failureCount >= this.config.circuitBreaker.failureThreshold) {
      this.openCircuitBreaker();
    }
  }

  /**
   * Manual circuit breaker control
   */
  resetCircuitBreaker(): void {
    this.closeCircuitBreaker();
    this.requests = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clean up old requests
   */
  private cleanup(now: number): void {
    const maxWindow = Math.max(
      this.config.rules.perMinute.windowMs,
      this.config.rules.perHour.windowMs,
      this.config.rules.perDay.windowMs,
      this.config.rules.burst.windowMs
    );
    
    this.requests = this.requests.filter(r => now - r.timestamp < maxWindow);
  }

  /**
   * Format time window for human reading
   */
  private formatWindowMs(windowMs: number): string {
    if (windowMs < 60000) return `${windowMs/1000}s`;
    if (windowMs < 3600000) return `${windowMs/60000}m`;
    if (windowMs < 86400000) return `${windowMs/3600000}h`;
    return `${windowMs/86400000}d`;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();