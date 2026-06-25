import { existsSync, readFileSync } from "node:fs";
import type {
  GatewayProviderProtocol,
  LocalAgentProviderCandidate,
  LocalAgentProviderKind,
  ProviderAccountConfig,
  ProviderDeepLinkPayload
} from "../../shared/app";

export type OAuthTokenSet = {
  accountId?: string;
  accessToken?: string;
  isFedrampAccount?: boolean;
  refreshToken?: string;
  sourceFile: string;
};

export type ApiTokenSet = {
  sourceFile: string;
  hasSharedLogin?: boolean;
};

export const providerNamePlaceholder = "__CCR_PROVIDER_NAME__";
export const providerNameSlugPlaceholder = "__CCR_PROVIDER_NAME_SLUG__";
export const providerInternalNamePlaceholder = "__CCR_PROVIDER_INTERNAL_NAME__";
export const localAgentProviderApiKey = "ccr-local-agent-login";

export function missingCandidate(
  kind: LocalAgentProviderKind,
  id: string,
  name: string,
  protocol: GatewayProviderProtocol,
  models: string[]
): LocalAgentProviderCandidate {
  return {
    detail: "No local login state was found for this agent.",
    id,
    importable: false,
    kind,
    models,
    name,
    protocol,
    status: "missing"
  };
}

export function providerPayload(
  candidate: LocalAgentProviderCandidate,
  name: string,
  baseUrl: string,
  account?: ProviderAccountConfig
): ProviderDeepLinkPayload {
  return {
    account,
    apiKey: localAgentProviderApiKey,
    baseUrl,
    models: uniqueStrings(candidate.models).slice(0, 24),
    name,
    protocol: candidate.protocol
  };
}

export function bearerAuthPlugin(
  suffix: string,
  token: string,
  headers: Record<string, string> = {},
  providerName = providerNamePlaceholder
): Record<string, unknown> {
  return {
    auth: {
      headers: {
        authorization: `Bearer ${token}`,
        ...headers
      },
      removeHeaders: ["x-api-key"],
      strict: true
    },
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
    providerName
  };
}

export function apiKeyAuthPlugin(
  suffix: string,
  apiKey: string,
  providerName = providerNamePlaceholder
): Record<string, unknown> {
  return {
    auth: {
      headers: {
        "x-api-key": apiKey
      },
      removeHeaders: ["authorization"],
      strict: true
    },
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
    providerName
  };
}

export function cloneProviderAccountConfig(account: ProviderAccountConfig | undefined): ProviderAccountConfig | undefined {
  return account ? JSON.parse(JSON.stringify(account)) as ProviderAccountConfig : undefined;
}

export function findOauthTokenSet(value: unknown, depth = 0): { accessToken?: string; refreshToken?: string } | undefined {
  if (!isRecord(value) || depth > 5) {
    return undefined;
  }
  const accessToken =
    readString(value.accessToken) ||
    readString(value.access_token) ||
    readString(value.anthropicAccessToken);
  const refreshToken =
    readString(value.refreshToken) ||
    readString(value.refresh_token) ||
    readString(value.anthropicRefreshToken);
  if (accessToken || refreshToken) {
    return { accessToken, refreshToken };
  }
  for (const child of Object.values(value)) {
    const found = findOauthTokenSet(child, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function readJsonRecord(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function uniqueProviderName(existingNames: string[], baseName: string): string {
  const existing = new Set(existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!existing.has(baseName.toLowerCase())) {
    return baseName;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${baseName} ${Date.now()}`;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function firstString(values: Array<string | undefined>): string {
  return values.find((value): value is string => Boolean(value)) ?? "";
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value?.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
