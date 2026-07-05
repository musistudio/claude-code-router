import {
  customProviderPresetId,
  type ProviderIdentitySafetyIssue,
  type ProviderPreset,
  type ProviderPresetEndpoint
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
  presets: ProviderPreset[],
  input: {
    baseUrl: string;
    name?: string;
    presetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  if (isLoopbackProviderBaseUrl(input.baseUrl)) {
    return undefined;
  }

  const selectedPreset = findProviderPresetInList(presets, input.presetId);
  if (selectedPreset && !providerPresetMatchesBaseUrl(selectedPreset, input.baseUrl)) {
    return createProviderIdentitySafetyIssue(selectedPreset);
  }

  const namedPresets = findProviderPresetsByIdentity(presets, input.name);
  if (
    namedPresets.length > 0 &&
    !namedPresets.some((preset) => providerPresetMatchesBaseUrl(preset, input.baseUrl))
  ) {
    return createProviderIdentitySafetyIssue(namedPresets[0]);
  }

  return undefined;
}

export function providerApiKeySafetyIssueInList(
  presets: ProviderPreset[],
  input: {
    apiKey?: string;
    baseUrl: string;
    name?: string;
    presetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    const officialKeyPreset = findProviderPresetByOfficialKey(presets, apiKey);
    if (officialKeyPreset && !providerBaseUrlCanReceiveOfficialKey(officialKeyPreset, input.baseUrl)) {
      return createProviderApiKeySafetyIssue(officialKeyPreset);
    }
  }

  return providerIdentitySafetyIssueInList(presets, input);
}

export function providerPresetMatchesBaseUrl(preset: ProviderPreset, baseUrl: string): boolean {
  return preset.endpoints.some((endpoint) => providerEndpointMatchesBaseUrl(endpoint.baseUrl, baseUrl));
}

export function providerEndpointCanReceiveProviderApiKeyInList(
  presets: ProviderPreset[],
  input: {
    apiKey?: string;
    endpoint: string;
    providerName?: string;
    providerPresetId?: string;
  }
): ProviderIdentitySafetyIssue | undefined {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    return undefined;
  }

  const officialKeyPreset = findProviderPresetByOfficialKey(presets, apiKey);
  if (officialKeyPreset && !providerBaseUrlCanReceiveOfficialKey(officialKeyPreset, input.endpoint)) {
    return createProviderApiKeySafetyIssue(officialKeyPreset);
  }

  const selectedPreset = findProviderPresetInList(presets, input.providerPresetId);
  if (selectedPreset && !providerBaseUrlCanReceiveOfficialKey(selectedPreset, input.endpoint)) {
    return createProviderApiKeySafetyIssue(selectedPreset);
  }

  const namedPresets = findProviderPresetsByIdentity(presets, input.providerName);
  if (
    namedPresets.length > 0 &&
    !namedPresets.some((preset) => providerBaseUrlCanReceiveOfficialKey(preset, input.endpoint))
  ) {
    return createProviderApiKeySafetyIssue(namedPresets[0]);
  }
  return undefined;
}

function findProviderPresetsByIdentity(presets: ProviderPreset[], name: string | undefined): ProviderPreset[] {
  const normalizedName = normalizeProviderIdentityText(name);
  if (!normalizedName) {
    return [];
  }

  return presets.filter((preset) => {
    const identities = [preset.id, preset.name, ...preset.aliases]
      .map(normalizeProviderIdentityText)
      .filter(Boolean);
    return identities.some((identity) =>
      normalizedName === identity ||
      (identity.length >= 4 && normalizedName.includes(identity))
    );
  });
}

function createProviderIdentitySafetyIssue(preset: ProviderPreset): ProviderIdentitySafetyIssue {
  const hosts = uniqueStrings(preset.endpoints
    .map((endpoint) => providerEndpointHost(endpoint.baseUrl))
    .filter((host): host is string => Boolean(host)));
  return {
    message: `Provider identity looks like ${preset.name}, but the Base URL is not an official ${preset.name} endpoint (${hosts.join(", ")}). Use a neutral custom name for third-party gateways and never enter official provider keys into untrusted endpoints.`,
    preset
  };
}

function createProviderApiKeySafetyIssue(preset: ProviderPreset): ProviderIdentitySafetyIssue {
  const hosts = uniqueStrings(preset.endpoints
    .map((endpoint) => providerEndpointHost(endpoint.baseUrl))
    .filter((host): host is string => Boolean(host)));
  return {
    message: `The API key looks like an official ${preset.name} key, but the target endpoint is not an official ${preset.name} endpoint (${hosts.join(", ")}) or a local loopback endpoint. Official provider keys must not be sent to third-party gateways.`,
    preset
  };
}

function findProviderPresetByOfficialKey(presets: ProviderPreset[], apiKey: string): ProviderPreset | undefined {
  const trimmedApiKey = apiKey.trim();
  return presets.find((preset) =>
    (preset.officialApiKeyPatterns ?? []).some((pattern) => {
      try {
        return new RegExp(pattern.source, pattern.flags).test(trimmedApiKey);
      } catch {
        return false;
      }
    })
  );
}

function providerBaseUrlCanReceiveOfficialKey(preset: ProviderPreset, baseUrl: string): boolean {
  return providerPresetMatchesHost(preset, baseUrl) || isLoopbackProviderBaseUrl(baseUrl);
}

function providerEndpointMatchesBaseUrl(endpointBaseUrl: string, baseUrl: string): boolean {
  const endpoint = parseProviderPresetUrl(endpointBaseUrl);
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!endpoint || !candidate) {
    return false;
  }
  if (candidate.protocol !== endpoint.protocol || candidate.host !== endpoint.host) {
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

function providerEndpointHost(baseUrl: string): string | undefined {
  return parseProviderPresetUrl(baseUrl)?.host;
}

function providerPresetMatchesHost(preset: ProviderPreset, baseUrl: string): boolean {
  const candidate = parseProviderPresetUrl(baseUrl);
  if (!candidate) {
    return false;
  }
  return preset.endpoints.some((endpoint) => {
    const parsed = parseProviderPresetUrl(endpoint.baseUrl);
    return parsed?.protocol === candidate.protocol && parsed.host === candidate.host;
  });
}

function parseProviderPresetUrl(value: string): URL | undefined {
  try {
    return new URL(providerUrlWithDefaultScheme(value.trim()));
  } catch {
    return undefined;
  }
}

function isLoopbackProviderBaseUrl(value: string): boolean {
  try {
    const hostname = new URL(providerUrlWithDefaultScheme(value.trim())).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function normalizeProviderPresetPath(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

function normalizeProviderIdentityText(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") ?? "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
