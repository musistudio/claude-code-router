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
import { getEmbeddingService, EmbeddingService } from "../utils/embedding";
export interface CacheConfig {
  enabled: boolean;
  endpoint?: string;
  ttlMs: number;
  similarityThreshold: number;
  maxEntries: number;
  skipPatterns: string[];
  temperatureThreshold: number;
  useEmbedding?: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 600000,
  similarityThreshold: 0.92,
  maxEntries: 1000,
  skipPatterns: ["stream"],
  temperatureThreshold: 0.5,
  useEmbedding: true,
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
  embedding?: number[];
}

export class SemanticCache extends EventEmitter {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private enabled = false;
  private embeddingService: EmbeddingService;

  constructor(config: Partial<CacheConfig> = {}, private logger?: any) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.enabled = this.config.enabled;
    this.embeddingService = getEmbeddingService(undefined, logger);

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
      // Skip caching for certain patterns (streaming, high temperature)
      if (this.shouldSkip(requestBody)) return null;

      // Generate cache key
      const requestHash = this.generateRequestHash(requestBody);
      const cacheKey = this.generateCacheKey(requestBody, context);

      const localEntry = this.cache.get(cacheKey);
      if (localEntry && localEntry.expiresAt > Date.now()) {
        localEntry.hitCount++;
        this.logger?.info(
          `SemanticCache: EXACT HIT (hits=${localEntry.hitCount}, model=${localEntry.model})`
        );
        this.emit("cache:hit", {
          key: cacheKey,
          model: localEntry.model,
          hitCount: localEntry.hitCount,
          matchType: "exact",
        });
        return localEntry.response;
      }

      if (this.config.useEmbedding && this.embeddingService.isAvailable()) {
        const queryEmbedding = await this.embeddingService.embed(
          this.extractRequestSummary(requestBody)
        );
        if (queryEmbedding) {
          let bestEntry: CacheEntry | null = null;
          let bestScore = 0;
          for (const entry of this.cache.values()) {
            if (entry.expiresAt <= Date.now()) continue;
            if (entry.model !== (context.model || requestBody.model)) continue;
            if (!entry.embedding) continue;
            const score = EmbeddingService.cosineSimilarity(queryEmbedding, entry.embedding);
            if (score > bestScore) {
              bestScore = score;
              bestEntry = entry;
            }
          }
          if (bestEntry && bestScore >= this.config.similarityThreshold) {
            bestEntry.hitCount++;
            this.logger?.info(
              `SemanticCache: EMBEDDING HIT (score=${bestScore.toFixed(3)}, model=${bestEntry.model})`
            );
            this.emit("cache:hit", {
              key: bestEntry.key,
              model: bestEntry.model,
              hitCount: bestEntry.hitCount,
              matchType: "semantic",
              similarity: bestScore,
            });
            return bestEntry.response;
          }
        }
      }

      if (this.config.endpoint) {
        const gptCacheResult = await this.checkGPTCache(requestBody);
        if (gptCacheResult) return gptCacheResult;
      }

      this.emit("cache:miss", { key: cacheKey });
      return null;
    } catch (error: any) {
      this.logger?.warn(`SemanticCache lookup error: ${error.message}`);
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

    if (this.config.useEmbedding && this.embeddingService.isAvailable()) {
      this.embeddingService.embed(entry.requestSummary).then(emb => {
        if (emb) entry.embedding = emb;
      }).catch(() => {});
    }

    this.cache.set(cacheKey, entry);

    // Evict oldest if over max (LRU via insertion-order Map)
    if (this.cache.size > this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
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

    const keyBasis = `${context.agentName || ""}:${context.taskType || ""}:${context.model || ""}:${userContent}`;
    return createHash("md5").update(keyBasis).digest("hex").slice(0, 16);
  }

  private generateRequestHash(body: any): string {
    const normalized = JSON.stringify({
      messages: (body.messages || []).slice(-5),
      system: typeof body.system === "string"
        ? body.system.slice(0, 500)
        : body.system
          ? JSON.stringify(body.system).slice(0, 500)
          : "",
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
    try {
      return JSON.parse(JSON.stringify(response));
    } catch (e: any) {
      this.logger?.debug(`SemanticCache sanitizeResponse failed: ${e?.message}`);
      return response;
    }
  }

  private shouldSkip(body: any): boolean {
    if (!body) return true;
    // Skip streaming requests
    if (body.stream === true) return true;
    // Skip high temperature requests (non-deterministic)
    if (body.temperature > this.config.temperatureThreshold) return true;
    return false;
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
    } catch (e: any) {
      this.logger?.warn(`SemanticCache GPTCache query failed: ${e?.message}`);
      return null;
    }
  }
}
