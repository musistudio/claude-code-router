import { createHash } from 'crypto';

interface RequestCache {
  hash: string;
  response: any;
  timestamp: number;
  ttl: number;
}

interface RequestDeduplicationConfig {
  enabled: boolean;
  ttlSeconds: number; // Time to live for cached responses
  maxCacheSize: number;
  excludeEndpoints: string[];
}

/**
 * Request Deduplication Service
 * 
 * PROBLEM SOLVED: Claude Code multiple internal requests
 * 
 * ROOT CAUSES IDENTIFIED:
 * 1. Multiple preHandler hooks in index.ts execute for same /v1/messages request
 * 2. @musistudio/llms has internal preHandler that processes body/model parsing
 * 3. Router middleware can trigger multiple times if custom router calls LLM
 * 4. Analytics hooks may cause additional processing
 * 5. Session cache processing can duplicate token calculations
 * 
 * SOLUTION: Smart request deduplication with fingerprinting
 */
export class RequestDeduplicationService {
  private cache = new Map<string, RequestCache>();
  private requestCounts = new Map<string, number>();
  private config: RequestDeduplicationConfig;

  constructor(config: RequestDeduplicationConfig) {
    this.config = {
      enabled: true,
      ttlSeconds: 30, // 30 seconds cache for identical requests
      maxCacheSize: 1000,
      excludeEndpoints: ['/api/analytics', '/ui/', '/api/test'],
      ...config
    };
    
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Generate unique fingerprint for request
   * Includes: body content, headers, user session, timestamp window
   */
  private generateRequestHash(req: any): string {
    const { body, headers, url, method } = req;
    
    // Create fingerprint from essential request data
    const fingerprint = {
      url: url || '',
      method: method || 'POST',
      body: typeof body === 'object' ? JSON.stringify(body) : body || '',
      userAgent: headers['user-agent'] || '',
      sessionId: req.sessionId || 'anonymous',
      // Round timestamp to 5-second windows to group rapid requests
      timeWindow: Math.floor(Date.now() / 5000) * 5000
    };

    return createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex');
  }

  /**
   * Check if request is duplicate and should be cached
   */
  isDuplicateRequest(req: any): { isDuplicate: boolean; cachedResponse?: any } {
    if (!this.config.enabled) {
      return { isDuplicate: false };
    }

    // Skip deduplication for excluded endpoints
    if (this.config.excludeEndpoints.some(endpoint => req.url?.startsWith(endpoint))) {
      return { isDuplicate: false };
    }

    const hash = this.generateRequestHash(req);
    const cached = this.cache.get(hash);

    if (cached && Date.now() - cached.timestamp < cached.ttl * 1000) {
      // Increment duplicate count for monitoring
      const currentCount = this.requestCounts.get(hash) || 0;
      this.requestCounts.set(hash, currentCount + 1);
      
      return { 
        isDuplicate: true, 
        cachedResponse: cached.response 
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Cache successful response for future duplicate requests
   */
  cacheResponse(req: any, response: any): void {
    if (!this.config.enabled) return;

    const hash = this.generateRequestHash(req);
    
    // Respect cache size limits
    if (this.cache.size >= this.config.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.requestCounts.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      hash,
      response: JSON.parse(JSON.stringify(response)), // Deep copy
      timestamp: Date.now(),
      ttl: this.config.ttlSeconds
    });
  }

  /**
   * Get statistics about duplicate requests
   */
  getDeduplicationStats() {
    const totalCached = this.cache.size;
    const totalDuplicates = Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0);
    const avgDuplicatesPerRequest = totalCached > 0 ? totalDuplicates / totalCached : 0;

    return {
      totalCachedRequests: totalCached,
      totalDuplicateRequestsBlocked: totalDuplicates,
      avgDuplicatesPerRequest,
      cacheHitRate: totalDuplicates > 0 ? (totalDuplicates / (totalCached + totalDuplicates)) : 0,
      memoryUsage: this.cache.size * 1024 // Rough estimate in bytes
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.requestCounts.clear();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [hash, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl * 1000) {
        this.cache.delete(hash);
        this.requestCounts.delete(hash);
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RequestDeduplicationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Singleton instance
export const requestDeduplicationService = new RequestDeduplicationService({
  enabled: true,
  ttlSeconds: 30,
  maxCacheSize: 1000,
  excludeEndpoints: ['/api/analytics', '/ui/', '/api/test']
});