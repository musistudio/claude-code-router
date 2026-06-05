/**
 * Redis Cache - Redis精确缓存层
 *
 * Cross-process, persistent, multi-instance shared cache.
 * Uses Redis for exact key matching with TTL support.
 *
 * Dependencies: ioredis (optional, graceful fallback if unavailable)
 */

import { createHash } from "crypto";

export interface RedisCacheConfig {
  enabled: boolean;
  /** Redis connection URL */
  url: string;
  /** Key prefix for namespacing */
  keyPrefix: string;
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  /** Max key length */
  maxKeyLength: number;
  /** Serialize format */
  serializeFormat: 'json' | 'msgpack';
}

const DEFAULT_CONFIG: RedisCacheConfig = {
  enabled: true,
  url: 'redis://127.0.0.1:16379',
  keyPrefix: 'ccr:',
  defaultTtlSeconds: 600,
  maxKeyLength: 256,
  serializeFormat: 'json',
};

export class RedisCache {
  private config: RedisCacheConfig;
  private logger?: any;
  private client: any = null;
  private connected = false;
  private stats = { hits: 0, misses: 0, errors: 0 };

  constructor(config: Partial<RedisCacheConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Initialize Redis connection.
   */
  async connect(): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      // Dynamic import to avoid hard dependency
      const Redis = await this.loadRedisModule();
      if (!Redis) {
        this.logger?.warn('RedisCache: ioredis not available, falling back to no-op');
        return false;
      }

      this.client = new Redis(this.config.url, {
        keyPrefix: this.config.keyPrefix,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      await this.client.connect();
      this.connected = true;
      this.logger?.info(`RedisCache: connected to ${this.config.url}`);
      return true;
    } catch (error: any) {
      this.logger?.warn(`RedisCache: connection failed: ${error.message}`);
      this.connected = false;
      this.client = null;
      return false;
    }
  }

  /**
   * Get a cached response by key.
   */
  async get(key: string): Promise<any | null> {
    if (!this.connected || !this.client) return null;

    try {
      const fullKey = this.buildKey(key);
      const data = await this.client.get(fullKey);
      if (data) {
        this.stats.hits++;
        return JSON.parse(data);
      }
      this.stats.misses++;
      return null;
    } catch (error: any) {
      this.stats.errors++;
      this.logger?.debug(`RedisCache get error: ${error.message}`);
      return null;
    }
  }

  /**
   * Set a cached response.
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.connected || !this.client) return false;

    try {
      const fullKey = this.buildKey(key);
      const data = JSON.stringify(value);
      const ttl = ttlSeconds || this.config.defaultTtlSeconds;

      await this.client.setex(fullKey, ttl, data);
      return true;
    } catch (error: any) {
      this.stats.errors++;
      this.logger?.debug(`RedisCache set error: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete a cached key.
   */
  async del(key: string): Promise<boolean> {
    if (!this.connected || !this.client) return false;

    try {
      const fullKey = this.buildKey(key);
      await this.client.del(fullKey);
      return true;
    } catch (error: any) {
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if key exists.
   */
  async exists(key: string): Promise<boolean> {
    if (!this.connected || !this.client) return false;

    try {
      const fullKey = this.buildKey(key);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch {
      return false;
    }
  }

  /**
   * Compute cache key from request body.
   */
  computeKey(body: any): string {
    const sanitized = { ...body };
    delete sanitized.stream;
    delete sanitized.metadata;
    const payload = JSON.stringify(sanitized);
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Get cache stats.
   */
  getStats(): { hits: number; misses: number; errors: number; hitRate: number; connected: boolean } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) / 100 : 0,
      connected: this.connected,
    };
  }

  /**
   * Disconnect from Redis.
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
      }
    } catch (e: any) {
      this.logger?.debug(`RedisCache disconnect error: ${e?.message}`);
    } finally {
      this.client = null;
      this.connected = false;
    }
  }

  // =========================================================================
  // Private
  // =========================================================================

  private buildKey(key: string): string {
    if (key.length > this.config.maxKeyLength) {
      return createHash('sha256').update(key).digest('hex');
    }
    return key;
  }

  private async loadRedisModule(): Promise<any> {
    try {
      return require('ioredis');
    } catch {
      return null;
    }
  }
}

let globalRedisCache: RedisCache | null = null;

export function getRedisCache(config?: Partial<RedisCacheConfig>, logger?: any): RedisCache {
  if (!globalRedisCache) {
    globalRedisCache = new RedisCache(config, logger);
    // Auto-connect on first access
    globalRedisCache.connect().catch((e: any) => {
      logger?.debug(`RedisCache auto-connect failed: ${e?.message}`);
    });
  }
  return globalRedisCache;
}
