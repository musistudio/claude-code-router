import os from "node:os";
import path from "node:path";
import type {
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  LocalAgentProviderProbeResult,
  GatewayProviderConfig,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountMappingConfig,
  ProviderAccountMeter,
  ProviderAccountMeterDetail,
  ProviderModelMetadata,
  ProviderReasoningLevel
} from "@ccr/core/contracts/app";
import { normalizeProviderBaseUrl } from "@ccr/core/providers/url";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import {
  isRecord,
  localAgentProviderApiKey,
  missingCandidate,
  modelMetadataForModels,
  modelDisplayNamesForModels,
  providerInternalNamePlaceholder,
  providerNamePlaceholder,
  providerNameSlugPlaceholder,
  providerPayload,
  readBoolean,
  readJsonRecord,
  readString,
  uniqueProviderName,
  uniqueStrings,
  type OAuthTokenSet
} from "@ccr/core/agents/local-providers/shared";

export const codexDefaultBaseUrl = "https://chatgpt.com/backend-api/codex";

const codexAccountBaseUrl = "https://chatgpt.com/backend-api";
const codexDefaultModels = ["gpt-5-codex"];
const codexProbeTimeoutMs = 8_000;

export type LocalAgentModelCatalog = {
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
};

const codexAccountRateLimitMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "codex_primary_quota",
      kind: "quota",
      label: "Primary quota",
      limit: 100,
      remaining: [
        "100 - $.rate_limit.primary_window.used_percent",
        "100 - $.rate_limits.primary.used_percent"
      ],
      resetAt: [
        "$.rate_limit.primary_window.reset_at",
        "$.rate_limit.primary_window.resets_at",
        "$.rate_limits.primary.resets_at"
      ],
      unit: "%",
      used: [
        "$.rate_limit.primary_window.used_percent",
        "$.rate_limits.primary.used_percent"
      ],
      window: "primary"
    },
    {
      id: "codex_manual_resets",
      kind: "requests",
      label: "Manual resets",
      remaining: [
        "$.resetsAvailable",
        "$.availableRateLimitResetCount",
        "$.rate_limit_reset_credits.available_count",
        "$.rate_limit.resetsAvailable",
        "$.rate_limits.resetsAvailable",
        "$.rate_limit.manual_resets.remaining",
        "$.rate_limit.manual_resets.resetsAvailable",
        "$.rate_limit.manual_reset.remaining",
        "$.rate_limit.manual_reset.resetsAvailable",
        "$.rate_limits.manual_resets.remaining",
        "$.rate_limits.manual_resets.resetsAvailable",
        "$.rate_limits.manual_reset.remaining",
        "$.rate_limits.manual_reset.resetsAvailable",
        "$.manual_resets.remaining",
        "$.manual_resets.resetsAvailable",
        "$.manual_reset.remaining",
        "$.manual_reset.resetsAvailable",
        "$.resets.remaining",
        "$.resets.resetsAvailable",
        "$.rate_limit.manual_resets.available",
        "$.rate_limit.manual_reset.available",
        "$.rate_limit.resets.available",
        "$.rate_limits.resets.available",
        "$.manual_resets.available",
        "$.manual_reset.available",
        "$.resets.available",
        0
      ],
      resetAt: [
        "$.resetExpires",
        "$.expires_at",
        "$.resets_at",
        "$.rate_limit.manual_resets.expires_at",
        "$.rate_limit.manual_resets.expire_at",
        "$.rate_limit.manual_resets.reset_at",
        "$.rate_limit.manual_resets.resets_at",
        "$.rate_limit.manual_reset.expires_at",
        "$.rate_limit.manual_reset.expire_at",
        "$.rate_limit.manual_reset.reset_at",
        "$.rate_limit.manual_reset.resets_at",
        "$.rate_limits.manual_resets.expires_at",
        "$.rate_limits.manual_resets.expire_at",
        "$.rate_limits.manual_resets.reset_at",
        "$.rate_limits.manual_resets.resets_at",
        "$.rate_limits.manual_reset.expires_at",
        "$.rate_limits.manual_reset.expire_at",
        "$.rate_limits.manual_reset.reset_at",
        "$.rate_limits.manual_reset.resets_at",
        "$.rate_limit.resets.expires_at",
        "$.rate_limit.resets.expire_at",
        "$.rate_limit.resets.reset_at",
        "$.rate_limit.resets.resets_at",
        "$.rate_limits.resets.expires_at",
        "$.rate_limits.resets.expire_at",
        "$.rate_limits.resets.reset_at",
        "$.rate_limits.resets.resets_at",
        "$.manual_resets.expires_at",
        "$.manual_resets.expire_at",
        "$.manual_resets.reset_at",
        "$.manual_resets.resets_at",
        "$.manual_reset.expires_at",
        "$.manual_reset.expire_at",
        "$.manual_reset.reset_at",
        "$.manual_reset.resets_at",
        "$.resets.expires_at",
        "$.resets.expire_at",
        "$.resets.reset_at",
        "$.resets.resets_at"
      ],
      unit: "resets",
      used: [
        "$.rate_limit.manual_resets.used",
        "$.rate_limit.manual_reset.used",
        "$.rate_limits.manual_resets.used",
        "$.manual_resets.used",
        "$.manual_reset.used",
        "$.resets.used"
      ],
      window: "manual-reset"
    },
    {
      id: "codex_secondary_quota",
      kind: "quota",
      label: "Secondary quota",
      limit: 100,
      remaining: [
        "100 - $.rate_limit.secondary_window.used_percent",
        "100 - $.rate_limits.secondary.used_percent"
      ],
      resetAt: [
        "$.rate_limit.secondary_window.reset_at",
        "$.rate_limit.secondary_window.resets_at",
        "$.rate_limits.secondary.resets_at"
      ],
      unit: "%",
      used: [
        "$.rate_limit.secondary_window.used_percent",
        "$.rate_limits.secondary.used_percent"
      ],
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

const codexAccountRateLimitResetCreditsMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "codex_manual_resets",
      kind: "requests",
      label: "Manual resets",
      remaining: [
        "$.available_count",
        "$.rate_limit_reset_credits.available_count",
        0
      ],
      resetAt: [
        "$.expires_at",
        "$.expiresAt",
        "$.reset_at",
        "$.resetAt"
      ],
      unit: "resets",
      window: "manual-reset"
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
  const catalog = readCodexLocalModelCatalog();
  if (auth?.refreshToken || auth?.accessToken) {
    return {
      detail: "ChatGPT login detected. Click Import to add it as a gateway provider.",
      id: "codex-api",
      importable: true,
      kind: "codex",
      modelDisplayNames: catalog.modelDisplayNames,
      modelMetadata: catalog.modelMetadata,
      models: catalog.models,
      name: "Codex API",
      protocol: "openai_responses",
      sourceFile: auth.sourceFile,
      status: "available"
    };
  }
  return missingCandidate("codex", "codex-api", "Codex API", "openai_responses", catalog.models, catalog.modelDisplayNames);
}

export async function importCodexProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): Promise<LocalAgentProviderImportResult> {
  const auth = readCodexAuth();
  if (!auth?.refreshToken && !auth?.accessToken) {
    throw new Error("Codex login token was not found.");
  }
  const probedCandidate = await codexCandidateWithProbedModels(candidate).catch(() => candidate);
  const provider = providerPayload(probedCandidate, uniqueProviderName(providerNames, "Codex API"), codexDefaultBaseUrl, codexProviderAccountConfig());
  return {
    candidate: probedCandidate,
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

export async function probeCodexProvider(candidate: LocalAgentProviderCandidate): Promise<LocalAgentProviderProbeResult> {
  const probedCandidate = await codexCandidateWithProbedModels(candidate).catch(() => candidate);
  return {
    candidate: probedCandidate,
    probe: codexProviderProbe(probedCandidate)
  };
}

export function readCodexAuth(): OAuthTokenSet | undefined {
  const sourceFile = path.join(codexHomeDir(), ".codex", "auth.json");
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

export function codexProviderAccountConfig(): ProviderAccountConfig {
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
        endpoint: `${codexAccountBaseUrl}/wham/rate-limit-reset-credits`,
        headers: {
          "User-Agent": "codex-cli"
        },
        mapping: codexAccountRateLimitResetCreditsMapping,
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

export function attachCodexRateLimitResetCreditDetails(meters: ProviderAccountMeter[], payload: unknown): ProviderAccountMeter[] {
  const details = codexRateLimitResetCreditDetails(payload);
  if (details.length === 0) {
    return meters;
  }
  const resetAt = firstCodexResetCreditExpiry(details);
  return meters.map((meter) => {
    if (!isCodexManualResetMeter(meter)) {
      return meter;
    }
    return {
      ...meter,
      details,
      resetAt: meter.resetAt ?? resetAt
    };
  });
}

export function codexRateLimitResetCreditDetails(payload: unknown): ProviderAccountMeterDetail[] {
  const records = codexRateLimitResetCreditRecords(payload);
  if (records.length === 0) {
    return [];
  }
  const availableRecords = records.filter(isAvailableCodexResetCreditRecord);
  const sourceRecords = availableRecords.length > 0 ? availableRecords : records;
  return sourceRecords
    .map(codexRateLimitResetCreditDetail)
    .filter((detail): detail is ProviderAccountMeterDetail => Boolean(detail))
    .sort(compareCodexResetCreditDetails);
}

export function normalizeCodexProviderAccountConfig(provider: GatewayProviderConfig): GatewayProviderConfig {
  if (!isLocalCodexProvider(provider) || !shouldUseCurrentCodexAccountConfig(provider.account)) {
    return provider;
  }
  const account = codexProviderAccountConfig();
  return {
    ...provider,
    account: {
      ...account,
      refreshIntervalMs: provider.account?.refreshIntervalMs ?? account.refreshIntervalMs
    }
  };
}

function isLocalCodexProvider(provider: GatewayProviderConfig): boolean {
  return (
    providerApiKey(provider) === localAgentProviderApiKey &&
    normalizeProviderBaseUrl(providerBaseUrl(provider)) === normalizeProviderBaseUrl(codexDefaultBaseUrl)
  );
}

function shouldUseCurrentCodexAccountConfig(account: ProviderAccountConfig | undefined): boolean {
  if (account?.enabled === false) {
    return false;
  }
  const connectors = account?.connectors ?? [];
  if (connectors.length === 0) {
    return true;
  }
  return connectors.every(isCodexAccountConnector);
}

function isCodexAccountConnector(connector: ProviderAccountConnectorConfig): boolean {
  if (connector.type === "standard") {
    return !connector.endpoint?.trim() && !connector.endpoints?.length && !connector.headers && !connector.id;
  }
  if (connector.type !== "http-json") {
    return false;
  }
  return /^https:\/\/chatgpt\.com\/backend-api\/wham\//i.test(connector.endpoint.trim());
}

function codexRateLimitResetCreditRecords(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }
  const containers = [
    payload.rate_limit_reset_credits,
    payload.rateLimitResetCredits,
    payload
  ].filter(isRecord);
  for (const container of containers) {
    const candidates = [
      container.credits,
      container.items,
      container.data,
      container.available,
      container.available_credits,
      container.availableCredits,
      container.reset_credits,
      container.resetCredits
    ];
    for (const candidate of candidates) {
      const records = readCodexResetCreditRecordArray(candidate);
      if (records.length > 0) {
        return records;
      }
    }
  }
  return [];
}

function readCodexResetCreditRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  const nested = [value.credits, value.items, value.data];
  for (const candidate of nested) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }
  return [];
}

function isAvailableCodexResetCreditRecord(record: Record<string, unknown>): boolean {
  const status = readCodexStringFromKeys(record, ["status", "state"])?.toLowerCase();
  return !status || status === "available" || status === "active";
}

function codexRateLimitResetCreditDetail(record: Record<string, unknown>, index: number): ProviderAccountMeterDetail | undefined {
  const id = readCodexStringFromKeys(record, ["id", "credit_id", "creditId"]);
  const status = readCodexStringFromKeys(record, ["status", "state"]);
  const effectiveAt = readCodexDateFromKeys(record, [
    "effective_at",
    "effectiveAt",
    "start_date",
    "startDate",
    "valid_from",
    "validFrom",
    "starts_at",
    "startsAt",
    "start_at",
    "startAt",
    "available_at",
    "availableAt",
    "granted_at",
    "grantedAt",
    "created_at",
    "createdAt"
  ]);
  const expiresAt = readCodexDateFromKeys(record, [
    "expires_at",
    "expiresAt",
    "expire_at",
    "expireAt",
    "expiration_at",
    "expirationAt",
    "valid_until",
    "validUntil",
    "end_date",
    "endDate",
    "ends_at",
    "endsAt",
    "end_at",
    "endAt"
  ]);
  if (!effectiveAt && !expiresAt) {
    return undefined;
  }
  return {
    description: readCodexStringFromKeys(record, ["description", "message"]),
    effectiveAt,
    expiresAt,
    id: id ?? `codex-reset-credit-${index + 1}`,
    label: readCodexStringFromKeys(record, ["label", "name", "title"]),
    redeemable: Boolean(id) && isAvailableCodexResetCreditRecord(record),
    status
  };
}

function readCodexStringFromKeys(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readCodexDateFromKeys(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = codexDateString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function codexDateString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  const text = readString(value);
  if (!text) {
    return undefined;
  }
  const timestamp = new Date(text).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
}

function compareCodexResetCreditDetails(a: ProviderAccountMeterDetail, b: ProviderAccountMeterDetail): number {
  return codexDetailTimestamp(a.expiresAt) - codexDetailTimestamp(b.expiresAt)
    || codexDetailTimestamp(a.effectiveAt) - codexDetailTimestamp(b.effectiveAt);
}

function codexDetailTimestamp(value: string | undefined): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function firstCodexResetCreditExpiry(details: ProviderAccountMeterDetail[]): string | undefined {
  return [...details]
    .sort(compareCodexResetCreditDetails)
    .find((detail) => detail.expiresAt)
    ?.expiresAt;
}

function isCodexManualResetMeter(meter: ProviderAccountMeter): boolean {
  const text = `${meter.id} ${meter.label} ${meter.window ?? ""}`.toLowerCase();
  return text.includes("manual_reset") || text.includes("manual reset") || text.includes("manual-reset");
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
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

export function readCodexLocalModelCatalog(): LocalAgentModelCatalog {
  const modelsFile = path.join(codexHomeDir(), ".codex", "models_cache.json");
  const record = readJsonRecord(modelsFile);
  const catalog = codexModelCatalogFromPayload(record);
  const uniqueModels = uniqueStrings([...catalog.models, ...codexDefaultModels]);
  return {
    modelDisplayNames: modelDisplayNamesForModels(catalog.modelDisplayNames, uniqueModels),
    modelMetadata: modelMetadataForModels(catalog.modelMetadata, uniqueModels),
    models: uniqueModels
  };
}

async function codexCandidateWithProbedModels(candidate: LocalAgentProviderCandidate): Promise<LocalAgentProviderCandidate> {
  const catalog = await fetchCodexModelCatalog();
  if (catalog.models.length === 0) {
    return candidate;
  }
  return {
    ...candidate,
    modelDisplayNames: catalog.modelDisplayNames,
    modelMetadata: catalog.modelMetadata,
    models: catalog.models
  };
}

async function fetchCodexModelCatalog(): Promise<LocalAgentModelCatalog> {
  const auth = readCodexAuth();
  if (!auth?.accessToken) {
    throw new Error("Codex access token was not found.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), codexProbeTimeoutMs);
  try {
    const response = await fetchWithSystemProxy(`${codexDefaultBaseUrl}/models`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${auth.accessToken}`,
        "User-Agent": "codex-cli",
        ...(auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {}),
        ...(auth.isFedrampAccount ? { "X-OpenAI-Fedramp": "true" } : {})
      },
      method: "GET",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Codex model probe returned HTTP ${response.status}.`);
    }
    const payload = parseJson(text);
    const catalog = codexModelCatalogFromPayload(payload);
    if (catalog.models.length === 0) {
      throw new Error("Codex model probe returned no models.");
    }
    return catalog;
  } finally {
    clearTimeout(timer);
  }
}

function codexProviderProbe(candidate: LocalAgentProviderCandidate) {
  return {
    capabilities: [
      {
        baseUrl: codexDefaultBaseUrl,
        source: "detected" as const,
        type: "openai_responses" as const
      }
    ],
    detectedProtocol: "openai_responses" as const,
    modelDisplayNames: candidate.modelDisplayNames,
    modelMetadata: candidate.modelMetadata,
    modelSource: "openai" as const,
    models: candidate.models,
    normalizedBaseUrl: codexDefaultBaseUrl,
    protocols: [
      {
        baseUrl: codexDefaultBaseUrl,
        endpoint: `${codexDefaultBaseUrl}/responses`,
        message: "",
        protocol: "openai_responses" as const,
        supported: true
      }
    ]
  };
}

function codexModelCatalogFromPayload(payload: unknown): LocalAgentModelCatalog {
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};
  const modelMetadata: Record<string, ProviderModelMetadata> = {};
  for (const item of codexModelCatalogItems(payload)) {
    const model = isRecord(item)
      ? readString(item.slug) || readString(item.id) || readString(item.model) || readString(item.name)
      : readString(item);
    if (!model) {
      continue;
    }
    models.push(model);
    if (isRecord(item)) {
      const displayName = readString(item.display_name) || readString(item.displayName) || readString(item.label) || readString(item.title) || readString(item.name);
      if (displayName && displayName !== model) {
        modelDisplayNames[model] = displayName;
      }
      const metadata = codexModelMetadataFromItem(item);
      if (metadata) {
        modelMetadata[model] = metadata;
      }
    }
  }
  const uniqueModels = uniqueStrings(models);
  return {
    modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, uniqueModels),
    modelMetadata: modelMetadataForModels(modelMetadata, uniqueModels),
    models: uniqueModels
  };
}

function codexModelMetadataFromItem(item: Record<string, unknown>): ProviderModelMetadata | undefined {
  const additionalSpeedTiers = readArray(item.additional_speed_tiers) ?? readArray(item.additionalSpeedTiers) ?? readArray(item.speed_tiers) ?? readArray(item.speedTiers);
  const serviceTiers = readArray(item.service_tiers) ?? readArray(item.serviceTiers);
  const supportedReasoningLevels =
    readReasoningLevels(item.supported_reasoning_levels) ??
    readReasoningLevels(item.supportedReasoningLevels) ??
    readReasoningEfforts(item.supported_reasoning_efforts) ??
    readReasoningEfforts(item.supportedReasoningEfforts) ??
    readReasoningEfforts(item.reasoning_efforts) ??
    readReasoningEfforts(item.reasoningEfforts);
  const defaultReasoningLevel = readNullableString(item.default_reasoning_level) ?? readNullableString(item.defaultReasoningLevel);
  const defaultReasoningSummary = readString(item.default_reasoning_summary) || readString(item.defaultReasoningSummary);
  const supportsReasoningSummaries = readBoolean(item.supports_reasoning_summaries) ?? readBoolean(item.supportsReasoningSummaries);
  const metadata: ProviderModelMetadata = {
    ...(additionalSpeedTiers ? { additionalSpeedTiers } : {}),
    ...(defaultReasoningLevel !== undefined ? { defaultReasoningLevel } : {}),
    ...(defaultReasoningSummary ? { defaultReasoningSummary } : {}),
    ...(serviceTiers ? { serviceTiers } : {}),
    ...(supportedReasoningLevels ? { supportedReasoningLevels } : {}),
    ...(supportsReasoningSummaries !== undefined ? { supportsReasoningSummaries } : {})
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  const text = readString(value);
  return text || undefined;
}

function readReasoningLevels(value: unknown): ProviderReasoningLevel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const levels = value
    .map((item): ProviderReasoningLevel | undefined => {
      if (!isRecord(item)) {
        const effort = readString(item);
        return effort ? { description: effortDescription(effort), effort } : undefined;
      }
      const effort = readString(item.effort) || readString(item.name) || readString(item.id) || readString(item.value);
      if (!effort) {
        return undefined;
      }
      return {
        description: readString(item.description) || readString(item.label) || effortDescription(effort),
        effort
      };
    })
    .filter((item): item is ProviderReasoningLevel => Boolean(item));
  return levels.length > 0 ? levels : undefined;
}

function readReasoningEfforts(value: unknown): ProviderReasoningLevel[] | undefined {
  if (Array.isArray(value)) {
    return readReasoningLevels(value);
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return readReasoningLevels(Object.values(value));
}

function effortDescription(effort: string): string {
  const normalized = effort.trim().toLowerCase();
  if (normalized === "xhigh") {
    return "Extra high reasoning";
  }
  return `${effort.slice(0, 1).toUpperCase()}${effort.slice(1)} reasoning`;
}

function codexModelCatalogItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  const items: unknown[] = [];
  for (const candidate of [payload.data, payload.models]) {
    if (Array.isArray(candidate)) {
      items.push(...candidate);
    }
  }
  return items;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function codexModelCatalogFromPayloadForTest(payload: unknown): LocalAgentModelCatalog {
  return codexModelCatalogFromPayload(payload);
}

function codexHomeDir(): string {
  return process.env.CCR_INTERNAL_HOME_DIR?.trim() || process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
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
