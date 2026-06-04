/**
 * Key Rotator - 多Key轮询与故障转移
 *
 * Manages multiple API keys per provider:
 * - Round-robin rotation
 * - Failover on error (mark key as unhealthy, try next)
 * - Health tracking per key
 * - Automatic recovery after cooldown
 *
 * Design: Zero external dependencies.
 */

import { createHash } from "crypto";

export interface KeyRotatorConfig {
  enabled: boolean;
  /** Cooldown period for unhealthy keys in ms */
  cooldownMs: number;
  /** Max consecutive failures before marking unhealthy */
  maxFailures: number;
  /** Strategy: 'round_robin' | 'random' | 'least_used' */
  strategy: 'round_robin' | 'random' | 'least_used';
}

const DEFAULT_CONFIG: KeyRotatorConfig = {
  enabled: true,
  cooldownMs: 60000,
  maxFailures: 3,
  strategy: 'round_robin',
};

interface KeyState {
  key: string;
  fingerprint: string;
  healthy: boolean;
  failures: number;
  lastFailure: number;
  totalUses: number;
  lastUsed: number;
}

export class KeyRotator {
  private config: KeyRotatorConfig;
  private logger?: any;
  /** provider name → key states */
  private providerKeys: Map<string, KeyState[]> = new Map();
  /** provider name → current index for round-robin */
  private currentIndex: Map<string, number> = new Map();

  constructor(config: Partial<KeyRotatorConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Register keys for a provider.
   * @param provider Provider name
   * @param keys Single key string or array of key strings
   */
  registerKeys(provider: string, keys: string | string[]): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const states: KeyState[] = keyArray.map((key) => ({
      key,
      fingerprint: this.fingerprint(key),
      healthy: true,
      failures: 0,
      lastFailure: 0,
      totalUses: 0,
      lastUsed: 0,
    }));
    this.providerKeys.set(provider, states);
    this.currentIndex.set(provider, 0);
  }

  /**
   * Get the next available key for a provider.
   * @returns The key string, or null if all keys are unhealthy
   */
  getKey(provider: string): string | null {
    if (!this.config.enabled) {
      const keys = this.providerKeys.get(provider);
      return keys?.[0]?.key || null;
    }

    const keys = this.providerKeys.get(provider);
    if (!keys || keys.length === 0) return null;

    // Try to recover unhealthy keys that have passed cooldown
    this.recoverKeys(keys);

    // Filter healthy keys
    const healthyKeys = keys.filter((k) => k.healthy);
    if (healthyKeys.length === 0) {
      // All unhealthy - try the least recently failed one
      const leastRecent = keys.reduce((a, b) =>
        a.lastFailure < b.lastFailure ? a : b
      );
      this.logger?.warn(
        `KeyRotator [${provider}]: all keys unhealthy, using least recently failed`
      );
      return leastRecent.key;
    }

    // Select key based on strategy
    let selected: KeyState;
    switch (this.config.strategy) {
      case 'random':
        selected = healthyKeys[Math.floor(Math.random() * healthyKeys.length)];
        break;
      case 'least_used':
        selected = healthyKeys.reduce((a, b) =>
          a.totalUses < b.totalUses ? a : b
        );
        break;
      case 'round_robin':
      default: {
        const idx = this.currentIndex.get(provider) || 0;
        const selectedIdx = idx % healthyKeys.length;
        selected = healthyKeys[selectedIdx];
        this.currentIndex.set(provider, (idx + 1) % healthyKeys.length);
        break;
      }
    }

    selected.totalUses++;
    selected.lastUsed = Date.now();
    return selected.key;
  }

  /**
   * Report success for a key.
   */
  reportSuccess(provider: string, key: string): void {
    const keys = this.providerKeys.get(provider);
    if (!keys) return;

    const state = keys.find((k) => k.key === key);
    if (state) {
      state.failures = 0;
      state.healthy = true;
    }
  }

  /**
   * Report failure for a key.
   */
  reportFailure(provider: string, key: string, _error?: string): void {
    const keys = this.providerKeys.get(provider);
    if (!keys) return;

    const state = keys.find((k) => k.key === key);
    if (state) {
      state.failures++;
      state.lastFailure = Date.now();

      if (state.failures >= this.config.maxFailures) {
        state.healthy = false;
        this.logger?.warn(
          `KeyRotator [${provider}]: key ${state.fingerprint} marked unhealthy (${state.failures} failures)`
        );
      }
    }
  }

  /**
   * Get stats for all providers.
   */
  getStats(): Record<string, {
    totalKeys: number;
    healthyKeys: number;
    strategy: string;
    keys: Array<{ fingerprint: string; healthy: boolean; uses: number; failures: number }>;
  }> {
    const result: Record<string, any> = {};
    for (const [provider, keys] of this.providerKeys) {
      result[provider] = {
        totalKeys: keys.length,
        healthyKeys: keys.filter((k) => k.healthy).length,
        strategy: this.config.strategy,
        keys: keys.map((k) => ({
          fingerprint: k.fingerprint,
          healthy: k.healthy,
          uses: k.totalUses,
          failures: k.failures,
        })),
      };
    }
    return result;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<KeyRotatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Private
  // =========================================================================

  private recoverKeys(keys: KeyState[]): void {
    const now = Date.now();
    for (const key of keys) {
      if (!key.healthy && now - key.lastFailure > this.config.cooldownMs) {
        key.healthy = true;
        key.failures = 0;
        this.logger?.debug(`KeyRotator: key ${key.fingerprint} recovered`);
      }
    }
  }

  private fingerprint(key: string): string {
    if (key.length <= 8) return '****';
    return key.slice(0, 4) + '...' + key.slice(-4);
  }
}

let globalRotator: KeyRotator | null = null;

export function getKeyRotator(config?: Partial<KeyRotatorConfig>, logger?: any): KeyRotator {
  if (!globalRotator) {
    globalRotator = new KeyRotator(config, logger);
  } else if (config) {
    globalRotator.updateConfig(config);
  }
  return globalRotator;
}
