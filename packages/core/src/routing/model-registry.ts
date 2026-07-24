import { createHash } from "node:crypto";
import {
  availableGatewayModelIds,
  isGatewayProviderEnabled,
  type AppConfig,
  type GatewayProviderConfig
} from "@ccr/core/contracts/app";
import type { RouteModelRef } from "@ccr/core/routing/contracts";

export type ResolveRouteModelOptions = {
  providerName?: string;
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

    if (options.providerName) {
      const provider = this.findProvider(options.providerName);
      const model = provider ? configuredProviderModel(provider, normalized) : undefined;
      if (provider && model) {
        return providerModelRef(provider, model, normalized);
      }
    }

    const exactMatches = this.providerModelMatches(normalized, false);
    if (exactMatches.length === 1) {
      return providerModelRef(exactMatches[0].provider, exactMatches[0].model, normalized);
    }
    if (exactMatches.length > 1) {
      return undefined;
    }

    const caseInsensitiveMatches = this.providerModelMatches(normalized, true);
    return caseInsensitiveMatches.length === 1
      ? providerModelRef(caseInsensitiveMatches[0].provider, caseInsensitiveMatches[0].model, normalized)
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

function providerAliases(provider: GatewayProviderConfig): Set<string> {
  return new Set(
    [provider.name, provider.id, provider.provider, providerRuntimeId(provider)]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
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
