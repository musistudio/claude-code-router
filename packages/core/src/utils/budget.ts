/**
 * Budget - 预算告警 + 自动限速
 *
 * Tracks spending per session/user/provider and enforces budget limits.
 * Supports soft limits (warn) and hard limits (block).
 *
 * Design: Zero external dependencies. In-memory tracking with configurable windows.
 */

export interface BudgetConfig {
  enabled: boolean;
  /** Global daily budget in USD (0 = no limit) */
  globalDailyUsd: number;
  /** Global monthly budget in USD (0 = no limit) */
  globalMonthlyUsd: number;
  /** Per-session daily budget in USD (0 = no limit) */
  sessionDailyUsd: number;
  /** Per-user daily budget in USD (0 = no limit) */
  userDailyUsd: number;
  /** Per-provider daily budget in USD (0 = no limit) */
  providerDailyUsd: number;
  /** Soft limit threshold (0-1, warn when exceeded) */
  softLimitRatio: number;
  /** Auto-throttle when soft limit exceeded (reduce concurrency) */
  autoThrottle: boolean;
  /** Block when hard limit exceeded */
  hardBlock: boolean;
  /** Alert callback */
  onAlert?: (alert: BudgetAlert) => void;
}

const DEFAULT_CONFIG: BudgetConfig = {
  enabled: true,
  globalDailyUsd: 50,
  globalMonthlyUsd: 500,
  sessionDailyUsd: 5,
  userDailyUsd: 20,
  providerDailyUsd: 100,
  softLimitRatio: 0.8,
  autoThrottle: true,
  hardBlock: true,
};

export interface BudgetAlert {
  type: 'soft' | 'hard';
  scope: 'global_daily' | 'global_monthly' | 'session' | 'user' | 'provider';
  key: string;
  currentUsd: number;
  limitUsd: number;
  ratio: number;
  action: 'warn' | 'throttle' | 'block';
  timestamp: number;
}

interface BudgetEntry {
  amount: number;
  timestamp: number;
  provider?: string;
  model?: string;
}

export class BudgetManager {
  private config: BudgetConfig;
  private logger?: any;

  // Spending trackers
  private globalDaily: BudgetEntry[] = [];
  private globalMonthly: BudgetEntry[] = [];
  private sessionDaily: Map<string, BudgetEntry[]> = new Map();
  private userDaily: Map<string, BudgetEntry[]> = new Map();
  private providerDaily: Map<string, BudgetEntry[]> = new Map();

  // Alert history (dedup)
  private recentAlerts: Map<string, number> = new Map();
  private readonly alertDedupMs = 300000; // 5 min dedup

  constructor(config: Partial<BudgetConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Check if a request is within budget.
   * Returns { allowed, alerts } where alerts may contain soft/hard limit warnings.
   */
  check(params: {
    estimatedCostUsd?: number;
    sessionId?: string;
    userId?: string;
    provider?: string;
  }): { allowed: boolean; alerts: BudgetAlert[]; throttleMs?: number } {
    if (!this.config.enabled) return { allowed: true, alerts: [] };

    const alerts: BudgetAlert[] = [];
    const now = Date.now();
    const cost = params.estimatedCostUsd || 0;

    // Check global daily
    if (this.config.globalDailyUsd > 0) {
      const spent = this.sumEntries(this.globalDaily, now, 86400000);
      const limit = this.config.globalDailyUsd;
      const result = this.checkLimit('global_daily', 'global_daily', spent + cost, limit, now);
      if (result) alerts.push(result);
    }

    // Check global monthly
    if (this.config.globalMonthlyUsd > 0) {
      const spent = this.sumEntries(this.globalMonthly, now, 2592000000);
      const limit = this.config.globalMonthlyUsd;
      const result = this.checkLimit('global_monthly', 'global_monthly', spent + cost, limit, now);
      if (result) alerts.push(result);
    }

    // Check session daily
    if (this.config.sessionDailyUsd > 0 && params.sessionId) {
      const entries = this.sessionDaily.get(params.sessionId) || [];
      const spent = this.sumEntries(entries, now, 86400000);
      const limit = this.config.sessionDailyUsd;
      const result = this.checkLimit('session', params.sessionId, spent + cost, limit, now);
      if (result) alerts.push(result);
    }

    // Check user daily
    if (this.config.userDailyUsd > 0 && params.userId) {
      const entries = this.userDaily.get(params.userId) || [];
      const spent = this.sumEntries(entries, now, 86400000);
      const limit = this.config.userDailyUsd;
      const result = this.checkLimit('user', params.userId, spent + cost, limit, now);
      if (result) alerts.push(result);
    }

    // Check provider daily
    if (this.config.providerDailyUsd > 0 && params.provider) {
      const entries = this.providerDaily.get(params.provider) || [];
      const spent = this.sumEntries(entries, now, 86400000);
      const limit = this.config.providerDailyUsd;
      const result = this.checkLimit('provider', params.provider, spent + cost, limit, now);
      if (result) alerts.push(result);
    }

    // Determine if request should be blocked
    const hardAlerts = alerts.filter((a) => a.type === 'hard');
    const softAlerts = alerts.filter((a) => a.type === 'soft');

    if (hardAlerts.length > 0 && this.config.hardBlock) {
      return { allowed: false, alerts, throttleMs: undefined };
    }

    if (softAlerts.length > 0 && this.config.autoThrottle) {
      // Throttle: add delay proportional to how far over soft limit
      const maxRatio = Math.max(...softAlerts.map((a) => a.ratio));
      const throttleMs = Math.min(30000, Math.round((maxRatio - this.config.softLimitRatio) * 10000));
      return { allowed: true, alerts, throttleMs };
    }

    return { allowed: true, alerts };
  }

  /**
   * Record actual spending after a request completes.
   */
  record(params: {
    costUsd: number;
    sessionId?: string;
    userId?: string;
    provider?: string;
    model?: string;
  }): void {
    if (!this.config.enabled) return;

    const entry: BudgetEntry = {
      amount: params.costUsd,
      timestamp: Date.now(),
      provider: params.provider,
      model: params.model,
    };

    this.globalDaily.push(entry);
    this.globalMonthly.push(entry);

    if (params.sessionId) {
      const entries = this.sessionDaily.get(params.sessionId) || [];
      entries.push(entry);
      this.sessionDaily.set(params.sessionId, entries);
    }

    if (params.userId) {
      const entries = this.userDaily.get(params.userId) || [];
      entries.push(entry);
      this.userDaily.set(params.userId, entries);
    }

    if (params.provider) {
      const entries = this.providerDaily.get(params.provider) || [];
      entries.push(entry);
      this.providerDaily.set(params.provider, entries);
    }
  }

  /**
   * Get budget status for monitoring.
   */
  getStatus(): {
    globalDaily: { spent: number; limit: number; ratio: number };
    globalMonthly: { spent: number; limit: number; ratio: number };
    topSessions: Array<{ key: string; spent: number; limit: number }>;
    topProviders: Array<{ key: string; spent: number; limit: number }>;
  } {
    const now = Date.now();
    return {
      globalDaily: {
        spent: Math.round(this.sumEntries(this.globalDaily, now, 86400000) * 10000) / 10000,
        limit: this.config.globalDailyUsd,
        ratio: this.config.globalDailyUsd > 0
          ? Math.round((this.sumEntries(this.globalDaily, now, 86400000) / this.config.globalDailyUsd) * 100) / 100
          : 0,
      },
      globalMonthly: {
        spent: Math.round(this.sumEntries(this.globalMonthly, now, 2592000000) * 10000) / 10000,
        limit: this.config.globalMonthlyUsd,
        ratio: this.config.globalMonthlyUsd > 0
          ? Math.round((this.sumEntries(this.globalMonthly, now, 2592000000) / this.config.globalMonthlyUsd) * 100) / 100
          : 0,
      },
      topSessions: this.getTopEntries(this.sessionDaily, now, 86400000, this.config.sessionDailyUsd),
      topProviders: this.getTopEntries(this.providerDaily, now, 86400000, this.config.providerDailyUsd),
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private sumEntries(entries: BudgetEntry[], now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    return entries
      .filter((e) => e.timestamp > cutoff)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  private checkLimit(
    scope: BudgetAlert['scope'],
    key: string,
    totalUsd: number,
    limitUsd: number,
    now: number
  ): BudgetAlert | null {
    const ratio = totalUsd / limitUsd;
    if (ratio < this.config.softLimitRatio) return null;

    const alertKey = `${scope}:${key}`;
    const lastAlert = this.recentAlerts.get(alertKey);
    if (lastAlert && now - lastAlert < this.alertDedupMs) return null;

    const type = ratio >= 1.0 ? 'hard' : 'soft';
    const action = type === 'hard' ? (this.config.hardBlock ? 'block' : 'warn')
      : (this.config.autoThrottle ? 'throttle' : 'warn');

    const alert: BudgetAlert = {
      type,
      scope,
      key,
      currentUsd: Math.round(totalUsd * 10000) / 10000,
      limitUsd,
      ratio: Math.round(ratio * 100) / 100,
      action,
      timestamp: now,
    };

    this.recentAlerts.set(alertKey, now);
    this.config.onAlert?.(alert);

    if (type === 'hard') {
      this.logger?.warn(`Budget HARD limit exceeded: ${scope}/${key} = $${alert.currentUsd}/$${limitUsd} (${alert.ratio})`);
    } else {
      this.logger?.info(`Budget soft limit warning: ${scope}/${key} = $${alert.currentUsd}/$${limitUsd} (${alert.ratio})`);
    }

    return alert;
  }

  private getTopEntries(
    tracker: Map<string, BudgetEntry[]>,
    now: number,
    windowMs: number,
    limit: number
  ): Array<{ key: string; spent: number; limit: number }> {
    const results: Array<{ key: string; spent: number; limit: number }> = [];
    for (const [key, entries] of tracker) {
      const spent = this.sumEntries(entries, now, windowMs);
      if (spent > 0) {
        results.push({ key, spent: Math.round(spent * 10000) / 10000, limit });
      }
    }
    return results.sort((a, b) => b.spent - a.spent).slice(0, 10);
  }
}

let globalBudget: BudgetManager | null = null;

export function getBudgetManager(config?: Partial<BudgetConfig>, logger?: any): BudgetManager {
  if (!globalBudget) {
    globalBudget = new BudgetManager(config, logger);
  } else if (config) {
    globalBudget.updateConfig(config);
  }
  return globalBudget;
}
