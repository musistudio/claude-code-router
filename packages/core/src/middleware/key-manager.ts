export interface KeyManagerConfig {
  enabled: boolean;
  providers: Record<string, KeyConfig>;
}

const DEFAULT_MGR_CONFIG: KeyManagerConfig = {
  enabled: false,
  providers: {},
};

export class KeyManager {
  private mgrConfig: KeyManagerConfig;
  private providerManagers: Map<string, KeyManagerInner> = new Map();

  constructor(config: Partial<KeyManagerConfig> = {}, private logger?: any) {
    this.mgrConfig = { ...DEFAULT_MGR_CONFIG, ...config };
    for (const [provider, keyConfig] of Object.entries(this.mgrConfig.providers)) {
      this.providerManagers.set(provider, new KeyManagerInner(keyConfig, logger));
    }
  }

  initialize(): void {
    this.logger?.info(`KeyManager: ${this.providerManagers.size} providers configured`);
  }

  getActiveKey(provider: string): string | null {
    const mgr = this.providerManagers.get(provider);
    if (!mgr) return null;
    return mgr.getActiveKey();
  }

  reportError(provider: string, key: string, statusCode: number): void {
    const mgr = this.providerManagers.get(provider);
    if (!mgr) return;
    mgr.reportError(key, statusCode);
  }

  reportSuccess(provider: string, key: string): void {
    const mgr = this.providerManagers.get(provider);
    if (!mgr) return;
    mgr.reportSuccess(key);
  }

  getStats(): { enabled: boolean; providers: number; totalKeys: number } {
    let totalKeys = 0;
    for (const mgr of this.providerManagers.values()) {
      totalKeys += mgr.getKeyStats().length;
    }
    return { enabled: this.mgrConfig.enabled, providers: this.providerManagers.size, totalKeys };
  }
}

export interface KeyConfig {
  provider: string;
  keys: string[];
  strategy: "round-robin" | "random" | "least-used";
  cooldownMs: number;
}

interface KeyStats {
  key: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  lastUsed: number;
  lastError: number;
  cooldownUntil: number;
}

const DEFAULT_KEY_CONFIG: KeyConfig = {
  provider: "anthropic",
  keys: [],
  strategy: "round-robin",
  cooldownMs: 30000,
};

class KeyManagerInner {
  private config: KeyConfig;
  private stats: Map<string, KeyStats> = new Map();
  private roundRobinIndex = 0;

  constructor(config: KeyConfig, private logger?: any) {
    this.config = { ...DEFAULT_KEY_CONFIG, ...config };
    for (const key of this.config.keys) {
      this.stats.set(key, {
        key,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        lastUsed: 0,
        lastError: 0,
        cooldownUntil: 0,
      });
    }
  }

  getActiveKey(): string | null {
    const now = Date.now();
    const available = this.config.keys.filter((k) => {
      const s = this.stats.get(k);
      return s && s.cooldownUntil <= now;
    });

    if (available.length === 0) {
      const allCooled = this.config.keys.filter((k) => {
        const s = this.stats.get(k);
        return s && s.cooldownUntil > now;
      });

      if (allCooled.length > 0) {
        allCooled.sort((a, b) => {
          const sa = this.stats.get(a)!;
          const sb = this.stats.get(b)!;
          return sa.cooldownUntil - sb.cooldownUntil;
        });
        const earliest = allCooled[0];
        this.logger?.warn(`KeyManager: all keys in cooldown, using earliest: ${this.maskKey(earliest)}`);
        const s = this.stats.get(earliest)!;
        s.cooldownUntil = 0;
        return earliest;
      }

      this.logger?.error("KeyManager: no keys configured");
      return null;
    }

    let selected: string;

    switch (this.config.strategy) {
      case "round-robin":
        selected = available[this.roundRobinIndex % available.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % available.length;
        break;
      case "random":
        selected = available[Math.floor(Math.random() * available.length)];
        break;
      case "least-used":
        selected = available.reduce((best, k) => {
          const bs = this.stats.get(best)!;
          const ks = this.stats.get(k)!;
          return ks.requestCount < bs.requestCount ? k : best;
        }, available[0]);
        break;
      default:
        selected = available[0];
    }

    const stat = this.stats.get(selected)!;
    stat.requestCount++;
    stat.lastUsed = now;
    return selected;
  }

  reportError(key: string, statusCode: number): void {
    const stat = this.stats.get(key);
    if (!stat) return;

    stat.errorCount++;
    stat.lastError = Date.now();

    if (statusCode === 429 || statusCode === 401 || statusCode === 403) {
      stat.cooldownUntil = Date.now() + this.config.cooldownMs;
      this.logger?.warn(
        `KeyManager: key ${this.maskKey(key)} got ${statusCode}, cooldown for ${this.config.cooldownMs}ms`
      );
    }
  }

  reportSuccess(key: string): void {
    const stat = this.stats.get(key);
    if (!stat) return;
    stat.successCount++;
  }

  getKeyStats(): KeyStats[] {
    return Array.from(this.stats.values()).map((s) => ({ ...s }));
  }

  addKey(key: string): void {
    if (this.stats.has(key)) return;
    this.stats.set(key, {
      key,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      lastUsed: 0,
      lastError: 0,
      cooldownUntil: 0,
    });
    if (!this.config.keys.includes(key)) {
      this.config.keys.push(key);
    }
  }

  removeKey(key: string): void {
    this.stats.delete(key);
    this.config.keys = this.config.keys.filter((k) => k !== key);
  }

  getActiveKeyCount(): number {
    const now = Date.now();
    return this.config.keys.filter((k) => {
      const s = this.stats.get(k);
      return s && s.cooldownUntil <= now;
    }).length;
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}
