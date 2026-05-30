/**
 * Provider Registry - Data-driven provider configuration.
 *
 * No hardcoded provider URLs or model names. Everything comes from
 * config.json. Adding a new provider only requires editing config,
 * never code changes.
 */

/** Wire protocol the provider speaks */
export enum WireProtocol {
  AnthropicMessages = 'anthropic_messages',
  OpenAiChatCompletions = 'openai_chat_completions',
}

/** Feature support flags for a provider */
export interface ProviderCapabilities {
  toolCalls: boolean;
  streaming: boolean;
  streamingUsage: boolean;
  promptCache: boolean;
  reasoningEffort: boolean;
  reasoningContentHistory: boolean;
  webSearch: 'supported' | 'passthrough' | 'unsupported';
}

/** Static metadata for a model family */
export interface ProviderMetadata {
  provider: string;
  authEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  wireProtocol: WireProtocol;
  capabilities: ProviderCapabilities;
}

/** Token limits for a specific model */
export interface ModelTokenLimit {
  maxOutputTokens: number;
  contextWindowTokens: number;
}

/** A registered provider entry from config */
export interface ProviderEntry {
  name: string;
  api_base_url: string;
  api_key?: string;
  models: string[];
  transformer?: any;
  metadata?: Partial<ProviderMetadata>;
  tokenLimits?: Record<string, ModelTokenLimit>;
}

/**
 * Model tier classification - mirrors Claude Code haiku/sonnet/opus design.
 */
export enum ModelTier {
  Haiku = 'haiku',
  Sonnet = 'sonnet',
  Opus = 'opus',
}

/** Tier routing configuration */
export interface TierRouteConfig {
  route: string;
  tokenThreshold?: number;
  keywords?: string[];
  toolThreshold?: number;
}

/**
 * ProviderRegistry - the central registry for all provider/model information.
 * Populated entirely from config.json at startup. No hardcoded values.
 */
export class ProviderRegistry {
  private providers: Map<string, ProviderEntry> = new Map();
  private modelToProvider: Map<string, string> = new Map();
  private tokenLimits: Map<string, ModelTokenLimit> = new Map();
  private tierRoutes: Map<ModelTier, TierRouteConfig> = new Map();

  constructor(providers: ProviderEntry[], tierConfig?: Record<string, TierRouteConfig>) {
    for (const p of providers) {
      this.providers.set(p.name.toLowerCase(), p);
      for (const m of p.models) {
        this.modelToProvider.set(m.toLowerCase(), p.name);
      }
      if (p.tokenLimits) {
        for (const [model, limits] of Object.entries(p.tokenLimits)) {
          this.tokenLimits.set(model.toLowerCase(), limits);
        }
      }
    }
    if (tierConfig) {
      for (const [tier, config] of Object.entries(tierConfig)) {
        this.tierRoutes.set(tier as ModelTier, config);
      }
    }
  }

  getProvider(name: string): ProviderEntry | undefined {
    return this.providers.get(name.toLowerCase());
  }

  getProviderForModel(model: string): string | undefined {
    return this.modelToProvider.get(model.toLowerCase());
  }

  getTokenLimits(model: string): ModelTokenLimit | undefined {
    return this.tokenLimits.get(model.toLowerCase());
  }

  getTierRoute(tier: ModelTier): TierRouteConfig | undefined {
    return this.tierRoutes.get(tier);
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getAllModels(): string[] {
    return Array.from(this.modelToProvider.keys());
  }
}
