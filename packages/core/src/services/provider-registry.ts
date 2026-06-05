/**
 * ProviderRegistry - 动态 Provider 注册服务
 *
 * Design: Zero hardcoding. All providers loaded from YAML config (via unified_config_manager.py)
 * or registered at runtime via API. New providers require config changes only, no code changes.
 *
 * Extends the existing ProviderService with:
 *   - Runtime registration/unregistration
 *   - YAML config file support (providers.yaml format)
 *   - Provider metadata (cost_tier, priority, concurrency_limit, etc.)
 *   - Health status tracking
 *   - Hot-reload capability
 */
import { EventEmitter } from "events";
import { ConfigService } from "./config";
import { TransformerService } from "./transformer";
import { ProviderService } from "./provider";
import {
  LLMProvider,
  RegisterProviderRequest,
} from "../types/llm";

function isPrivateIP(hostname: string): boolean {
  if (/^0[0-7]+(\.[0-7]+){0,3}$/.test(hostname)) {
    try {
      const parts = hostname.split('.').map(p => parseInt(p, 8));
      hostname = parts.join('.');
    } catch {}
  }
  if (/^\d{8,10}$/.test(hostname)) {
    const n = parseInt(hostname, 10);
    const a = (n >>> 24) & 0xff;
    const b = (n >>> 16) & 0xff;
    const c = (n >>> 8) & 0xff;
    const d = n & 0xff;
    hostname = `${a}.${b}.${c}.${d}`;
  }
  const hexMatch = hostname.match(/^0x([0-9a-f]+)$/i);
  if (hexMatch) {
    const n = parseInt(hexMatch[1], 16);
    if (n > 0) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      const c = (n >>> 8) & 0xff;
      const d = n & 0xff;
      hostname = `${a}.${b}.${c}.${d}`;
    }
  }
  if (hostname.includes(':')) {
    const v6 = hostname.toLowerCase();
    if (v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
        v6.startsWith('fe80') || v6.startsWith('fe90') || v6.startsWith('fea') || v6.startsWith('feb') ||
        v6 === '::' || v6 === '0:0:0:0:0:0:0:0' ||
        /^::ffff:/.test(v6)) return true;
  }
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|localhost)/i.test(hostname);
}

export interface ProviderMetadata {
  provider_type?: string;
  region?: string;
  description?: string;
  native_thinking?: boolean;
  supports_tools?: boolean;
  supports_streaming?: boolean;
  max_reasoning_tokens?: number;
  [key: string]: any;
}

export interface DynamicProviderConfig {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  protocol?: "anthropic" | "openai" | "gemini" | "custom";
  transformer?: any;
  priority: number;
  cost_tier: "high" | "medium" | "low";
  max_tokens: number;
  concurrency_limit: number;
  enabled: boolean;
  metadata?: ProviderMetadata;
}

export interface ProviderHealth {
  name: string;
  healthy: boolean;
  last_checked: number;
  error_count: number;
  consecutive_errors: number;
  avg_latency_ms: number;
  last_error?: string;
}

export interface RoutingRule {
  name: string;
  description?: string;
  priority: number;
  condition: {
    agent_patterns?: string[];
    task_types?: string[];
    task_complexity?: string;
    token_count_min?: number;
    token_count_max?: number;
    tool_count_min?: number;
    tool_count_max?: number;
    time_window?: string;
    thinking_enabled?: boolean;
    tool_patterns?: string[];
  };
  target: {
    provider: string;
    model: string;
    fallback_chain: string[];
  };
}

export interface ScenarioRouting {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
}

export class ProviderRegistry extends EventEmitter {
  private providerConfigs: Map<string, DynamicProviderConfig> = new Map();
  private healthStates: Map<string, ProviderHealth> = new Map();
  private routingRules: RoutingRule[] = [];

  constructor(
    private providerService: ProviderService,
    private configService: ConfigService,
    private transformerService: TransformerService,
    private logger: any
  ) {
    super();
    this.loadFromConfig();
  }

  /**
   * Load providers from the existing config (config.json Providers array).
   * This maintains backward compatibility during transition.
   */
  private loadFromConfig(): void {
    const providers = this.configService.get<any[]>("providers") || [];
    for (const p of providers) {
      if (!p.name) continue;
      this.providerConfigs.set(p.name, {
        name: p.name,
        api_base_url: p.api_base_url || p.baseUrl,
        api_key: p.api_key || p.apiKey,
        models: p.models || [],
        transformer: p.transformer,
        priority: p.priority || 99,
        cost_tier: p.cost_tier || "medium",
        max_tokens: p.max_tokens || 200000,
        concurrency_limit: p.concurrency_limit || 2,
        enabled: p.enabled !== false,
        metadata: p.metadata || {},
      });
      this.healthStates.set(p.name, this.createInitialHealth(p.name));
      try {
        const base = p.api_base_url || p.baseUrl;
        if (base) {
          const parsed = new URL(base);
          if (isPrivateIP(parsed.hostname)) {
            this.logger.warn(`ProviderRegistry: provider '${p.name}' has private IP baseUrl (${parsed.hostname}) - potential SSRF risk`);
          }
        }
      } catch {}
    }
    this.logger.info(
      `ProviderRegistry: loaded ${this.providerConfigs.size} providers from config`
    );
  }

  /**
   * Register a new provider at runtime.
   * Does NOT require restart - provider is immediately available for routing.
   */
  registerProvider(config: DynamicProviderConfig): LLMProvider {
    // Validate
    if (!config.name) throw new Error("Provider name is required");
    if (!config.api_base_url) throw new Error("API base URL is required");
    if (!config.api_key) throw new Error("API key is required");
    if (!config.models || config.models.length === 0)
      throw new Error("At least one model is required");

    this.providerConfigs.set(config.name, config);

    // Register with the existing ProviderService
    const provider = this.providerService.registerProvider({
      name: config.name,
      baseUrl: config.api_base_url,
      apiKey: config.api_key,
      models: config.models,
      transformer: config.transformer,
    });

    // Initialize health state
    this.healthStates.set(config.name, this.createInitialHealth(config.name));

    this.logger.info(`ProviderRegistry: registered provider '${config.name}'`);
    this.emit("provider:registered", { name: config.name, config });
    return provider;
  }

  /**
   * Unregister a provider at runtime.
   * Removes it from routing - no requests will be sent to this provider.
   */
  unregisterProvider(name: string): boolean {
    if (!this.providerConfigs.has(name)) return false;

    this.providerConfigs.delete(name);
    this.healthStates.delete(name);
    this.providerService.deleteProvider(name);

    this.logger.info(`ProviderRegistry: unregistered provider '${name}'`);
    this.emit("provider:unregistered", { name });
    return true;
  }

  /**
   * Enable or disable a provider without unregistering it.
   */
  setProviderEnabled(name: string, enabled: boolean): boolean {
    const config = this.providerConfigs.get(name);
    if (!config) return false;

    config.enabled = enabled;
    this.providerConfigs.set(name, config);

    this.logger.info(
      `ProviderRegistry: provider '${name}' ${enabled ? "enabled" : "disabled"}`
    );
    this.emit("provider:toggled", { name, enabled });
    return true;
  }

  /**
   * Get all registered provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this.providerConfigs.keys());
  }

  /**
   * Get provider config.
   */
  getProviderConfig(name: string): DynamicProviderConfig | undefined {
    return this.providerConfigs.get(name);
  }

  /**
   * Get all enabled providers sorted by priority.
   */
  getEnabledProviders(): DynamicProviderConfig[] {
    return Array.from(this.providerConfigs.values())
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get healthy + enabled providers (for routing decisions).
   */
  getAvailableProviders(): DynamicProviderConfig[] {
    return this.getEnabledProviders().filter((p) => {
      const health = this.healthStates.get(p.name);
      return health && health.healthy;
    });
  }

  // ==========================================================================
  // Health State
  // ==========================================================================

  private createInitialHealth(name: string): ProviderHealth {
    return {
      name,
      healthy: true, // Assume healthy until proven otherwise
      last_checked: Date.now(),
      error_count: 0,
      consecutive_errors: 0,
      avg_latency_ms: 0,
    };
  }

  /**
   * Mark provider as healthy/unhealthy based on request result.
   */
  updateHealth(
    name: string,
    success: boolean,
    latencyMs: number,
    error?: string
  ): void {
    const health = this.healthStates.get(name);
    if (!health) return;

    health.last_checked = Date.now();

    if (success) {
      health.consecutive_errors = 0;
      health.healthy = true;
      // Exponential moving average for latency
      health.avg_latency_ms =
        health.avg_latency_ms * 0.7 + latencyMs * 0.3;
    } else {
      health.error_count++;
      health.consecutive_errors++;
      health.last_error = error;

      // Mark unhealthy after 3 consecutive errors
      if (health.consecutive_errors >= 3) {
        health.healthy = false;
        this.logger.warn(
          `ProviderRegistry: provider '${name}' marked UNHEALTHY after ${health.consecutive_errors} consecutive errors`
        );
        this.emit("provider:unhealthy", { name, health });
      }
    }

    // Auto-recovery: if provider was unhealthy but gets a success, mark healthy again
    if (success && health.error_count > 0) {
      this.logger.info(
        `ProviderRegistry: provider '${name}' recovered (had ${health.error_count} total errors)`
      );
      this.emit("provider:recovered", { name, health });
    }
  }

  /**
   * Get provider health status.
   */
  getHealth(name: string): ProviderHealth | undefined {
    return this.healthStates.get(name);
  }

  /**
   * Get all provider health statuses.
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.healthStates.values());
  }

  /**
   * Check if a provider is currently healthy.
   */
  isHealthy(name: string): boolean {
    const health = this.healthStates.get(name);
    return health ? health.healthy : false;
  }

  // ==========================================================================
  // Routing Rules
  // ==========================================================================

  /**
   * Add a routing rule.
   * Rules with higher priority are evaluated first.
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule);
    this.routingRules.sort((a, b) => b.priority - a.priority);
    this.logger.debug(
      `ProviderRegistry: added routing rule '${rule.name}' (priority=${rule.priority})`
    );
  }

  /**
   * Remove a routing rule by name.
   */
  removeRoutingRule(name: string): boolean {
    const idx = this.routingRules.findIndex((r) => r.name === name);
    if (idx === -1) return false;
    this.routingRules.splice(idx, 1);
    return true;
  }

  /**
   * Get all routing rules (sorted by priority, descending).
   */
  getRoutingRules(): RoutingRule[] {
    return [...this.routingRules];
  }

  /**
   * Find matching routing rule for a request context.
   * Returns the highest-priority matching rule, or null.
   */
  findMatchingRule(context: {
    agentName?: string;
    taskType?: string;
    tokenCount?: number;
    toolCount?: number;
    thinkingEnabled?: boolean;
    toolNames?: string[];
  }): RoutingRule | null {
    for (const rule of this.routingRules) {
      if (this.ruleMatches(rule, context)) {
        return rule;
      }
    }
    return null;
  }

  private ruleMatches(
    rule: RoutingRule,
    ctx: {
      agentName?: string;
      taskType?: string;
      tokenCount?: number;
      toolCount?: number;
      thinkingEnabled?: boolean;
      toolNames?: string[];
    }
  ): boolean {
    const c = rule.condition;

    // Agent pattern matching
    if (c.agent_patterns && c.agent_patterns.length > 0) {
      if (
        !ctx.agentName ||
        !c.agent_patterns.some((p) =>
          ctx.agentName!.toLowerCase().includes(p.toLowerCase())
        )
      ) {
        return false;
      }
    }

    // Task type matching
    if (c.task_types && c.task_types.length > 0) {
      if (
        !ctx.taskType ||
        !c.task_types.some((t) => ctx.taskType!.toLowerCase() === t.toLowerCase())
      ) {
        return false;
      }
    }

    // Token count range
    if (c.token_count_min !== undefined && ctx.tokenCount !== undefined) {
      if (ctx.tokenCount < c.token_count_min) return false;
    }
    if (c.token_count_max !== undefined && ctx.tokenCount !== undefined) {
      if (ctx.tokenCount > c.token_count_max) return false;
    }

    // Tool count range
    if (c.tool_count_min !== undefined && ctx.toolCount !== undefined) {
      if (ctx.toolCount < c.tool_count_min) return false;
    }
    if (c.tool_count_max !== undefined && ctx.toolCount !== undefined) {
      if (ctx.toolCount > c.tool_count_max) return false;
    }

    // Thinking mode
    if (c.thinking_enabled !== undefined) {
      if (ctx.thinkingEnabled !== c.thinking_enabled) return false;
    }

    // Time window check
    if (c.time_window) {
      if (!this.isInTimeWindow(c.time_window)) return false;
    }

    // Tool patterns
    if (c.tool_patterns && c.tool_patterns.length > 0) {
      if (
        !ctx.toolNames ||
        !c.tool_patterns.some((p) =>
          ctx.toolNames!.some((t) => t.toLowerCase().includes(p.toLowerCase().replace(/\*/g, "")))
        )
      ) {
        return false;
      }
    }

    return true;
  }

  private isInTimeWindow(window: string): boolean {
    const [startStr, endStr] = window.split("-");
    if (!startStr || !endStr) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    if (endMinutes < startMinutes) {
      // Overnight window (e.g., 22:00-06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // ==========================================================================
  // Serialization (for dashboard/status API)
  // ==========================================================================

  /**
   * Export full registry state as JSON (for admin API).
   */
  exportState(): {
    providers: DynamicProviderConfig[];
    health: ProviderHealth[];
    rules: RoutingRule[];
  } {
    return {
      providers: Array.from(this.providerConfigs.values()).map((p) => ({
        ...p,
        api_key: "***REDACTED***", // Never expose API keys
      })),
      health: this.getAllHealth(),
      rules: this.getRoutingRules(),
    };
  }
}
