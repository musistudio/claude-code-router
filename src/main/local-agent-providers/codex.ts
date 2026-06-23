import os from "node:os";
import path from "node:path";
import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig,
  ProviderAccountMappingConfig
} from "../../shared/app";
import {
  missingCandidate,
  providerInternalNamePlaceholder,
  providerNamePlaceholder,
  providerNameSlugPlaceholder,
  providerPayload,
  readBoolean,
  readJsonRecord,
  readString,
  uniqueProviderName,
  uniqueStrings,
  isRecord,
  type OAuthTokenSet
} from "./shared";

export const codexDefaultBaseUrl = "https://chatgpt.com/backend-api/codex";

const codexAccountBaseUrl = "https://chatgpt.com/backend-api";
const codexDefaultModels = ["gpt-5-codex"];

const codexAccountRateLimitMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "codex_primary_quota",
      kind: "quota",
      label: "Primary quota",
      limit: 100,
      remaining: "100 - $.rate_limit.primary_window.used_percent",
      resetAt: "$.rate_limit.primary_window.reset_at",
      unit: "%",
      used: "$.rate_limit.primary_window.used_percent",
      window: "primary"
    },
    {
      id: "codex_secondary_quota",
      kind: "quota",
      label: "Secondary quota",
      limit: 100,
      remaining: "100 - $.rate_limit.secondary_window.used_percent",
      resetAt: "$.rate_limit.secondary_window.reset_at",
      unit: "%",
      used: "$.rate_limit.secondary_window.used_percent",
      window: "secondary"
    },
    {
      id: "codex_individual_limit",
      kind: "quota",
      label: "Individual limit",
      limit: "$.spend_control.individual_limit.limit",
      remaining: "$.spend_control.individual_limit.remaining",
      resetAt: "$.spend_control.individual_limit.reset_at",
      unit: "credits",
      used: "$.spend_control.individual_limit.used",
      window: "monthly"
    },
    {
      id: "codex_credit_balance",
      kind: "balance",
      label: "Credit balance",
      remaining: "$.credits.balance",
      unit: "credits"
    }
  ]
};

const codexAccountTokenUsageMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "codex_lifetime_tokens",
      kind: "tokens",
      label: "Lifetime tokens",
      unit: "tokens",
      used: "$.stats.lifetime_tokens"
    },
    {
      id: "codex_peak_daily_tokens",
      kind: "tokens",
      label: "Peak daily tokens",
      unit: "tokens",
      used: "$.stats.peak_daily_tokens",
      window: "daily"
    }
  ]
};

export function codexCandidate(): LocalAgentProviderCandidate {
  const auth = readCodexAuth();
  const models = readCodexModels();
  if (auth?.refreshToken || auth?.accessToken) {
    return {
      detail: "ChatGPT login detected. Click Import to add it as a gateway provider.",
      id: "codex-api",
      importable: true,
      kind: "codex",
      models,
      name: "Codex API",
      protocol: "openai_responses",
      sourceFile: auth.sourceFile,
      status: "available"
    };
  }
  return missingCandidate("codex", "codex-api", "Codex API", "openai_responses", models);
}

export function importCodexProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): LocalAgentProviderImportResult {
  const auth = readCodexAuth();
  if (!auth?.refreshToken && !auth?.accessToken) {
    throw new Error("Codex login token was not found.");
  }
  const provider = providerPayload(candidate, uniqueProviderName(providerNames, "Codex API"), codexDefaultBaseUrl, codexProviderAccountConfig());
  return {
    candidate,
    provider,
    providerPlugins: [
      codexOauthPlugin("codex-oauth"),
      codexOauthPlugin("codex-oauth-internal", providerInternalNamePlaceholder)
    ].map((plugin) => ({
      ...plugin,
      ...(auth.isFedrampAccount ? { auth: { headers: { "X-OpenAI-Fedramp": "true" } } } : {}),
      codexOauth: {
        accessToken: auth.accessToken,
        ...(auth.accountId ? { accountId: auth.accountId } : {}),
        refreshIfMissingAccessToken: true,
        refreshToken: auth.refreshToken,
        required: true
      }
    }))
  };
}

export function readCodexAuth(): OAuthTokenSet | undefined {
  const sourceFile = path.join(os.homedir(), ".codex", "auth.json");
  const record = readJsonRecord(sourceFile);
  if (!record) {
    return undefined;
  }
  const tokens = isRecord(record.tokens) ? record.tokens : {};
  const idToken = readString(tokens.id_token) || readString(tokens.idToken);
  const idTokenClaims = readCodexIdTokenClaims(idToken);
  return {
    accountId:
      readString(tokens.account_id) ||
      readString(tokens.accountId) ||
      idTokenClaims.accountId,
    accessToken: readString(tokens.access_token) || readString(tokens.accessToken),
    isFedrampAccount: idTokenClaims.isFedrampAccount,
    refreshToken: readString(tokens.refresh_token) || readString(tokens.refreshToken),
    sourceFile
  };
}

function codexProviderAccountConfig(): ProviderAccountConfig {
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: `${codexAccountBaseUrl}/wham/usage`,
        headers: {
          "User-Agent": "codex-cli"
        },
        mapping: codexAccountRateLimitMapping,
        type: "http-json"
      },
      {
        auth: "provider-api-key",
        endpoint: `${codexAccountBaseUrl}/wham/profiles/me`,
        headers: {
          "User-Agent": "codex-cli"
        },
        mapping: codexAccountTokenUsageMapping,
        type: "http-json"
      }
    ],
    enabled: true
  };
}

function codexOauthPlugin(suffix: string, providerName = providerNamePlaceholder): Record<string, unknown> {
  return {
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${suffix}`,
    providerName,
    request: codexBackendRequestTransform()
  };
}

function codexBackendRequestTransform(): Record<string, unknown> {
  return {
    bodyRemove: ["max_output_tokens"]
  };
}

function readCodexModels(): string[] {
  const modelsFile = path.join(os.homedir(), ".codex", "models_cache.json");
  const record = readJsonRecord(modelsFile);
  const models = Array.isArray(record?.models)
    ? record.models.map((model) => isRecord(model) ? readString(model.slug) || readString(model.id) || readString(model.name) : readString(model))
    : [];
  return uniqueStrings([...models, ...codexDefaultModels]);
}

function readCodexIdTokenClaims(idToken: string | undefined): { accountId?: string; isFedrampAccount?: boolean } {
  const payload = readJwtPayload(idToken);
  const auth = isRecord(payload?.["https://api.openai.com/auth"])
    ? payload["https://api.openai.com/auth"]
    : {};
  return {
    accountId: readString(auth.chatgpt_account_id) || readString(auth.account_id) || readString(auth.accountId),
    isFedrampAccount: readBoolean(auth.chatgpt_account_is_fedramp)
  };
}

function readJwtPayload(jwt: string | undefined): Record<string, unknown> | undefined {
  const encoded = jwt?.split(".")[1];
  if (!encoded) {
    return undefined;
  }
  try {
    const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), "=");
    const decoded = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;
    return isRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}
