import {
  customProviderPresetId,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint,
  type ProviderPresetEndpointVariable
} from "@ccr/core/providers/presets/types";
import { providerUrlWithDefaultScheme } from "@ccr/core/providers/url";

export function findProviderPresetInList(
  presets: ProviderPreset[],
  id: string | undefined
): ProviderPreset | undefined {
  if (!id || id === customProviderPresetId) {
    return undefined;
  }
  return presets.find((preset) => preset.id === id);
}

export function findProviderPresetByBaseUrlInList(
  presets: ProviderPreset[],
  baseUrl: string
): ProviderPreset | undefined {
  return presets.find((preset) =>
    providerPresetMatchesBaseUrl(preset, baseUrl)
  );
}

export function findProviderPresetByIdentityInList(
  presets: ProviderPreset[],
  name: string | undefined
): ProviderPreset | undefined {
  return findProviderPresetsByIdentity(presets, name)[0];
}

export function primaryProviderPresetEndpoint(preset: ProviderPreset): ProviderPresetEndpoint | undefined {
  return preset.endpoints[0];
}

export function providerIdentitySafetyIssueInList(
  _presets: ProviderPreset[],
  input: {
    baseUrl: string;
    name?: string;
    presetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  void input;
  return undefined;
}

export function providerApiKeySafetyIssueInList(
  _presets: ProviderPreset[],
  input: {
    apiKey?: string;
    baseUrl: string;
    name?: string;
    presetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  void input;
  return undefined;
}

export function providerPresetMatchesBaseUrl(preset: ProviderPreset, baseUrl: string): boolean {
  return preset.endpoints.some((endpoint) => providerEndpointMatchesBaseUrl(endpoint.baseUrl, baseUrl));
}

export function providerPresetHasTemplateEndpoints(preset: ProviderPreset): boolean {
  return preset.endpoints.some((endpoint) => providerEndpointHasVariables(endpoint));
}

/**
 * Replaces `{Name}` placeholders in a template endpoint's baseUrl with the
 * supplied variable values. Returns undefined when the endpoint has no
 * placeholders to fill or a value is missing or invalid, so callers can treat
 * an incomplete draft as "not ready" instead of probing a literal `{...}` URL.
 */
export function substituteProviderPresetEndpointVariables(
  endpoint: ProviderPresetEndpoint,
  variables: Record<string, string>
): string | undefined {
  if (!providerEndpointHasVariables(endpoint)) {
    return endpoint.baseUrl;
  }
  let baseUrl = endpoint.baseUrl;
  for (const variable of endpoint.variables ?? []) {
    const value = variables[variable.name]?.trim();
    if (!value || !providerPresetEndpointVariableValueIsValid(variable, value)) {
      return undefined;
    }
    baseUrl = baseUrl.replaceAll(`{${variable.name}}`, value);
  }
  return baseUrl.includes("{") || baseUrl.includes("}") ? undefined : baseUrl;
}

/**
 * Extracts the placeholder values (e.g. WorkspaceId, Region) a baseUrl filled
 * into a template endpoint, for restoring the form state of a saved provider.
 */
export function providerPresetTemplateEndpointVariablesForBaseUrlInList(
  presets: ProviderPreset[],
  baseUrl: string
): Record<string, string> | undefined {
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!candidate) {
    return undefined;
  }
  for (const preset of presets) {
    for (const endpoint of preset.endpoints) {
      if (!providerEndpointHasVariables(endpoint)) {
        continue;
      }
      const variables = providerPresetTemplateEndpointVariablesForBaseUrl(endpoint, candidate);
      if (variables) {
        return variables;
      }
    }
  }
  return undefined;
}

function providerPresetTemplateEndpointVariablesForBaseUrl(
  endpoint: ProviderPresetEndpoint,
  candidate: URL
): Record<string, string> | undefined {
  const endpointUrl = parseProviderPresetUrl(endpoint.baseUrl);
  if (!endpointUrl) {
    return undefined;
  }
  const hostMatch = matchProviderPresetPlaceholderHost(endpointUrl.hostname, candidate.hostname);
  if (!hostMatch) {
    return undefined;
  }
  const endpointPath = normalizeProviderPresetPath(endpointUrl.pathname);
  const candidatePath = normalizeProviderPresetPath(candidate.pathname);
  const pathMatch = endpointPath === "/" ||
    candidatePath === "/" ||
    candidatePath === endpointPath ||
    candidatePath.startsWith(`${endpointPath}/`) ||
    endpointPath.startsWith(`${candidatePath}/`);
  if (!pathMatch) {
    return undefined;
  }
  // Derive placeholder names from the raw baseUrl: URL parsing lowercases
  // hostnames, which would corrupt the camelCase variable names.
  const rawHost = endpoint.baseUrl.trim().replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").split("/")[0] ?? "";
  const names = rawHost
    .split(".")
    .map((label) => providerPresetEndpointPlaceholderName(label))
    .filter((name): name is string => Boolean(name));
  const values = hostMatch.slice(1);
  if (names.length !== values.length) {
    return undefined;
  }
  const variables: Record<string, string> = {};
  names.forEach((name, index) => {
    variables[name] = values[index];
  });
  return variables;
}

function providerPresetEndpointVariableValueIsValid(
  variable: ProviderPresetEndpointVariable,
  value: string
): boolean {
  if (variable.kind === "select") {
    return (variable.options ?? []).some((option) => option.value === value);
  }
  // Text variables land in the URL host, so only allow DNS-label-safe input.
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value);
}

function providerEndpointHasVariables(endpoint: ProviderPresetEndpoint): boolean {
  return Boolean(endpoint.variables?.length);
}

function providerPresetEndpointPlaceholderName(hostLabel: string): string | undefined {
  return /^\{[^{}]+\}$/.test(hostLabel) ? hostLabel.slice(1, -1) : undefined;
}

function matchProviderPresetPlaceholderHost(
  endpointHost: string,
  candidateHost: string
): RegExpMatchArray | null {
  if (!endpointHost.includes("{")) {
    return null;
  }
  const pattern = endpointHost
    .split(".")
    .map((label) =>
      providerPresetEndpointPlaceholderName(label)
        ? "([^.]+)"
        : label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("\\.");
  return candidateHost.match(new RegExp(`^${pattern}$`, "i"));
}

export function providerEndpointCanReceiveProviderApiKeyInList(
  _presets: ProviderPreset[],
  input: {
    apiKey?: string;
    endpoint: string;
    providerName?: string;
    providerPresetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  void input;
  return undefined;
}

function findProviderPresetsByIdentity(presets: ProviderPreset[], name: string | undefined): ProviderPreset[] {
  const normalizedName = normalizeProviderIdentityText(name);
  if (!normalizedName) {
    return [];
  }

  return presets
    .map((preset) => ({
      preset,
      score: providerPresetIdentityMatchScore(preset, normalizedName)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.preset);
}

function providerPresetIdentityMatchScore(preset: ProviderPreset, normalizedName: string): number {
  const identities = [preset.id, preset.name, ...preset.aliases]
    .map(normalizeProviderIdentityText)
    .filter(Boolean);

  return Math.max(0, ...identities.map((identity) => {
    if (normalizedName === identity) {
      return 10_000 + identity.length;
    }
    if (identity.length >= 4 && normalizedName.includes(identity)) {
      return identity.length;
    }
    return 0;
  }));
}

function providerEndpointMatchesBaseUrl(endpointBaseUrl: string, baseUrl: string): boolean {
  const endpoint = parseProviderPresetUrl(endpointBaseUrl);
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!endpoint || !candidate) {
    return false;
  }
  if (candidate.protocol !== endpoint.protocol) {
    return false;
  }
  if (endpoint.hostname.includes("{")) {
    // Template endpoints: each {Placeholder} host label matches any single
    // label, so a filled workspace domain resolves back to its preset.
    if (!matchProviderPresetPlaceholderHost(endpoint.hostname, candidate.hostname)) {
      return false;
    }
  } else if (candidate.hostname !== endpoint.hostname) {
    return false;
  }

  const endpointPath = normalizeProviderPresetPath(endpoint.pathname);
  const candidatePath = normalizeProviderPresetPath(candidate.pathname);
  return endpointPath === "/" ||
    candidatePath === "/" ||
    candidatePath === endpointPath ||
    candidatePath.startsWith(`${endpointPath}/`) ||
    endpointPath.startsWith(`${candidatePath}/`);
}

function parseProviderPresetUrl(value: string): URL | undefined {
  try {
    return new URL(providerUrlWithDefaultScheme(value.trim()));
  } catch {
    return undefined;
  }
}

function normalizeProviderPresetPath(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

function normalizeProviderIdentityText(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") ?? "";
}
