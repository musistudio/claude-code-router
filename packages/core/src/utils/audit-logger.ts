/**
 * Audit Logger - 结构化审计日志系统
 *
 * Records all LLM interactions for compliance and debugging:
 * - Request/response pairs with full metadata
 * - User identity, session, tenant tracking
 * - Cost, latency, token usage
 * - Quality scores, risk flags
 * - Queryable via API
 *
 * Design: Zero external dependencies. JSONL file storage with optional Postgres.
 */

import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

export interface AuditLogConfig {
  enabled: boolean;
  /** Storage mode: 'jsonl' | 'postgres' */
  storageMode: 'jsonl' | 'postgres';
  /** JSONL file path */
  jsonlPath: string;
  /** Postgres connection string (if postgres mode) */
  postgresConnectionString?: string;
  /** Max entries to keep in memory for querying */
  maxMemoryEntries: number;
  /** Fields to redact in audit logs */
  redactFields: string[];
}

const DEFAULT_CONFIG: AuditLogConfig = {
  enabled: true,
  storageMode: 'jsonl',
  jsonlPath: './dev/audit.jsonl',
  maxMemoryEntries: 10000,
  redactFields: ['api_key', 'apiKey', 'authorization', 'x-api-key'],
};

export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  provider: string;
  model: string;
  scenarioType?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
  cacheHit: boolean;
  qualityScore?: number;
  hallucinationRisk?: number;
  flags: string[];
  requestSummary: string;
  responseSummary: string;
}

export class AuditLogger {
  private config: AuditLogConfig;
  private logger?: any;
  private entries: AuditEntry[] = [];
  private writeQueue: AuditEntry[] = [];
  private flushing = false;

  constructor(config: Partial<AuditLogConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Log an audit entry.
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) return;

    const fullEntry: AuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    // Keep in memory for querying
    this.entries.push(fullEntry);
    if (this.entries.length > this.config.maxMemoryEntries) {
      this.entries = this.entries.slice(-this.config.maxMemoryEntries);
    }

    // Queue for file write
    this.writeQueue.push(fullEntry);
    this.flushSoon();
  }

  /**
   * Query audit entries.
   */
  query(filters: {
    sessionId?: string;
    userId?: string;
    provider?: string;
    model?: string;
    from?: number;
    to?: number;
    limit?: number;
  }): AuditEntry[] {
    let results = this.entries;

    if (filters.sessionId) {
      results = results.filter(e => e.sessionId === filters.sessionId);
    }
    if (filters.userId) {
      results = results.filter(e => e.userId === filters.userId);
    }
    if (filters.provider) {
      results = results.filter(e => e.provider === filters.provider);
    }
    if (filters.model) {
      results = results.filter(e => e.model === filters.model);
    }
    if (filters.from) {
      results = results.filter(e => e.timestamp >= filters.from!);
    }
    if (filters.to) {
      results = results.filter(e => e.timestamp <= filters.to!);
    }

    const limit = filters.limit || 100;
    return results.slice(-limit);
  }

  /**
   * Get audit stats.
   */
  getStats(): {
    totalEntries: number;
    providers: Record<string, number>;
    totalCostUsd: number;
    avgLatencyMs: number;
    cacheHitRate: number;
  } {
    const providers: Record<string, number> = {};
    let totalCost = 0;
    let totalLatency = 0;
    let cacheHits = 0;

    for (const entry of this.entries) {
      providers[entry.provider] = (providers[entry.provider] || 0) + 1;
      totalCost += entry.costUsd;
      totalLatency += entry.latencyMs;
      if (entry.cacheHit) cacheHits++;
    }

    return {
      totalEntries: this.entries.length,
      providers,
      totalCostUsd: Math.round(totalCost * 1000) / 1000,
      avgLatencyMs: this.entries.length > 0 ? Math.round(totalLatency / this.entries.length) : 0,
      cacheHitRate: this.entries.length > 0 ? Math.round((cacheHits / this.entries.length) * 100) / 100 : 0,
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<AuditLogConfig>): void {
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
      const dir = dirname(this.config.jsonlPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const lines = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
      await writeFile(this.config.jsonlPath, lines, { flag: 'a' });
    } catch (error: any) {
      this.logger?.warn(`AuditLogger flush failed: ${error.message}`);
    }

    this.flushing = false;
    if (this.writeQueue.length > 0) {
      this.flushSoon();
    }
  }
}

let globalAudit: AuditLogger | null = null;

export function getAuditLogger(config?: Partial<AuditLogConfig>, logger?: any): AuditLogger {
  if (!globalAudit) {
    globalAudit = new AuditLogger(config, logger);
  } else if (config) {
    globalAudit.updateConfig(config);
  }
  return globalAudit;
}
