import { createHash } from "node:crypto";
import {
  availableGatewayModelIds,
  isGatewayProviderEnabled,
  type AppConfig,
  type GatewayProviderConfig,
  type GatewayProviderProtocol
} from "@ccr/core/contracts/app";
import type { RouteModelRef } from "@ccr/core/routing/contracts";

export type ResolveRouteModelOptions = {
  providerName?: string;
  protocol?: GatewayProviderProtocol;
};

export class ModelRegistry {
  private readonly gatewayModels: Map<string, string>;

  constructor(private readonly config: Pick<AppConfig, "Providers" | "virtualModelProfiles">) {
    this.gatewayModels = new Map(
      availableGatewayModelIds(config).map((model) => [model.toLowerCase(), model])
    );
  }

  resolve(value: string | undefined, options: ResolveRouteModelOptions = {}): RouteModelRef | undefined {
    const normalized = normalizeRouteSelector(value);
    if (!normalized) {
      return undefined;
    }

    if (options.providerName) {
      const provider = this.findProvider(options.providerName);
      const model = provider ? configuredProviderModel(provider, normalized) : undefined;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }

    const parsed = parseProviderModelSelector(normalized);
    if (parsed) {
      const provider = this.findProvider(parsed.provider);
      const model = provider ? configuredProviderModel(provider, parsed.model) : undefined;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }

    const gatewayModel = this.gatewayModels.get(normalized.toLowerCase());
    if (gatewayModel) {
      return {
        canonicalSelector: gatewayModel,
        kind: "gateway",
        model: gatewayModel,
        selector: gatewayModel
      };
    }

    const exactMatch = this.disambiguateByProtocol(
      this.providerModelMatches(normalized, false),
      options.protocol
    );
    if (exactMatch) {
      return providerModelRef(exactMatch.provider, exactMatch.model, normalized);
    }

    const caseInsensitiveMatch = this.disambiguateByProtocol(
      this.providerModelMatches(normalized, true),
      options.protocol
    );
    return caseInsensitiveMatch
      ? providerModelRef(caseInsensitiveMatch.provider, caseInsensitiveMatch.model, normalized)
      : undefined;
  }

  isConfigured(value: string | undefined, options: ResolveRouteModelOptions = {}): boolean {
    return Boolean(this.resolve(value, options));
  }

  findProvider(value: string | undefined): GatewayProviderConfig | undefined {
    const normalized = providerSelectorBase(value).toLowerCase();
    if (!normalized) {
      return undefined;
    }
    return this.config.Providers.find((provider) =>
      isGatewayProviderEnabled(provider) &&
      providerAliases(provider).has(normalized)
    );
  }

  resolveProviderModel(value: string | undefined): { model: string; provider: GatewayProviderConfig } | undefined {
    const resolved = this.resolve(value);
    return resolved?.kind === "provider"
      ? { model: resolved.model, provider: resolved.provider }
      : undefined;
  }

  resolveUniqueProviderModel(value: string | undefined): { model: string; provider: GatewayProviderConfig } | undefined {
    const normalized = normalizeRouteSelector(value);
    if (!normalized || parseProviderModelSelector(normalized)) {
      return undefined;
    }
    const resolved = this.resolve(normalized);
    return resolved?.kind === "provider"
      ? { model: resolved.model, provider: resolved.provider }
      : undefined;
  }

  private providerModelMatches(model: string, caseInsensitive: boolean) {
    const normalized = caseInsensitive ? model.toLowerCase() : model;
    const matches: Array<{ model: string; provider: GatewayProviderConfig }> = [];
    for (const provider of this.config.Providers) {
      if (!isGatewayProviderEnabled(provider)) {
        continue;
      }
      for (const candidate of provider.models) {
        const configured = candidate.trim();
        const comparable = caseInsensitive ? configured.toLowerCase() : configured;
        if (configured && comparable === normalized) {
          matches.push({ model: configured, provider });
        }
      }
    }
    return matches;
  }

  /**
   * Picks the single match among bare-id candidates, using the request protocol
   * to break ties when the same id is registered under multiple providers with
   * disjoint protocol capabilities. Returns undefined when the match is not
   * unique (keeps the pre-existing behavior for genuinely ambiguous ids).
   */
  private disambiguateByProtocol(
    matches: Array<{ model: string; provider: GatewayProviderConfig }>,
    protocol: GatewayProviderProtocol | undefined
  ): { model: string; provider: GatewayProviderConfig } | undefined {
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1 && protocol) {
      const protocolMatches = matches.filter(({ provider }) =>
        provider.capabilities?.some((capability) => capability.type === protocol)
      );
      if (protocolMatches.length === 1) {
        return protocolMatches[0];
      }
    }
    return undefined;
  }
}

const registryCache = new WeakMap<object, ModelRegistry>();

export function modelRegistryForConfig(
  config: Pick<AppConfig, "Providers" | "virtualModelProfiles">
): ModelRegistry {
  const key = config as object;
  const cached = registryCache.get(key);
  if (cached) {
    return cached;
  }
  const registry = new ModelRegistry(config);
  registryCache.set(key, registry);
  return registry;
}

export function normalizeRouteSelector(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : undefined;
  }
  return trimmed;
}

export function parseProviderModelSelector(value: string | undefined): { model: string; provider: string } | undefined {
  const normalized = normalizeRouteSelector(value);
  if (!normalized) {
    return undefined;
  }
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator >= normalized.length - 1) {
    return undefined;
  }
  const provider = normalized.slice(0, separator).trim();
  const model = normalized.slice(separator + 1).trim();
  return provider && model ? { model, provider } : undefined;
}

export function providerRuntimeId(provider: GatewayProviderConfig): string {
  const explicit = sanitizeProviderHeaderId(provider.id);
  if (explicit) {
    return explicit;
  }
  const normalized = provider.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = createHash("sha256")
    .update(`${provider.name}\n${providerBaseUrl(provider) ?? ""}`)
    .digest("hex")
    .slice(0, 10);
  return `provider-${normalized || "provider"}-${hash}`;
}

function providerModelRef(provider: GatewayProviderConfig, model: string, selector: string): RouteModelRef {
  return {
    canonicalSelector: `${provider.name}/${model}`,
    kind: "provider",
    model,
    provider,
    selector
  };
}

function configuredProviderModel(provider: GatewayProviderConfig, model: string): string | undefined {
  const normalized = model.trim().toLowerCase();
  return provider.models.find((candidate) => candidate.trim().toLowerCase() === normalized)?.trim();
}

type ProviderAliasCacheEntry = {
  name: string;
  id?: string;
  provider?: string;
  baseUrl?: string;
  aliases: ReadonlySet<string>;
};

const providerAliasCache = new WeakMap<GatewayProviderConfig, ProviderAliasCacheEntry>();

function providerAliases(provider: GatewayProviderConfig): ReadonlySet<string> {
  const cached = providerAliasCache.get(provider);
  const baseUrl = providerBaseUrl(provider);
  if (cached && cached.name === provider.name && cached.id === provider.id &&
    cached.provider === provider.provider && cached.baseUrl === baseUrl) {
    return cached.aliases;
  }
  const aliases = new Set(
    [provider.name, provider.id, provider.provider, providerRuntimeId(provider)]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
  providerAliasCache.set(provider, {
    name: provider.name, id: provider.id, provider: provider.provider, baseUrl, aliases
  });
  return aliases;
}

function providerSelectorBase(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  const separator = normalized.indexOf("::");
  if (separator < 0) {
    return normalized;
  }
  const provider = normalized.slice(0, separator).trim();
  const suffix = normalized.slice(separator + 2).trim();
  return provider && isKnownProviderInternalSuffix(suffix) ? provider : normalized;
}

function providerBaseUrl(provider: GatewayProviderConfig): string | undefined {
  return provider.baseurl || provider.baseUrl || provider.api_base_url;
}

function isKnownProviderInternalSuffix(value: string): boolean {
  const credentialMarker = "::cred:";
  const credentialIndex = value.indexOf(credentialMarker);
  const hasCredential = credentialIndex >= 0;
  if (hasCredential && !value.slice(credentialIndex + credentialMarker.length).trim()) {
    return false;
  }
  const protocol = hasCredential ? value.slice(0, credentialIndex) : value;
  return providerInternalProtocols.has(protocol);
}

const providerInternalProtocols = new Set([
  "anthropic_messages",
  "gemini_generate_content",
  "gemini_interactions",
  "openai_chat_completions",
  "openai_image_generations",
  "openai_responses",
  "openai_video_generations",
  "xai_video_generations"
]);

function sanitizeProviderHeaderId(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || undefined;
}
