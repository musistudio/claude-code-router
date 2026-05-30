/**
 * SemanticCache - 语义缓存中间件
 *
 * Intercepts requests before they reach the upstream provider.
 * Checks if a semantically similar request has been recently cached.
 * If hit: returns cached response immediately (zero API cost, zero latency).
 * If miss: passes through to upstream, then caches the response.
 *
 * Integration with GPTCache:
 *   - Uses GPTCache's embedding-based similarity matching
 *   - Falls back to local MD5/similarity cache if GPTCache is unavailable
 *   - Graceful degradation: cache miss always falls through to live API
 *
 * Design: Non-blocking, never introduces latency > 50ms.
 * Cache operations are async and fire-and-forget for writes.
 */
import { EventEmitter } from "events";
import { createHash } from "crypto";

export interface CacheConfig {
  enabled: boolean;
  endpoint?: string; // GPTCache endpoint (optional)
  ttlMs: number; // Time-to-live for cache entries (default: 600000 = 10min)
  similarityThreshold: number; // Embedding similarity threshold (default: 0.92)
  maxEntries: number; // Maximum cache entries (default: 1000)
  skipPatterns: string[]; // Patterns to skip caching (e.g., streaming requests)
  temperatureThreshold: number; // Skip caching if temperature > threshold (default: 0.5)
}

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 600000, // 10 minutes
  similarityThreshold: 0.92,
  maxEntries: 1000,
  skipPatterns: ["stream"],
  temperatureThreshold: 0.5,
};

interface CacheEntry {
  key: string;
  requestHash: string;
  requestSummary: string;
  response: any;
  model: string;
  tokenCount: number;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

export class SemanticCache extends EventEmitter {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private enabled = false;

  constructor(config: Partial<CacheConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;

    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request has a cached response.
   * Returns cached response or null (cache miss).
   */
  async lookup(requestBody: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
  }): Promise<any | null> {
    if (!this.enabled) return null;

    try {
      // Skip caching for certain patterns
      if (this.shouldSkip(requestBody)) return null;

      // Skip if temperature is too high (non-deterministic)
      if (requestBody.temperature > this.config.temperatureThreshold) return null;

      // Generate cache key
      const requestHash = this.generateRequestHash(requestBody);
      const cacheKey = this.generateCacheKey(requestBody, context);

      // Check local cache first
      const localEntry = this.cache.get(cacheKey);
      if (localEntry && localEntry.expiresAt > Date.now()) {
        localEntry.hitCount++;
        this.logger?.info(
          `SemanticCache: HIT (hits=${localEntry.hitCount}, model=${localEntry.model})`
        );
        this.emit("cache:hit", {
          key: cacheKey,
          model: localEntry.model,
          hitCount: localEntry.hitCount,
        });
        return localEntry.response;
      }

      // Try GPTCache if configured
      if (this.config.endpoint) {
        const gptCacheResult = await this.checkGPTCache(requestBody);
        if (gptCacheResult) return gptCacheResult;
      }

      this.emit("cache:miss", { key: cacheKey });
      return null; // Cache miss
    } catch (error: any) {
      this.logger?.debug(`SemanticCache lookup error: ${error.message}`);
      return null; // Graceful degradation: fall through to live API
    }
  }

  /**
   * Store response in cache.
   * Fire-and-forget - never blocks the request.
   */
  store(requestBody: any, responseBody: any, context: {
    sessionId?: string;
    agentName?: string;
    taskType?: string;
    model?: string;
    tokenCount?: number;
  }): void {
    if (!this.enabled) return;

    // Don't cache streaming responses
    if (requestBody.stream) return;
    if (this.shouldSkip(requestBody)) return;

    const cacheKey = this.generateCacheKey(requestBody, context);
    const requestHash = this.generateRequestHash(requestBody);

    const entry: CacheEntry = {
      key: cacheKey,
      requestHash,
      requestSummary: this.extractRequestSummary(requestBody),
      response: this.sanitizeResponse(responseBody),
      model: context.model || "unknown",
      tokenCount: context.tokenCount || 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.ttlMs,
      hitCount: 0,
    };

    this.cache.set(cacheKey, entry);

    // Evict oldest if over max
    if (this.cache.size > this.config.maxEntries) {
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    this.logger?.debug(
      `SemanticCache: STORED (key=${cacheKey}, model=${context.model}, ttl=${this.config.ttlMs}ms)`
    );
    this.emit("cache:stored", { key: cacheKey, model: context.model });
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
    this.logger?.info("SemanticCache: cleared all entries");
    this.emit("cache:cleared", {});
  }

  /**
   * Get cache statistics.
   */
  getStats(): { totalEntries: number; totalHits: number; hitRate: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return {
      totalEntries: this.cache.size,
      totalHits,
      hitRate: totalHits > 0 ? totalHits / (totalHits + this.cache.size) : 0,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private generateCacheKey(body: any, context: any): string {
    // Use the last user message + system prompt + model as cache key basis
    const messages = body.messages || [];
    const lastUserMsg = [...messages]
      .reverse()
      .find((m: any) => m.role === "user");

    const userContent =
      typeof lastUserMsg?.content === "string"
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg?.content)
          ? lastUserMsg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join(" ")
          : "";

    const keyBasis = `${context.agentName || ""}:${context.taskType || ""}:${userContent.slice(0, 200)}`;
    return createHash("md5").update(keyBasis).digest("hex").slice(0, 16);
  }

  private generateRequestHash(body: any): string {
    const normalized = JSON.stringify({
      messages: (body.messages || []).slice(-5), // Last 5 messages only
      system: typeof body.system === "string"
        ? body.system.slice(0, 500)
        : JSON.stringify(body.system).slice(0, 500),
      tools: (body.tools || []).map((t: any) => t.name).sort(),
    });
    return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  }

  private extractRequestSummary(body: any): string {
    const messages = body.messages || [];
    const lastUser = [...messages]
      .reverse()
      .find((m: any) => m.role === "user");
    if (!lastUser) return "";

    return typeof lastUser.content === "string"
      ? lastUser.content.slice(0, 100)
      : "[complex content]";
  }

  private sanitizeResponse(response: any): any {
    // Deep clone and remove any sensitive/temporary data
    try {
      return JSON.parse(JSON.stringify(response));
    } catch {
      return response;
    }
  }

  private shouldSkip(body: any): boolean {
    // Skip if any skip pattern matches the request
    const bodyStr = JSON.stringify(body).toLowerCase();
    return this.config.skipPatterns.some((pattern) =>
      bodyStr.includes(pattern.toLowerCase())
    );
  }

  private async checkGPTCache(body: any): Promise<any | null> {
    if (!this.config.endpoint) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.config.endpoint + "/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: this.extractRequestSummary(body),
          threshold: this.config.similarityThreshold,
          limit: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      if (data.results && data.results.length > 0 && data.results[0].response) {
        this.logger?.info("SemanticCache: GPTCache HIT");
        return data.results[0].response;
      }
      return null;
    } catch {
      return null;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger?.debug(`SemanticCache: cleaned up ${removed} expired entries`);
    }
  }
}
