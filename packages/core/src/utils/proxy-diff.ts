/**
 * Proxy Diff - 请求/响应代理前后对比
 *
 * Records the transformation applied by the proxy:
 * - Original request → modified request (after transformers)
 * - Original response → modified response (after transformers)
 * - Prompt diff (what was added/removed)
 * - Model routing decisions
 *
 * Design: Zero external dependencies. In-memory store with API.
 */

export interface ProxyDiffConfig {
  enabled: boolean;
  /** Max diffs to keep in memory */
  maxEntries: number;
  /** TTL for diff entries in ms */
  ttlMs: number;
}

const DEFAULT_CONFIG: ProxyDiffConfig = {
  enabled: true,
  maxEntries: 500,
  ttlMs: 3600000,
};

export interface DiffEntry {
  id: string;
  timestamp: number;
  sessionId?: string;
  provider: string;
  model: string;
  scenarioType?: string;
  originalRequest: {
    model: string;
    systemSummary: string;
    messageCount: number;
    lastUserMessage: string;
  };
  modifiedRequest?: {
    model: string;
    systemSummary: string;
    enrichments: string[];
  };
  routing: {
    originalModel: string;
    routedModel: string;
    reason: string;
  };
  response?: {
    statusCode: number;
    latencyMs: number;
    contentSummary: string;
    cacheHit: boolean;
  };
}

export class ProxyDiffTracker {
  private config: ProxyDiffConfig;
  private logger?: any;
  private entries: Map<string, DiffEntry> = new Map();

  constructor(config: Partial<ProxyDiffConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Record a new diff entry at request start.
   */
  startRequest(reqId: string, req: any): void {
    if (!this.config.enabled) return;

    const messages = req.body?.messages || [];
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    const lastUserMsg = typeof lastUser?.content === 'string'
      ? lastUser.content.slice(0, 200)
      : '[complex content]';

    const systemSummary = typeof req.body?.system === 'string'
      ? req.body.system.slice(0, 200)
      : Array.isArray(req.body?.system)
        ? req.body.system.filter((s: any) => s.type === 'text').map((s: any) => s.text || '').join(' ').slice(0, 200)
        : '';

    const entry: DiffEntry = {
      id: reqId,
      timestamp: Date.now(),
      sessionId: req.sessionId,
      provider: req.provider || 'unknown',
      model: req.body?.model || 'unknown',
      scenarioType: req.scenarioType,
      originalRequest: {
        model: req._originalModel || req.body?.model || 'unknown',
        systemSummary,
        messageCount: messages.length,
        lastUserMessage: lastUserMsg,
      },
      routing: {
        originalModel: req._originalModel || req.body?.model || 'unknown',
        routedModel: req.body?.model || 'unknown',
        reason: req.scenarioType || 'default',
      },
    };

    this.entries.set(reqId, entry);

    // Evict oldest if over max
    if (this.entries.size > this.config.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
  }

  /**
   * Record modifications applied to the request.
   */
  recordModification(reqId: string, modifications: {
    model?: string;
    systemSummary?: string;
    enrichments?: string[];
  }): void {
    const entry = this.entries.get(reqId);
    if (!entry) return;

    entry.modifiedRequest = {
      model: modifications.model || entry.originalRequest.model,
      systemSummary: modifications.systemSummary || entry.originalRequest.systemSummary,
      enrichments: modifications.enrichments || [],
    };
  }

  /**
   * Record the response.
   */
  recordResponse(reqId: string, response: {
    statusCode: number;
    latencyMs: number;
    contentSummary: string;
    cacheHit: boolean;
  }): void {
    const entry = this.entries.get(reqId);
    if (!entry) return;

    entry.response = response;
  }

  /**
   * Get a diff entry.
   */
  getDiff(reqId: string): DiffEntry | null {
    return this.entries.get(reqId) || null;
  }

  /**
   * Get recent diffs.
   */
  getRecentDiffs(limit: number = 20): DiffEntry[] {
    const entries = Array.from(this.entries.values());
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries.slice(0, limit);
  }

  /**
   * Get stats.
   */
  getStats(): { totalEntries: number; enabled: boolean } {
    return { totalEntries: this.entries.size, enabled: this.config.enabled };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ProxyDiffConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.entries.delete(key);
      }
    }
  }
}

let globalDiff: ProxyDiffTracker | null = null;

export function getProxyDiffTracker(config?: Partial<ProxyDiffConfig>, logger?: any): ProxyDiffTracker {
  if (!globalDiff) {
    globalDiff = new ProxyDiffTracker(config, logger);
  } else if (config) {
    globalDiff.updateConfig(config);
  }
  return globalDiff;
}
