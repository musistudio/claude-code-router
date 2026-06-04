/**
 * Feedback Store - 用户反馈收集
 *
 * Collects and stores user feedback on LLM responses:
 * - Thumbs up/down ratings
 * - Text feedback
 * - Quality scores
 * - Used for routing optimization and cache tuning
 *
 * Design: Zero external dependencies. JSONL file storage.
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

export interface FeedbackStoreConfig {
  enabled: boolean;
  /** Storage file path */
  storagePath: string;
  /** Max entries to keep in memory */
  maxMemoryEntries: number;
}

const DEFAULT_CONFIG: FeedbackStoreConfig = {
  enabled: true,
  storagePath: './dev/feedback.jsonl',
  maxMemoryEntries: 5000,
};

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  sessionId?: string;
  userId?: string;
  provider: string;
  model: string;
  /** Rating: 1 (thumbs down) to 5 (thumbs up) */
  rating: number;
  /** Optional text feedback */
  comment?: string;
  /** Request fingerprint for correlation */
  requestFingerprint?: string;
  /** Quality score at time of request */
  qualityScore?: number;
}

export class FeedbackStore {
  private config: FeedbackStoreConfig;
  private logger?: any;
  private entries: FeedbackEntry[] = [];
  private writeQueue: FeedbackEntry[] = [];
  private flushing = false;

  constructor(config: Partial<FeedbackStoreConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Submit feedback.
   */
  async submit(feedback: Omit<FeedbackEntry, 'id' | 'timestamp'>): Promise<string> {
    if (!this.config.enabled) return '';

    const entry: FeedbackEntry = {
      ...feedback,
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.entries.push(entry);
    if (this.entries.length > this.config.maxMemoryEntries) {
      this.entries = this.entries.slice(-this.config.maxMemoryEntries);
    }

    this.writeQueue.push(entry);
    this.flushSoon();

    return entry.id;
  }

  /**
   * Query feedback entries.
   */
  query(filters: {
    sessionId?: string;
    userId?: string;
    provider?: string;
    model?: string;
    minRating?: number;
    limit?: number;
  }): FeedbackEntry[] {
    let results = this.entries;

    if (filters.sessionId) results = results.filter(e => e.sessionId === filters.sessionId);
    if (filters.userId) results = results.filter(e => e.userId === filters.userId);
    if (filters.provider) results = results.filter(e => e.provider === filters.provider);
    if (filters.model) results = results.filter(e => e.model === filters.model);
    if (filters.minRating) results = results.filter(e => e.rating >= filters.minRating!);

    return results.slice(-(filters.limit || 100));
  }

  /**
   * Get feedback stats.
   */
  getStats(): {
    totalFeedback: number;
    averageRating: number;
    providerRatings: Record<string, { count: number; avgRating: number }>;
  } {
    const providerRatings: Record<string, { total: number; count: number }> = {};

    for (const entry of this.entries) {
      if (!providerRatings[entry.provider]) {
        providerRatings[entry.provider] = { total: 0, count: 0 };
      }
      providerRatings[entry.provider].total += entry.rating;
      providerRatings[entry.provider].count++;
    }

    const totalRating = this.entries.reduce((sum, e) => sum + e.rating, 0);

    return {
      totalFeedback: this.entries.length,
      averageRating: this.entries.length > 0 ? Math.round((totalRating / this.entries.length) * 100) / 100 : 0,
      providerRatings: Object.fromEntries(
        Object.entries(providerRatings).map(([k, v]) => [
          k,
          { count: v.count, avgRating: Math.round((v.total / v.count) * 100) / 100 },
        ])
      ),
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<FeedbackStoreConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private flushSoon(): void {
    if (this.flushing) return;
    this.flushing = true;
    setTimeout(() => this.flush(), 1000);
  }

  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0) {
      this.flushing = false;
      return;
    }

    const batch = this.writeQueue.splice(0, 100);

    try {
      const dir = dirname(this.config.storagePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const lines = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
      await writeFile(this.config.storagePath, lines, { flag: 'a' });
    } catch (error: any) {
      this.logger?.warn(`FeedbackStore flush failed: ${error.message}`);
    }

    this.flushing = false;
    if (this.writeQueue.length > 0) {
      this.flushSoon();
    }
  }
}

let globalFeedback: FeedbackStore | null = null;

export function getFeedbackStore(config?: Partial<FeedbackStoreConfig>, logger?: any): FeedbackStore {
  if (!globalFeedback) {
    globalFeedback = new FeedbackStore(config, logger);
  } else if (config) {
    globalFeedback.updateConfig(config);
  }
  return globalFeedback;
}
