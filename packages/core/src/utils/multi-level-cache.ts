import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';

export interface CacheKey {
  model: string;
  messagesHash: string;
  paramsHash: string;
  semanticHash?: string;
}

export interface CacheEntry {
  key: CacheKey;
  response: any;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CacheStats {
  level: 'L1' | 'L2' | 'L3';
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  avgSetTimeMs: number;
  avgGetTimeMs: number;
}

export interface CacheLayerConfig {
  maxSize: number;
  defaultTtlMs: number;
  semanticThreshold: number;
  ignoreFields: string[];
}

const DEFAULT_L1_CONFIG: CacheLayerConfig = {
  maxSize: 1000,
  defaultTtlMs: 300000,
  semanticThreshold: 0.95,
  ignoreFields: ['request_id', 'metadata.user_id', 'stream'],
};

export function computeMessagesHash(messages: any[], ignoreFields: string[] = []): string {
  const normalized = messages.map(m => {
    const filtered = { ...m };
    for (const field of ignoreFields) {
      delete filtered[field];
    }
    return filtered;
  });
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 16);
}

export function computeParamsHash(params: Record<string, any>, ignoreFields: string[] = []): string {
  const filtered = { ...params };
  for (const field of ignoreFields) {
    delete filtered[field];
  }
  return createHash('sha256')
    .update(JSON.stringify(filtered))
    .digest('hex')
    .substring(0, 16);
}

export class L1MemoryCache {
  private cache: LRUCache<string, CacheEntry>;
  private config: CacheLayerConfig;
  private stats = { hits: 0, misses: 0, evictions: 0, totalSetTime: 0, totalGetTime: 0, setCount: 0, getCount: 0 };

  constructor(config: Partial<CacheLayerConfig> = {}) {
    this.config = { ...DEFAULT_L1_CONFIG, ...config };
    this.cache = new LRUCache<string, CacheEntry>({
      max: this.config.maxSize,
      ttl: this.config.defaultTtlMs,
      dispose: () => { this.stats.evictions++; },
    });
  }

  buildKey(model: string, messages: any[], params: Record<string, any> = {}): CacheKey {
    return {
      model,
      messagesHash: computeMessagesHash(messages, this.config.ignoreFields),
      paramsHash: computeParamsHash(params, this.config.ignoreFields),
    };
  }

  toCacheKeyString(key: CacheKey): string {
    return `${key.model}:${key.messagesHash}:${key.paramsHash}`;
  }

  get(key: CacheKey): CacheEntry | null {
    const start = Date.now();
    const entry = this.cache.get(this.toCacheKeyString(key));
    const elapsed = Date.now() - start;

    this.stats.getCount++;
    this.stats.totalGetTime += elapsed;

    if (entry) {
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(this.toCacheKeyString(key));
        this.stats.misses++;
        return null;
      }
      entry.hitCount++;
      this.stats.hits++;
      return entry;
    }

    this.stats.misses++;
    return null;
  }

  set(key: CacheKey, response: any, provider: string, model: string, ttlMs?: number, tokens?: { input: number; output: number }): void {
    const start = Date.now();
    const effectiveTtl = ttlMs || this.config.defaultTtlMs;
    const entry: CacheEntry = {
      key,
      response,
      createdAt: Date.now(),
      expiresAt: Date.now() + effectiveTtl,
      hitCount: 0,
      provider,
      model,
      inputTokens: tokens?.input || 0,
      outputTokens: tokens?.output || 0,
    };
    this.cache.set(this.toCacheKeyString(key), entry, { ttl: effectiveTtl });
    this.stats.setCount++;
    this.stats.totalSetTime += Date.now() - start;
  }

  invalidate(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByModel(model: string): number {
    return this.invalidate(`${model}:`);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      level: 'L1',
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictionCount: this.stats.evictions,
      avgSetTimeMs: this.stats.setCount > 0 ? this.stats.totalSetTime / this.stats.setCount : 0,
      avgGetTimeMs: this.stats.getCount > 0 ? this.stats.totalGetTime / this.stats.getCount : 0,
    };
  }
}

export class L2RedisCache {
  private redis: any = null;
  private keyPrefix = 'ccr:cache:';
  private config: CacheLayerConfig & { redisUrl?: string };
  private stats = { hits: 0, misses: 0, evictions: 0, totalSetTime: 0, totalGetTime: 0, setCount: 0, getCount: 0 };
  private connected = false;

  constructor(config: Partial<CacheLayerConfig & { redisUrl?: string }> = {}) {
    this.config = { ...DEFAULT_L1_CONFIG, maxSize: 10000, ...config };
  }

  async connect(redisClient?: any): Promise<void> {
    if (redisClient) {
      this.redis = redisClient;
      this.connected = true;
      return;
    }

    const port = parseInt(process.env.REDIS_PORT || '16379', 10);
    const host = process.env.REDIS_HOST || '127.0.0.1';

    try {
      const { default: Redis } = await import('ioredis');
      this.redis = new Redis({ host, port, maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 3000 });
      await this.redis.ping().catch(() => { this.connected = false; });
      this.connected = true;
    } catch {
      this.connected = false;
    }
  }

  async get(key: CacheKey): Promise<CacheEntry | null> {
    if (!this.connected || !this.redis) return null;

    const start = Date.now();
    try {
      const raw = await this.redis.get(`${this.keyPrefix}${key.model}:${key.messagesHash}:${key.paramsHash}`);
      this.stats.getCount++;
      this.stats.totalGetTime += Date.now() - start;

      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
          await this.redis.del(`${this.keyPrefix}${key.model}:${key.messagesHash}:${key.paramsHash}`);
          this.stats.misses++;
          return null;
        }
        entry.hitCount++;
        this.stats.hits++;
        return entry;
      }
      this.stats.misses++;
      return null;
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  async set(key: CacheKey, response: any, provider: string, model: string, ttlMs?: number, tokens?: { input: number; output: number }): Promise<void> {
    if (!this.connected || !this.redis) return;

    const start = Date.now();
    const effectiveTtl = ttlMs || this.config.defaultTtlMs;
    const entry: CacheEntry = {
      key,
      response,
      createdAt: Date.now(),
      expiresAt: Date.now() + effectiveTtl,
      hitCount: 0,
      provider,
      model,
      inputTokens: tokens?.input || 0,
      outputTokens: tokens?.output || 0,
    };

    try {
      const ttlSeconds = Math.ceil(effectiveTtl / 1000);
      await this.redis.setex(
        `${this.keyPrefix}${key.model}:${key.messagesHash}:${key.paramsHash}`,
        ttlSeconds,
        JSON.stringify(entry)
      );
      this.stats.setCount++;
      this.stats.totalSetTime += Date.now() - start;
    } catch {
      // Silent fail for cache write
    }
  }

  async invalidate(pattern: string): Promise<number> {
    if (!this.connected || !this.redis) return 0;
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*${pattern}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return keys.length;
    } catch {
      return 0;
    }
  }

  async clear(): Promise<void> {
    if (!this.connected || !this.redis) return;
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {
      // Silent fail
    }
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      level: 'L2',
      size: 0,
      maxSize: this.config.maxSize,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictionCount: this.stats.evictions,
      avgSetTimeMs: this.stats.setCount > 0 ? this.stats.totalSetTime / this.stats.setCount : 0,
      avgGetTimeMs: this.stats.getCount > 0 ? this.stats.totalGetTime / this.stats.getCount : 0,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export interface MultiLevelCacheConfig {
  l1: Partial<CacheLayerConfig>;
  l2: Partial<CacheLayerConfig & { redisUrl?: string }>;
  l3Enabled: boolean;
  l3QdrantUrl: string;
  l3SemanticThreshold: number;
}

export class MultiLevelCache {
  readonly l1: L1MemoryCache;
  readonly l2: L2RedisCache;
  private l3Enabled: boolean;
  private l3QdrantUrl: string;
  private l3SemanticThreshold: number;
  private logger?: any;

  constructor(config: Partial<MultiLevelCacheConfig> = {}, logger?: any) {
    this.logger = logger;
    this.l1 = new L1MemoryCache(config.l1);
    this.l2 = new L2RedisCache(config.l2);
    this.l3Enabled = config.l3Enabled ?? false;
    this.l3QdrantUrl = config.l3QdrantUrl || 'http://127.0.0.1:16333';
    this.l3SemanticThreshold = config.l3SemanticThreshold || 0.95;
  }

  async initialize(redisClient?: any): Promise<void> {
    await this.l2.connect(redisClient);
    this.logger?.info(
      `MultiLevelCache initialized: L1(memory) + L2(redis:${this.l2.isConnected() ? 'connected' : 'disconnected'}) + L3(qdrant:${this.l3Enabled})`
    );
  }

  async get(key: CacheKey): Promise<{ entry: CacheEntry; level: 'L1' | 'L2' | 'L3' } | null> {
    const l1Entry = this.l1.get(key);
    if (l1Entry) {
      return { entry: l1Entry, level: 'L1' };
    }

    const l2Entry = await this.l2.get(key);
    if (l2Entry) {
      this.l1.set(key, l2Entry.response, l2Entry.provider, l2Entry.model);
      return { entry: l2Entry, level: 'L2' };
    }

    if (this.l3Enabled) {
      const l3Entry = await this.l3Lookup(key);
      if (l3Entry) {
        this.l1.set(key, l3Entry.response, l3Entry.provider, l3Entry.model);
        await this.l2.set(key, l3Entry.response, l3Entry.provider, l3Entry.model);
        return { entry: l3Entry, level: 'L3' };
      }
    }

    return null;
  }

  async set(key: CacheKey, response: any, provider: string, model: string, ttlMs?: number, tokens?: { input: number; output: number }): Promise<void> {
    this.l1.set(key, response, provider, model, ttlMs, tokens);
    await this.l2.set(key, response, provider, model, ttlMs, tokens);

    if (this.l3Enabled) {
      await this.l3Store(key, response, provider, model);
    }
  }

  async invalidate(pattern: string): Promise<{ l1: number; l2: number }> {
    const l1Count = this.l1.invalidate(pattern);
    const l2Count = await this.l2.invalidate(pattern);
    return { l1: l1Count, l2: l2Count };
  }

  async invalidateByModel(model: string): Promise<{ l1: number; l2: number }> {
    return this.invalidate(model);
  }

  getAllStats(): { l1: CacheStats; l2: CacheStats } {
    return {
      l1: this.l1.getStats(),
      l2: this.l2.getStats(),
    };
  }

  private async l3Lookup(key: CacheKey): Promise<CacheEntry | null> {
    if (!key.semanticHash) return null;

    try {
      const response = await fetch(`${this.l3QdrantUrl}/collections/ccr_cache/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: await this.hashToVector(key.semanticHash),
          limit: 1,
          score_threshold: this.l3SemanticThreshold,
          with_payload: true,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.result?.length > 0) {
        const point = data.result[0];
        return {
          key,
          response: point.payload.response,
          createdAt: point.payload.createdAt,
          expiresAt: point.payload.expiresAt,
          hitCount: point.payload.hitCount || 0,
          provider: point.payload.provider,
          model: point.payload.model,
          inputTokens: point.payload.inputTokens || 0,
          outputTokens: point.payload.outputTokens || 0,
        };
      }
    } catch {
      // L3 failure is non-critical
    }
    return null;
  }

  private async l3Store(key: CacheKey, response: any, provider: string, model: string): Promise<void> {
    if (!key.semanticHash) return;

    try {
      const vector = await this.hashToVector(key.semanticHash);
      await fetch(`${this.l3QdrantUrl}/collections/ccr_cache/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: key.messagesHash,
            vector,
            payload: {
              response,
              provider,
              model,
              createdAt: Date.now(),
              expiresAt: Date.now() + 300000,
              inputTokens: 0,
              outputTokens: 0,
            },
          }],
        }),
      });
    } catch {
      // L3 store failure is non-critical
    }
  }

  private async hashToVector(hash: string): Promise<number[]> {
    const vector: number[] = [];
    for (let i = 0; i < 384; i++) {
      const charCode = hash.charCodeAt(i % hash.length) || 0;
      vector.push(Math.sin(charCode * (i + 1) * 0.1) * 0.5);
    }
    return vector;
  }
}

let _cache: MultiLevelCache | null = null;

export function getMultiLevelCache(config?: Partial<MultiLevelCacheConfig>, logger?: any): MultiLevelCache {
  if (!_cache) {
    _cache = new MultiLevelCache(config, logger);
  }
  return _cache;
}
