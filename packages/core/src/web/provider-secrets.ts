import type { AppConfig } from "@ccr/core/contracts/app";

export const webSecretPlaceholder = "[CCR REDACTED]";

function isSecretField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return /^(?:apikey|apitoken|authorization|proxyauthorization|cookie|setcookie|password|token|accesstoken|refreshtoken|secret|clientsecret)$/.test(normalized) ||
    /^x.*(?:apikey|token|secret)$/.test(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identity(value: unknown): string {
  if (!isRecord(value)) return "";
  return String(value.id || value.name || "");
}

function placeholder(path: string[]): string {
  // The reference contains only config identities, never credential material.
  return `${webSecretPlaceholder}:${Buffer.from(JSON.stringify(path)).toString("base64url")}`;
}

function isMasked(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${webSecretPlaceholder}:`);
}

function secretValue(value: unknown, path: string[]): unknown {
  if (typeof value === "string" && value) return placeholder(path);
  if (Array.isArray(value)) return value.map((item, index) => secretValue(item, [...path, String(index)]));
  return value;
}

function redact(value: unknown, path: string[]): unknown {
  if (Array.isArray(value)) return value.map((item, index) => redact(item, [...path, identity(item) || `@index:${index}`]));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    isSecretField(key) ? secretValue(item, [...path, key]) : redact(item, [...path, key])
  ]));
}

// Keep client gateway keys available to their dedicated key-management UI.
// Upstream provider credentials are write-only over the browser config API.
export function redactWebConfig(config: AppConfig): AppConfig {
  return { ...config, Providers: redact(config.Providers, ["Providers"]) as AppConfig["Providers"] };
}

function matchingItem(item: unknown, current: unknown[]): unknown {
  if (!isRecord(item)) return undefined;
  const identity = typeof item.id === "string" && item.id ? "id" : "name";
  if (typeof item[identity] !== "string" || !item[identity]) return undefined;
  const matches = current.filter(candidate => isRecord(candidate) && candidate[identity] === item[identity]);
  return matches.length === 1 ? matches[0] : undefined;
}

function restoreSecret(value: unknown, stored: unknown, path: string[]): unknown {
  if (Array.isArray(value)) return value.map((item, index) => restoreSecret(item, Array.isArray(stored) ? stored[index] : undefined, [...path, String(index)]));
  if (!isMasked(value)) return value;
  if (value !== placeholder(path) || typeof stored !== "string" || !stored || isMasked(stored)) {
    throw new Error("A redacted provider credential has no matching saved value. Reload the configuration or enter a new credential.");
  }
  return stored;
}

function restore(value: unknown, current: unknown, path: string[]): unknown {
  if (Array.isArray(value)) {
    const candidates = Array.isArray(current) ? current : [];
    return value.map((item, index) => {
      const stored = identity(item) ? matchingItem(item, candidates) : candidates[index];
      return restore(item, stored, [...path, identity(stored) || `@index:${index}`]);
    });
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const stored = isRecord(current) ? current[key] : undefined;
    return [key, isSecretField(key) ? restoreSecret(item, stored, [...path, key]) : restore(item, stored, [...path, key])];
  }));
}

export function restoreWebConfigSecrets(input: AppConfig, current: AppConfig): AppConfig {
  return { ...input, Providers: restore(input.Providers, current.Providers, ["Providers"]) as AppConfig["Providers"] };
}

function referencedSecrets(value: unknown, path: string[], reference: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => referencedSecrets(item, [...path, identity(item) || `@index:${index}`], reference));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const itemPath = [...path, key];
    return isSecretField(key) && typeof item === "string" && item && placeholder(itemPath) === reference
      ? [item] : referencedSecrets(item, itemPath, reference);
  });
}

export function restoreWebProbeSecrets(input: unknown, current: AppConfig): unknown {
  if (!isRecord(input)) return input;
  const urls = [input.baseUrl, ...(Array.isArray(input.candidates) ? input.candidates.map(candidate => isRecord(candidate) ? candidate.baseUrl : undefined) : [])]
    .filter((url): url is string => typeof url === "string").map(url => url.replace(/\/+$/, ""));
  const providers = current.Providers.filter(provider => {
    if (typeof input.providerName === "string" && input.providerName && provider.name !== input.providerName) return false;
    const configured = [provider.api_base_url, provider.baseUrl, provider.baseurl, ...(provider.capabilities ?? []).map(capability => capability.baseUrl)]
      .filter((url): url is string => typeof url === "string").map(url => url.replace(/\/+$/, ""));
    return urls.some(url => configured.includes(url));
  });
  const result = { ...input };
  if (isMasked(input.apiKey)) {
    const keys = new Set(referencedSecrets(providers, ["Providers"], input.apiKey));
    if (keys.size !== 1) throw new Error("Select a saved provider or enter a new API key before probing.");
    result.apiKey = [...keys][0];
  }
  if (isRecord(input.connector)) {
    const connectors = providers.flatMap(provider => provider.account?.connectors ?? []);
    const incoming = input.connector;
    const matches = connectors.filter(connector => incoming.id ? connector.id === incoming.id :
      connector.type === incoming.type && "endpoint" in connector && connector.endpoint === incoming.endpoint);
    const connector = matches.length === 1 ? matches[0] : undefined;
    const provider = providers.find(candidate => connector && candidate.account?.connectors?.includes(connector));
    const index = connector ? provider?.account?.connectors?.indexOf(connector) : undefined;
    result.connector = restore(incoming, connector, ["Providers", identity(provider), "account", "connectors", identity(connector) || `@index:${index}`]);
  }
  return result;
}
