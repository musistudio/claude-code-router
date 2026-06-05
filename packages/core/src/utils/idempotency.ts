/**
 * Idempotency - 幂等请求检测
 *
 * Prevents duplicate processing when agents retry timed-out requests.
 * Uses request fingerprinting (sha256 of body) to detect duplicates.
 *
 * Design: Zero external dependencies. In-memory LRU store with TTL.
 */

import { createHash } from "crypto";
import { LRUCache } from "lru-cache";

export interface IdempotencyConfig {
  enabled: boolean;
  /** TTL for idempotency keys in ms (default: 600000 = 10 min) */
  ttlMs: number;
  /** Max entries in idempotency store */
  maxEntries: number;
  /** Fields to exclude from fingerprint (e.g., 'stream', 'metadata') */
  excludeFields: string[];
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  enabled: true,
  ttlMs: 600000,
  maxEntries: 5000,
  excludeFields: ['stream', 'metadata'],
};

export interface IdempotencyResult {
  /** Request fingerprint */
  fingerprint: string;
  /** Whether this is a duplicate request */
  isDuplicate: boolean;
  /** Cached response if duplicate */
  cachedResponse?: any;
  /** Timestamp of original request */
  originalTimestamp?: number;
}

interface CachedResult {
  response: any;
  timestamp: number;
  statusCode: number;
}

export class IdempotencyGuard {
  private config: IdempotencyConfig;
  private store: LRUCache<string, CachedResult>;
  private logger?: any;

  constructor(config: Partial<IdempotencyConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
    this.store = new LRUCache<string, CachedResult>({
      max: this.config.maxEntries,
      ttl: this.config.ttlMs,
    });
  }

  /**
   * Check if a request is a duplicate.
   */
  check(body: any, headers?: Record<string, string>): IdempotencyResult {
    if (!this.config.enabled) {
      return { fingerprint: '', isDuplicate: false };
    }

    // Check for explicit idempotency key first
    const explicitKey = headers?.['idempotency-key'] || headers?.['x-idempotency-key'];
    const fingerprint = explicitKey || this.computeFingerprint(body);

    const cached = this.store.get(fingerprint);
    if (cached) {
      this.logger?.debug(`Idempotency: duplicate request detected (fingerprint=${fingerprint.slice(0, 16)}...)`);
      return {
        fingerprint,
        isDuplicate: true,
        cachedResponse: cached.response,
        originalTimestamp: cached.timestamp,
      };
    }

    return { fingerprint, isDuplicate: false };
  }

  /**
   * Store a response for future idempotency checks.
   */
  storeResponse(fingerprint: string, response: any, statusCode: number = 200): void {
    if (!this.config.enabled || !fingerprint) return;

    this.store.set(fingerprint, {
      response,
      timestamp: Date.now(),
      statusCode,
    });
  }

  /**
   * Get stats for monitoring.
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.store.size,
      maxSize: this.config.maxEntries,
      hitRate: 0, // LRU cache doesn't track this natively
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<IdempotencyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private computeFingerprint(body: any): string {
    if (!body) return 'empty';

    // Create a copy without excluded fields
    const sanitized = { ...body };
    for (const field of this.config.excludeFields) {
      delete sanitized[field];
    }

    // Sort keys for deterministic hashing
    const sorted = this.sortKeys(sanitized);
    const payload = JSON.stringify(sorted);

    return createHash('sha256').update(payload).digest('hex');
  }

  private sortKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortKeys(item));
    }
    if (obj && typeof obj === 'object') {
      const sorted: Record<string, any> = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = this.sortKeys(obj[key]);
      }
      return sorted;
    }
    return obj;
  }
}

let globalIdempotency: IdempotencyGuard | null = null;

export function getIdempotencyGuard(config?: Partial<IdempotencyConfig>, logger?: any): IdempotencyGuard {
  if (!globalIdempotency) {
    globalIdempotency = new IdempotencyGuard(config, logger);
  } else if (config) {
    globalIdempotency.updateConfig(config);
  }
  return globalIdempotency;
}
