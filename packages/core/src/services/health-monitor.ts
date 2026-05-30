/**
 * HealthMonitor - Provider 健康监控服务
 *
 * Periodic health checks for all registered providers.
 * Automatically detects failures and reports via EventEmitter.
 * Integrates with ProviderRegistry to update health status.
 *
 * Design: Zero external dependencies. Uses standard HTTP fetch for health checks.
 * Each provider can have a custom health endpoint or use the default ping.
 */
import { EventEmitter } from "events";
import { ProviderRegistry, ProviderHealth } from "./provider-registry";

export interface HealthMonitorConfig {
  checkIntervalMs: number; // How often to run health checks (default: 30000)
  requestTimeoutMs: number; // Timeout per health check request (default: 10000)
  unhealthyThreshold: number; // Consecutive failures before marking unhealthy (default: 3)
  recoveryThreshold: number; // Consecutive successes before marking healthy (default: 2)
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 30000,
  requestTimeoutMs: 10000,
  unhealthyThreshold: 3,
  recoveryThreshold: 2,
};

export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private consecutiveSuccesses: Map<string, number> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(
    private registry: ProviderRegistry,
    config: Partial<HealthMonitorConfig> = {},
    private logger?: any
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic health checks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger?.info(
      `HealthMonitor: starting (interval=${this.config.checkIntervalMs}ms)`
    );

    // Run initial check immediately
    this.checkAll();

    // Then periodically
    this.intervalId = setInterval(() => {
      this.checkAll();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic health checks.
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger?.info("HealthMonitor: stopped");
  }

  /**
   * Check health of all registered providers.
   */
  async checkAll(): Promise<void> {
    const providers = this.registry.getProviderNames();
    const checks = providers.map((name) => this.checkProvider(name));
    await Promise.allSettled(checks);
  }

  /**
   * Check health of a single provider.
   */
  async checkProvider(name: string): Promise<boolean> {
    const config = this.registry.getProviderConfig(name);
    if (!config) return false;

    const startTime = Date.now();
    let isHealthy = false;

    try {
      // Simple connectivity check: make a HEAD/GET to the base URL
      // For production, this could be a lightweight /health or /models endpoint
      const baseUrl = config.api_base_url;
      // Derive health URL from base
      const url = this.deriveHealthUrl(baseUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.requestTimeoutMs
      );

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Any response (even 404/405) means the server is reachable
      isHealthy = true;
    } catch {
      isHealthy = false;
    }

    const latencyMs = Date.now() - startTime;

    // Track consecutive successes/failures for hysteresis
    if (isHealthy) {
      const successes = (this.consecutiveSuccesses.get(name) || 0) + 1;
      this.consecutiveSuccesses.set(name, successes);
      this.consecutiveFailures.set(name, 0);
    } else {
      const failures = (this.consecutiveFailures.get(name) || 0) + 1;
      this.consecutiveFailures.set(name, failures);
      this.consecutiveSuccesses.set(name, 0);
    }

    // Update registry health with hysteresis
    const prevHealth = this.registry.getHealth(name);
    const prevHealthy = prevHealth?.healthy ?? true;

    let newHealthy: boolean;
    if (isHealthy) {
      newHealthy =
        prevHealthy ||
        (this.consecutiveSuccesses.get(name) || 0) >=
          this.config.recoveryThreshold;
    } else {
      newHealthy =
        prevHealthy &&
        (this.consecutiveFailures.get(name) || 0) < this.config.unhealthyThreshold;
    }

    this.registry.updateHealth(name, isHealthy, latencyMs);

    // Emit events on state changes
    if (!prevHealthy && newHealthy) {
      this.emit("provider:recovered", { name, latencyMs });
      this.logger?.info(`HealthMonitor: ${name} RECOVERED (${latencyMs}ms)`);
    } else if (prevHealthy && !newHealthy) {
      this.emit("provider:failed", { name, latencyMs });
      this.logger?.warn(
        `HealthMonitor: ${name} FAILED (${this.consecutiveFailures.get(name)} consecutive)`
      );
    }

    return isHealthy;
  }

  /**
   * Derive a health check URL from the provider's base URL.
   */
  private deriveHealthUrl(baseUrl: string): string {
    // Remove trailing path components like /v1/messages or /chat/completions
    let url = baseUrl;

    // Try common health endpoints
    if (url.includes("/v1/messages")) {
      return url.replace(/\/v1\/messages$/, "/v1/models");
    }
    if (url.includes("/chat/completions")) {
      return url.replace(/\/chat\/completions$/, "/models");
    }

    // Fallback: just use the base
    return url;
  }

  /**
   * Get current health summary for all providers.
   */
  getSummary(): { name: string; healthy: boolean; latency: number }[] {
    const providers = this.registry.getProviderNames();
    return providers.map((name) => {
      const health = this.registry.getHealth(name);
      return {
        name,
        healthy: health?.healthy ?? false,
        latency: health?.avg_latency_ms ?? 0,
      };
    });
  }

  /**
   * Force a health check (for use before routing decisions).
   */
  async checkBeforeRoute(name: string): Promise<boolean> {
    return this.checkProvider(name);
  }
}
