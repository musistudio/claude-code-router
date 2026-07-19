/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { AppConfig, GatewayProviderCapability, GatewayProviderCapabilityProtocol, GatewayProviderConfig, GatewayProviderProtocol, ProviderCredentialConfig } from "@ccr/core/contracts/app";
import { findProviderPresetByBaseUrl, providerApiKeySafetyIssue } from "@ccr/core/providers/presets/index";
import { normalizeProviderBaseUrl as normalizeProviderBaseUrlInput } from "@ccr/core/providers/url";
import { modelRegistryForConfig, parseProviderModelSelector, providerRuntimeId } from "@ccr/core/routing/model-registry";
import { gatewayProviderProtocolFallbackOrder, type CoreGatewayProvider } from "@ccr/core/gateway/internal/shared";

export function providerCapabilityForClientProtocol(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): (GatewayProviderCapability & { type: GatewayProviderProtocol }) | undefined {
  const capabilities = normalizedProviderCapabilities(provider);
  for (const protocol of providerProtocolPreferenceForClient(clientProtocol)) {
    const capability = capabilities.find(
      (item): item is GatewayProviderCapability & { type: GatewayProviderProtocol } => item.type === protocol
    );
    if (capability) {
      return capability;
    }
  }
  return undefined;
}

export function providerProtocolForClientProtocol(
  provider: GatewayProviderConfig,
  clientProtocol: GatewayProviderProtocol
): GatewayProviderProtocol | undefined {
  const capability = providerCapabilityForClientProtocol(provider, clientProtocol);
  if (capability) {
    return capability.type;
  }
  const directProtocol =
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  return providerProtocolPreferenceForClient(clientProtocol).includes(directProtocol)
    ? directProtocol
    : undefined;
}

function providerProtocolPreferenceForClient(clientProtocol: GatewayProviderProtocol): GatewayProviderProtocol[] {
  if (clientProtocol === "openai_responses") {
    return ["openai_responses", "openai_chat_completions", "anthropic_messages", "gemini_interactions"];
  }
  if (clientProtocol === "openai_chat_completions") {
    return ["openai_chat_completions", "openai_responses"];
  }
  if (clientProtocol === "anthropic_messages") {
    return uniqueProviderProtocols([clientProtocol, ...gatewayProviderProtocolFallbackOrder]);
  }
  return [clientProtocol];
}

function uniqueProviderProtocols(protocols: GatewayProviderProtocol[]): GatewayProviderProtocol[] {
  const seen = new Set<GatewayProviderProtocol>();
  const output: GatewayProviderProtocol[] = [];
  for (const protocol of protocols) {
    if (seen.has(protocol)) {
      continue;
    }
    seen.add(protocol);
    output.push(protocol);
  }
  return output;
}

export function findProviderByPublicOrInternalName(config: AppConfig, name: string): GatewayProviderConfig | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const credentialInternalName = parseProviderCredentialInternalName(name);
  if (credentialInternalName) {
    const internalProviderId = credentialInternalName.providerId.toLowerCase();
    return config.Providers.find((provider) =>
      provider.name.trim().toLowerCase() === internalProviderId ||
      providerRuntimeId(provider).toLowerCase() === internalProviderId
    );
  }
  return modelRegistryForConfig(config).findProvider(normalized);
}

export function activeProviderCredentials(provider: GatewayProviderConfig): ProviderCredentialConfig[] {
  return (provider.credentials ?? []).filter((credential) =>
    credential.enabled !== false &&
    Boolean(providerCredentialApiKey(credential))
  );
}

export function providerCredentialPriority(credential: ProviderCredentialConfig, index: number): number {
  return Number.isFinite(credential.priority) ? Number(credential.priority) : index + 1;
}


export function toCoreGatewayProviders(provider: GatewayProviderConfig): CoreGatewayProvider[] {
  const capabilities = normalizedProviderCapabilities(provider);
  if (capabilities.length === 0) {
    return toCoreGatewayProvidersForCapability(provider);
  }

  return capabilities
    .flatMap((capability) => toCoreGatewayProvidersForCapability(provider, capability))
    .filter((item): item is CoreGatewayProvider => Boolean(item));
}


function toCoreGatewayProvidersForCapability(
  provider: GatewayProviderConfig,
  capability?: GatewayProviderCapability
): CoreGatewayProvider[] {
  const credentials = activeProviderCredentials(provider);
  if (credentials.length === 0) {
    const coreProvider = toCoreGatewayProvider(provider, capability);
    return coreProvider ? [coreProvider] : [];
  }

  return sortProviderCredentialsForConfig(credentials)
    .map((credential) => toCoreGatewayProvider(provider, capability, credential))
    .filter((item): item is CoreGatewayProvider => Boolean(item));
}


function toCoreGatewayProvider(
  provider: GatewayProviderConfig,
  capability?: GatewayProviderCapability,
  credential?: ProviderCredentialConfig
): CoreGatewayProvider | undefined {
  const type =
    capability?.type ??
    normalizeProviderProtocol(provider.type) ??
    normalizeProviderProtocol(provider.provider) ??
    inferProtocol(provider);
  const baseurl = normalizeProviderRuntimeBaseUrl(capability?.baseUrl ?? readBaseUrl(provider), type);
  const apikey = credential ? providerCredentialApiKey(credential) : provider.apikey || provider.apiKey || provider.api_key;

  if (!provider.name || provider.models.length === 0) {
    return undefined;
  }
  const safetyIssue = providerApiKeySafetyIssue({
    apiKey: apikey,
    baseUrl: baseurl ?? "",
    name: provider.name
  });
  if (safetyIssue) {
    throw new Error(safetyIssue.message);
  }

  return {
    apikey,
    baseurl,
    billing: provider.billing,
    extraBody: provider.extraBody,
    extraHeaders: provider.extraHeaders,
    models: provider.models,
    name: credential
      ? providerCredentialInternalName(provider, type, credential)
      : capability
        ? providerCapabilityInternalName(provider, type)
        : providerRuntimeId(provider),
    type
  };
}


export function sortProviderCredentialsForConfig(credentials: ProviderCredentialConfig[]): ProviderCredentialConfig[] {
  return [...credentials].sort((left, right) =>
    providerCredentialPriority(left, 0) - providerCredentialPriority(right, 0) ||
    providerCredentialSortKey(left).localeCompare(providerCredentialSortKey(right))
  );
}


export function normalizedProviderCapabilities(provider: GatewayProviderConfig): GatewayProviderCapability[] {
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
  const normalized: GatewayProviderCapability[] = [];
  const byProtocol = new Map<GatewayProviderCapabilityProtocol, GatewayProviderCapability>();
  for (const capability of capabilities) {
    const type = normalizeProviderCapabilityProtocol(capability.type);
    const baseUrl = capability.baseUrl?.trim();
    if (!type || !baseUrl) {
      continue;
    }
    const item = {
      ...capability,
      baseUrl,
      type
    };
    const existing = byProtocol.get(type);
    if (!existing || providerCapabilityPriority(item) < providerCapabilityPriority(existing)) {
      byProtocol.set(type, item);
    }
  }
  for (const capability of capabilities) {
    const type = normalizeProviderCapabilityProtocol(capability.type);
    const selected = type ? byProtocol.get(type) : undefined;
    if (selected && !normalized.includes(selected)) {
      normalized.push(selected);
    }
  }
  return applyPresetProtocolLock(provider, normalized);
}


function applyPresetProtocolLock(
  provider: GatewayProviderConfig,
  capabilities: GatewayProviderCapability[]
): GatewayProviderCapability[] {
  const lockedProtocols = lockedProviderPresetProtocols(provider, capabilities);
  if (lockedProtocols.length === 0) {
    return capabilities;
  }

  const lockedProtocolSet = new Set(lockedProtocols);
  const lockedCapabilities = capabilities.filter((capability) => {
    const protocol = normalizeProviderProtocol(capability.type);
    return Boolean(protocol && lockedProtocolSet.has(protocol));
  });
  if (lockedCapabilities.length > 0) {
    return lockedCapabilities;
  }

  const lockedProtocol = lockedProtocols[0];
  const baseUrl = readBaseUrl(provider);
  const normalizedBaseUrl = normalizeProviderRuntimeBaseUrl(baseUrl, lockedProtocol);
  return normalizedBaseUrl
    ? [{ baseUrl: normalizedBaseUrl, source: "preset", type: lockedProtocol }]
    : [];
}


function lockedProviderPresetProtocols(
  provider: GatewayProviderConfig,
  capabilities: GatewayProviderCapability[]
): GatewayProviderProtocol[] {
  const baseUrls = [
    readBaseUrl(provider),
    ...capabilities.map((capability) => capability.baseUrl)
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const baseUrl of baseUrls) {
    if (findProviderPresetByBaseUrl(baseUrl)?.id === "gemini") {
      return ["gemini_generate_content", "gemini_interactions"];
    }
  }

  return [];
}


function providerCapabilityPriority(capability: GatewayProviderCapability): number {
  if (capability.source === "preset") {
    return 0;
  }
  if (capability.source === "detected") {
    return 2;
  }
  return 1;
}


export function providerCapabilityInternalName(provider: GatewayProviderConfig, protocol: GatewayProviderCapabilityProtocol): string {
  return `${providerRuntimeId(provider)}::${protocol}`;
}


function providerCapabilityLegacyInternalName(providerName: string, protocol: GatewayProviderCapabilityProtocol): string {
  return `${providerName}::${protocol}`;
}


export function providerCapabilityNameMatches(provider: GatewayProviderConfig, protocol: GatewayProviderCapabilityProtocol, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return providerCapabilityInternalName(provider, protocol).toLowerCase() === normalized ||
    providerCapabilityLegacyInternalName(provider.name, protocol).toLowerCase() === normalized;
}


export function sanitizeHeaderValue(value: unknown): string {
  // HTTP header values must be ByteString (code point <= 255). Values derived
  // from user-facing names — model selectors like "小米mimo/...", provider
  // names, route reasons — can contain non-ASCII characters that crash Node's
  // fetch/undici with "Cannot convert argument to a ByteString" (surfaced as
  // 502). Normalize to ASCII while preserving case and printable punctuation.
  const text = typeof value === "string" && value.trim() ? value : "unknown";
  const sanitized = text
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}


export function providerCredentialInternalName(
  provider: GatewayProviderConfig,
  protocol: GatewayProviderCapabilityProtocol,
  credential: ProviderCredentialConfig
): string {
  return `${providerCapabilityInternalName(provider, protocol)}::cred:${providerCredentialSlug(providerCredentialRuntimeId(provider, credential))}`;
}


export function parseProviderCredentialInternalName(value: string | undefined): {
  credentialSlug: string;
  providerId: string;
  protocol: GatewayProviderCapabilityProtocol;
} | undefined {
  const marker = "::cred:";
  const markerIndex = value?.lastIndexOf(marker) ?? -1;
  if (!value || markerIndex <= 0) {
    return undefined;
  }
  const baseName = value.slice(0, markerIndex);
  const credentialSlug = value.slice(markerIndex + marker.length).trim();
  const protocolSeparator = baseName.lastIndexOf("::");
  if (!credentialSlug || protocolSeparator <= 0) {
    return undefined;
  }
  const protocol = normalizeProviderCapabilityProtocol(baseName.slice(protocolSeparator + 2));
  const providerId = baseName.slice(0, protocolSeparator).trim();
  return protocol && providerId ? { credentialSlug, providerId, protocol } : undefined;
}


export function providerCredentialSlug(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "key";
}


export function providerCredentialRuntimeId(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  index = provider.credentials?.indexOf(credential) ?? -1
): string {
  const explicitId = credential.id?.trim();
  if (explicitId) {
    return explicitId;
  }
  const oneBasedIndex = index >= 0 ? index + 1 : 1;
  const label = credential.name?.trim() || credential.label?.trim();
  return label ? `${providerCredentialSlug(label)}-${oneBasedIndex}` : `key-${oneBasedIndex}`;
}


function providerCredentialSortKey(credential: ProviderCredentialConfig): string {
  return providerCredentialSlug(credential.id || credential.name || credential.label);
}


export function providerCredentialApiKey(credential: ProviderCredentialConfig): string {
  return credential.api_key || credential.apiKey || credential.apikey || "";
}


export function findProviderCredentialByRuntimeId(
  provider: GatewayProviderConfig,
  credentialId: string
): ProviderCredentialConfig | undefined {
  const normalizedId = credentialId.trim();
  const normalizedSlug = providerCredentialSlug(normalizedId);
  return (provider.credentials ?? []).find((credential, index) => {
    const runtimeId = providerCredentialRuntimeId(provider, credential, index);
    return runtimeId === normalizedId || providerCredentialSlug(runtimeId) === normalizedSlug || credential.id?.trim() === normalizedId;
  });
}


export function findProviderCredentialBySlug(
  provider: GatewayProviderConfig,
  credentialSlug: string
): ProviderCredentialConfig | undefined {
  const normalizedSlug = providerCredentialSlug(credentialSlug);
  return (provider.credentials ?? []).find((credential, index) => providerCredentialSlug(providerCredentialRuntimeId(provider, credential, index)) === normalizedSlug);
}


export function normalizeProviderProtocol(value: unknown): GatewayProviderProtocol | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai_responses") {
    return "openai_responses";
  }
  if (normalized === "openai_chat" || normalized === "openai_chat_completions") {
    return "openai_chat_completions";
  }
  if (normalized === "anthropic" || normalized === "anthropic_messages") {
    return "anthropic_messages";
  }
  if (normalized === "gemini" || normalized === "gemini_generate_content") {
    return "gemini_generate_content";
  }
  if (
    normalized === "gemini_interactions" ||
    normalized === "gemini-interactions" ||
    normalized === "google_interactions" ||
    normalized === "google-interactions" ||
    normalized === "interactions" ||
    normalized === "interaction"
  ) {
    return "gemini_interactions";
  }
  return undefined;
}

export function normalizeProviderCapabilityProtocol(value: unknown): GatewayProviderCapabilityProtocol | undefined {
  const chatProtocol = normalizeProviderProtocol(value);
  if (chatProtocol) {
    return chatProtocol;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai_image_generations" || normalized === "openai_images") {
    return "openai_image_generations";
  }
  if (normalized === "openai_video_generations" || normalized === "openai_videos") {
    return "openai_video_generations";
  }
  return undefined;
}


export function inferProtocol(provider: GatewayProviderConfig): GatewayProviderProtocol {
  const url = readBaseUrl(provider)?.toLowerCase() ?? "";
  const transformerNames = JSON.stringify(provider.transformer ?? "").toLowerCase();
  if (url.includes("/interactions") || transformerNames.includes("gemini_interactions")) {
    return "gemini_interactions";
  }
  if (url.includes("generativelanguage.googleapis.com") || transformerNames.includes("gemini")) {
    return "gemini_generate_content";
  }
  if (url.includes("anthropic") || transformerNames.includes("anthropic")) {
    return "anthropic_messages";
  }
  return "openai_chat_completions";
}


export function resolveResponseProviderProtocol(headers: Headers, config: AppConfig | undefined): GatewayProviderProtocol | undefined {
  const ccrProtocol = normalizeProviderProtocol(headers.get("x-ccr-provider-protocol"));
  if (ccrProtocol) {
    return ccrProtocol;
  }
  const providerName =
    headers.get("x-gateway-target-provider-name")?.trim() ||
    headers.get("x-gateway-target-provider")?.trim();
  if (!providerName) {
    return undefined;
  }
  const credentialInternalName = parseProviderCredentialInternalName(providerName);
  if (credentialInternalName) {
    return normalizeProviderProtocol(credentialInternalName.protocol);
  }
  const provider = config ? findProviderByPublicOrInternalName(config, providerName) : undefined;
  if (!provider) {
    return normalizeProviderProtocol(providerName);
  }
  const capability = normalizedProviderCapabilities(provider).find((item) =>
    providerCapabilityNameMatches(provider, item.type, providerName)
  );
  if (capability && normalizeProviderProtocol(capability.type)) {
    return normalizeProviderProtocol(capability.type);
  }
  return normalizeProviderProtocol(provider.type) ?? normalizeProviderProtocol(provider.provider) ?? inferProtocol(provider);
}


export function resolveProviderLogName(headers: Headers, config: AppConfig | undefined, fallbackModel?: string): string | undefined {
  const providerSelector =
    headers.get("x-gateway-target-provider-name")?.trim() ||
    headers.get("x-gateway-target-provider")?.trim();
  const headerProvider = providerSelector && config
    ? findProviderByPublicOrInternalName(config, providerSelector)
    : undefined;
  if (headerProvider) {
    return headerProvider.name;
  }

  const routeProvider = parseProviderModelSelector(fallbackModel)?.provider;
  const modelProvider = routeProvider && config
    ? findProviderByPublicOrInternalName(config, routeProvider)
    : undefined;
  return modelProvider?.name;
}


function providerMatchesName(provider: GatewayProviderConfig, name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  return [provider.id, provider.name, provider.provider]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => value.trim().toLowerCase() === normalizedName);
}


function normalizeProviderRuntimeBaseUrl(value: string | undefined, type: GatewayProviderCapabilityProtocol): string | undefined {
  if (!value) {
    return undefined;
  }
  return normalizeProviderProtocol(type)
    ? normalizeProviderBaseUrlInput(value, normalizeProviderProtocol(type)) || undefined
    : normalizeProviderBaseUrlInput(value) || undefined;
}


function readBaseUrl(provider: GatewayProviderConfig): string | undefined {
  return provider.baseurl || provider.baseUrl || provider.api_base_url;
}
