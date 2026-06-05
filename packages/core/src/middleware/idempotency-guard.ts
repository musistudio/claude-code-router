import { createHash } from "crypto";

export interface IdempotencyConfig {
  enabled: boolean;
  maxEntries: number;
  ttlMs: number;
}

interface CacheEntry {
  status: "processing" | "completed";
  response?: any;
  createdAt: number;
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  enabled: true,
  maxEntries: 1000,
  ttlMs: 300000,
};

export class IdempotencyGuard {
  private config: IdempotencyConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<IdempotencyConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupTimer = setInterval(() => this.evictExpired(), 60000);
  }

  checkRequest(body: any): { isDuplicate: boolean; response?: any; statusCode?: number } {
    if (!this.config.enabled) return { isDuplicate: false };

    const hash = this.computeHash(body);
    const entry = this.cache.get(hash);

    if (!entry) {
      this.cache.set(hash, { status: "processing", createdAt: Date.now() });
      this.enforceMaxEntries();
      return { isDuplicate: false };
    }

    if (entry.status === "completed") {
      this.logger?.info(`IdempotencyGuard: duplicate completed request, returning cached response`);
      return { isDuplicate: true, response: entry.response };
    }

    this.logger?.info(`IdempotencyGuard: duplicate processing request, returning 202`);
    return { isDuplicate: true, statusCode: 202 };
  }

  markCompleted(body: any, response: any): void {
    if (!this.config.enabled) return;

    const hash = this.computeHash(body);
    const entry = this.cache.get(hash);
    if (entry) {
      entry.status = "completed";
      entry.response = response;
    }
  }

  clear(): void {
    this.cache.clear();
    this.logger?.info("IdempotencyGuard: cleared all entries");
  }

  getStats(): { size: number; processing: number; completed: number } {
    let processing = 0;
    let completed = 0;
    for (const entry of this.cache.values()) {
      if (entry.status === "processing") processing++;
      else completed++;
    }
    return { size: this.cache.size, processing, completed };
  }

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  private computeHash(body: any): string {
    const normalized = JSON.stringify(body ?? {});
    return createHash("sha256").update(normalized).digest("hex");
  }

  private enforceMaxEntries(): void {
    while (this.cache.size > this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
      else break;
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      this.logger?.debug(`IdempotencyGuard: evicted ${evicted} expired entries`);
    }
  }
}
