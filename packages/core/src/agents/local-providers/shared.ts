import { existsSync, readFileSync } from "node:fs";
import type {
  GatewayProviderProtocol,
  LocalAgentProviderCandidate,
  LocalAgentProviderKind,
  ProviderAccountConfig,
  ProviderDeepLinkPayload,
  ProviderModelMetadata
} from "@ccr/core/contracts/app";

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
  models: string[],
  modelDisplayNames?: Record<string, string>
): LocalAgentProviderCandidate {
  return {
    detail: "No local login state was found for this agent.",
    id,
    importable: false,
    kind,
    modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, models),
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
  const models = uniqueStrings(candidate.models).slice(0, 24);
  return {
    account,
    apiKey: localAgentProviderApiKey,
    baseUrl,
    modelDisplayNames: modelDisplayNamesForModels(candidate.modelDisplayNames, models),
    modelMetadata: modelMetadataForModels(candidate.modelMetadata, models),
    models,
    name,
    protocol: candidate.protocol
  };
}

export function modelMetadataForModels(
  value: Record<string, ProviderModelMetadata> | undefined,
  models: string[]
): Record<string, ProviderModelMetadata> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, metadata]) => [rawModel.trim(), metadata] as const)
    .filter(([model, metadata]) => model && modelIds.has(model) && metadata && typeof metadata === "object");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function modelDisplayNamesForModels(
  value: Record<string, string> | undefined,
  models: string[]
): Record<string, string> | undefined {
  const modelIds = new Set(models);
  const entries = Object.entries(value ?? {})
    .map(([rawModel, rawDisplayName]) => [rawModel.trim(), rawDisplayName.trim()] as const)
    .filter(([model, displayName]) => model && displayName && model !== displayName && modelIds.has(model));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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

export function readJsoncRecord(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    return parseJsoncRecord(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export function parseJsoncRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(value)) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stripJsonCommentsAndTrailingCommas(value: string): string {
  let withoutComments = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];
    if (inString) {
      withoutComments += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      withoutComments += character;
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      withoutComments += "  ";
      index += 1;
      while (index + 1 < value.length && value[index + 1] !== "\n" && value[index + 1] !== "\r") {
        withoutComments += " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      withoutComments += "  ";
      index += 1;
      while (index + 1 < value.length) {
        const commentCharacter = value[index + 1];
        const commentNextCharacter = value[index + 2];
        if (commentCharacter === "*" && commentNextCharacter === "/") {
          withoutComments += "  ";
          index += 2;
          break;
        }
        withoutComments += commentCharacter === "\n" || commentCharacter === "\r" ? commentCharacter : " ";
        index += 1;
      }
      continue;
    }
    withoutComments += character;
  }

  let result = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (lookahead < withoutComments.length && /\s/.test(withoutComments[lookahead])) {
        lookahead += 1;
      }
      if (withoutComments[lookahead] === "}" || withoutComments[lookahead] === "]") {
        continue;
      }
    }
    result += character;
  }
  return result;
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
