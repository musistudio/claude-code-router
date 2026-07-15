import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GatewayProviderConfig,
  LocalAgentProviderCandidate,
  LocalAgentProviderImportResult,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountMappingConfig,
  ProviderModelMetadata
} from "@ccr/core/contracts/app";
import {
  bearerAuthPlugin,
  firstString,
  isRecord,
  localAgentProviderApiKey,
  missingCandidate,
  modelDisplayNamesForModels,
  modelMetadataForModels,
  providerInternalNamePlaceholder,
  providerPayload,
  readBoolean,
  readJsonRecord,
  readString,
  uniqueProviderName,
  uniqueStrings,
  type OAuthTokenSet
} from "@ccr/core/agents/local-providers/shared";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { normalizeProviderBaseUrl } from "@ccr/core/providers/url";

export const grokDefaultBaseUrl = "https://cli-chat-proxy.grok.com/v1";
export const grokDefaultBillingEndpoint = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const grokDefaultSubscriptionEndpoint = "https://cli-chat-proxy.grok.com/v1/user?include=subscription";

const grokDefaultModels = ["grok-4.5"];
const grokProviderId = "grok-cli-api";
const grokProviderName = "Grok CLI API";
const grokDefaultOidcIssuer = "https://auth.x.ai";
const grokOauthDefaultTimeoutMs = 8_000;
const grokFallbackClientVersion = "0.2.93";

const grokBillingResetPaths = [
  "$.billingPeriodEnd",
  "$.currentPeriod.end",
  "$.currentPeriod.billingPeriodEnd",
  "$.config.billingPeriodEnd",
  "$.config.currentPeriod.end",
  "$.end"
];

const grokBillingMapping: ProviderAccountMappingConfig = {
  meters: [
    {
      id: "grok_credit_usage_percent",
      kind: "quota",
      label: "Credit usage",
      limit: 100,
      remaining: [
        "100 - $.creditUsagePercent",
        "100 - $.config.creditUsagePercent",
        "100 - $.config.creditUsagePercent.val"
      ],
      resetAt: grokBillingResetPaths,
      unit: "%",
      used: [
        "$.creditUsagePercent",
        "$.config.creditUsagePercent",
        "$.config.creditUsagePercent.val"
      ],
      window: "monthly"
    },
    {
      id: "grok_included_credits",
      kind: "quota",
      label: "Included credits",
      limit: [
        "$.monthlyLimit",
        "$.monthlyLimit.val",
        "$.currentPeriod.monthlyLimit",
        "$.currentPeriod.monthlyLimit.val",
        "$.config.monthlyLimit",
        "$.config.monthlyLimit.val",
        "$.config.currentPeriod.monthlyLimit",
        "$.config.currentPeriod.monthlyLimit.val"
      ],
      resetAt: grokBillingResetPaths,
      unit: "credits",
      used: [
        "$.includedUsed",
        "$.includedUsed.val",
        "$.currentPeriod.includedUsed",
        "$.currentPeriod.includedUsed.val",
        "$.config.includedUsed",
        "$.config.includedUsed.val",
        "$.config.currentPeriod.includedUsed",
        "$.config.currentPeriod.includedUsed.val"
      ],
      window: "monthly"
    },
    {
      id: "grok_total_credits",
      kind: "quota",
      label: "Total credits",
      limit: [
        "$.monthlyLimit",
        "$.monthlyLimit.val",
        "$.currentPeriod.monthlyLimit",
        "$.currentPeriod.monthlyLimit.val",
        "$.config.monthlyLimit",
        "$.config.monthlyLimit.val",
        "$.config.currentPeriod.monthlyLimit",
        "$.config.currentPeriod.monthlyLimit.val"
      ],
      resetAt: grokBillingResetPaths,
      unit: "credits",
      used: [
        "$.totalUsed",
        "$.totalUsed.val",
        "$.currentPeriod.totalUsed",
        "$.currentPeriod.totalUsed.val",
        "$.config.totalUsed",
        "$.config.totalUsed.val",
        "$.config.currentPeriod.totalUsed",
        "$.config.currentPeriod.totalUsed.val"
      ],
      window: "monthly"
    },
    {
      id: "grok_pay_as_you_go_cap",
      kind: "quota",
      label: "Pay-as-you-go cap",
      limit: [
        "$.onDemandCap",
        "$.onDemandCap.val",
        "$.currentPeriod.onDemandCap",
        "$.currentPeriod.onDemandCap.val",
        "$.config.onDemandCap",
        "$.config.onDemandCap.val",
        "$.config.currentPeriod.onDemandCap",
        "$.config.currentPeriod.onDemandCap.val"
      ],
      resetAt: grokBillingResetPaths,
      unit: "credits",
      used: [
        "$.onDemandUsed",
        "$.onDemandUsed.val",
        "$.currentPeriod.onDemandUsed",
        "$.currentPeriod.onDemandUsed.val",
        "$.config.onDemandUsed",
        "$.config.onDemandUsed.val",
        "$.config.currentPeriod.onDemandUsed",
        "$.config.currentPeriod.onDemandUsed.val"
      ],
      window: "monthly"
    },
    {
      id: "grok_prepaid_balance",
      kind: "balance",
      label: "Prepaid balance",
      remaining: [
        "$.prepaidBalance",
        "$.prepaidBalance.val",
        "$.currentPeriod.prepaidBalance",
        "$.currentPeriod.prepaidBalance.val",
        "$.config.prepaidBalance",
        "$.config.prepaidBalance.val",
        "$.config.currentPeriod.prepaidBalance",
        "$.config.currentPeriod.prepaidBalance.val"
      ],
      resetAt: grokBillingResetPaths,
      unit: "credits",
      window: "monthly"
    }
  ]
};

export type GrokTokenSet = OAuthTokenSet & {
  authRecordKey?: string;
  oidcClientId?: string;
  oidcIssuer?: string;
  expiresAt?: string;
};

type GrokModelCatalog = {
  baseUrl: string;
  modelDisplayNames?: Record<string, string>;
  modelMetadata?: Record<string, ProviderModelMetadata>;
  models: string[];
};

export function grokCandidate(): LocalAgentProviderCandidate {
  const auth = readGrokAuth();
  const catalog = readGrokLocalModelCatalog();
  if ((auth?.accessToken && !grokAccessTokenExpired(auth)) || auth?.refreshToken) {
    return {
      detail: "Grok CLI login detected. Click Import to add it as a gateway provider.",
      id: grokProviderId,
      importable: true,
      kind: "grok",
      modelDisplayNames: catalog.modelDisplayNames,
      modelMetadata: catalog.modelMetadata,
      models: catalog.models,
      name: grokProviderName,
      protocol: "openai_responses",
      sourceFile: auth.sourceFile,
      status: "available"
    };
  }
  if (auth?.accessToken || auth?.refreshToken) {
    return {
      detail: auth.accessToken && grokAccessTokenExpired(auth)
        ? "Grok CLI login was detected, but the access token is expired. Run grok login again, then rescan."
        : "Grok CLI login was detected, but no usable access token was found.",
      id: grokProviderId,
      importable: false,
      kind: "grok",
      modelDisplayNames: catalog.modelDisplayNames,
      modelMetadata: catalog.modelMetadata,
      models: catalog.models,
      name: grokProviderName,
      protocol: "openai_responses",
      sourceFile: auth.sourceFile,
      status: "locked"
    };
  }
  return missingCandidate("grok", grokProviderId, grokProviderName, "openai_responses", catalog.models, catalog.modelDisplayNames);
}

export async function importGrokProvider(candidate: LocalAgentProviderCandidate, providerNames: string[]): Promise<LocalAgentProviderImportResult> {
  const auth = await resolveGrokAuth();
  if (!auth?.accessToken || grokAccessTokenExpired(auth)) {
    throw new Error("Grok CLI access token was not found or is expired.");
  }
  return importGrokProviderWithAuth(candidate, providerNames, auth);
}

export function readGrokAuth(): GrokTokenSet | undefined {
  const candidates = grokCredentialFiles()
    .flatMap((sourceFile) => readGrokAuthRecords(sourceFile));
  return candidates.find((item) => item.accessToken && !grokAccessTokenExpired(item)) ??
    candidates.find((item) => item.refreshToken) ??
    candidates.find((item) => item.accessToken);
}

export async function resolveGrokAuth(): Promise<GrokTokenSet | undefined> {
  const auth = readGrokAuth();
  if (!auth?.refreshToken || (auth.accessToken && !grokAccessTokenExpired(auth))) {
    return auth;
  }
  return refreshGrokAuth(auth);
}

export function readGrokLocalModelCatalog(): GrokModelCatalog {
  const preferredModel = readGrokDefaultModel();
  const catalog = grokModelCatalogFromPayload(readJsonRecord(grokModelsCacheFile()), preferredModel);
  const models = uniqueStrings([
    preferredModel,
    ...catalog.models,
    ...grokDefaultModels
  ]);
  return {
    baseUrl: catalog.baseUrl || grokRuntimeDefaultBaseUrl(),
    modelDisplayNames: modelDisplayNamesForModels(catalog.modelDisplayNames, models),
    modelMetadata: modelMetadataForModels(catalog.modelMetadata, models),
    models
  };
}

function readGrokAuthRecords(sourceFile: string): GrokTokenSet[] {
  const record = readJsonRecord(sourceFile);
  if (!record) {
    return [];
  }
  return [
    record,
    ...Object.entries(record)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
      .map(([key, value]) => ({ ...value, __ccr_auth_record_key: key }))
  ]
    .map((item) => grokAuthFromRecord(item, sourceFile))
    .filter((item): item is GrokTokenSet => Boolean(item));
}

function grokAuthFromRecord(record: Record<string, unknown>, sourceFile: string): GrokTokenSet | undefined {
  const accessToken =
    readString(record.key) ||
    readString(record.access_token) ||
    readString(record.accessToken) ||
    readString(record.token) ||
    readString(record.id_token) ||
    readString(record.idToken);
  const refreshToken =
    readString(record.refresh_token) ||
    readString(record.refreshToken);
  if (!accessToken && !refreshToken) {
    return undefined;
  }
  return {
    accessToken,
    authRecordKey: readString(record.__ccr_auth_record_key),
    expiresAt: readString(record.expires_at) || readString(record.expiresAt),
    oidcClientId: readString(record.oidc_client_id) || readString(record.oidcClientId) || readString(process.env.GROK_OIDC_CLIENT_ID),
    oidcIssuer: readString(record.oidc_issuer) || readString(record.oidcIssuer) || readString(process.env.GROK_OIDC_ISSUER),
    refreshToken,
    sourceFile
  };
}

export function grokAccessTokenExpired(auth: GrokTokenSet): boolean {
  const expiresAtMs = dateMs(auth.expiresAt) ?? jwtExpiresAtMs(auth.accessToken);
  return expiresAtMs !== undefined && expiresAtMs <= Date.now() + 60_000;
}

function grokModelCatalogFromPayload(payload: unknown, preferredModel?: string): GrokModelCatalog {
  const models: string[] = [];
  const modelDisplayNames: Record<string, string> = {};
  const modelMetadata: Record<string, ProviderModelMetadata> = {};
  const baseUrlsByModel: Record<string, string> = {};

  for (const item of grokModelCatalogItems(payload)) {
    const info = isRecord(item.value) && isRecord(item.value.info) ? item.value.info : isRecord(item.value) ? item.value : {};
    if (readBoolean(info.hidden) || readBoolean(info.supported_in_api) === false || readBoolean(info.supportedInApi) === false) {
      continue;
    }
    const apiBackend = readString(info.api_backend) || readString(info.apiBackend);
    if (apiBackend && !apiBackend.toLowerCase().includes("responses")) {
      continue;
    }
    const model = readString(info.model) || readString(info.id) || readString(info.name) || item.key;
    if (!model) {
      continue;
    }
    models.push(model);
    const displayName = readString(info.display_name) || readString(info.displayName) || readString(info.label) || readString(info.title) || readString(info.name);
    if (displayName && displayName !== model) {
      modelDisplayNames[model] = displayName;
    }
    const baseUrl = readString(info.base_url) || readString(info.baseUrl);
    if (baseUrl) {
      baseUrlsByModel[model] = baseUrl;
    }
    const metadata = grokModelMetadataFromInfo(info);
    if (metadata) {
      modelMetadata[model] = metadata;
    }
  }

  const uniqueModels = uniqueStrings(models);
  const preferredBaseUrl = preferredModel ? baseUrlsByModel[preferredModel] : undefined;
  const baseUrl = preferredBaseUrl || firstString(uniqueModels.map((model) => baseUrlsByModel[model])) || grokRuntimeDefaultBaseUrl();
  const filteredModels = uniqueModels.filter((model) => !baseUrlsByModel[model] || baseUrlsByModel[model] === baseUrl);
  return {
    baseUrl,
    modelDisplayNames: modelDisplayNamesForModels(modelDisplayNames, filteredModels),
    modelMetadata: modelMetadataForModels(modelMetadata, filteredModels),
    models: filteredModels
  };
}

function grokModelMetadataFromInfo(info: Record<string, unknown>): ProviderModelMetadata | undefined {
  const defaultReasoningLevel = readNullableString(info.reasoning_effort) ?? readNullableString(info.reasoningEffort);
  const metadata: ProviderModelMetadata = {
    ...(defaultReasoningLevel !== undefined ? { defaultReasoningLevel } : {})
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function grokModelCatalogItems(payload: unknown): Array<{ key?: string; value: unknown }> {
  if (Array.isArray(payload)) {
    return payload.map((value) => ({ value }));
  }
  if (!isRecord(payload)) {
    return [];
  }
  const models = payload.models;
  if (Array.isArray(models)) {
    return models.map((value) => ({ value }));
  }
  if (isRecord(models)) {
    return Object.entries(models).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function readGrokDefaultModel(): string | undefined {
  for (const sourceFile of grokConfigFiles()) {
    if (!existsSync(sourceFile)) {
      continue;
    }
    try {
      const text = readFileSync(sourceFile, "utf8");
      const match = text.match(/^\s*default\s*=\s*"([^"]+)"\s*$/m) ?? text.match(/^\s*default\s*=\s*'([^']+)'\s*$/m);
      const model = match?.[1]?.trim();
      if (model) {
        return model;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function importGrokProviderWithAuth(
  candidate: LocalAgentProviderCandidate,
  providerNames: string[],
  auth: GrokTokenSet
): LocalAgentProviderImportResult {
  const catalog = readGrokLocalModelCatalog();
  const provider = providerPayload(
    {
      ...candidate,
      modelDisplayNames: catalog.modelDisplayNames,
      modelMetadata: catalog.modelMetadata,
      models: catalog.models
    },
    uniqueProviderName(providerNames, grokProviderName),
    catalog.baseUrl,
    grokProviderAccountConfig()
  );
  return {
    candidate: {
      ...candidate,
      modelDisplayNames: catalog.modelDisplayNames,
      modelMetadata: catalog.modelMetadata,
      models: catalog.models
    },
    provider,
    providerPlugins: [
      grokOauthPlugin("grok-cli-oauth", auth.accessToken ?? ""),
      grokOauthPlugin("grok-cli-oauth-internal", auth.accessToken ?? "", providerInternalNamePlaceholder)
    ]
  };
}

export function grokProviderAccountConfig(): ProviderAccountConfig {
  const clientVersion = grokClientVersion();
  return {
    connectors: [
      {
        auth: "provider-api-key",
        endpoint: grokBillingEndpoint(),
        headers: {
          "x-grok-client-identifier": "xai-grok-cli",
          "x-grok-client-version": clientVersion
        },
        mapping: grokBillingMapping,
        type: "http-json"
      },
      {
        auth: "provider-api-key",
        endpoint: grokSubscriptionEndpoint(),
        headers: {
          "x-grok-client-identifier": "xai-grok-cli",
          "x-grok-client-version": clientVersion
        },
        mapping: { meters: [] },
        parser: "grok-subscription",
        type: "http-json"
      }
    ],
    enabled: true
  };
}

export function normalizeGrokProviderAccountConfig(provider: GatewayProviderConfig): GatewayProviderConfig {
  if (!isLocalGrokProvider(provider) || !shouldUseCurrentGrokAccountConfig(provider.account)) {
    return provider;
  }
  const account = grokProviderAccountConfig();
  return {
    ...provider,
    account: {
      ...account,
      refreshIntervalMs: provider.account?.refreshIntervalMs ?? account.refreshIntervalMs
    }
  };
}

function isLocalGrokProvider(provider: GatewayProviderConfig): boolean {
  if (providerApiKey(provider) !== localAgentProviderApiKey) {
    return false;
  }
  const baseUrl = normalizeProviderBaseUrl(providerBaseUrl(provider)).toLowerCase();
  const name = provider.name?.toLowerCase() ?? "";
  return baseUrl.includes("cli-chat-proxy.grok.com") || name.includes("grok");
}

function shouldUseCurrentGrokAccountConfig(account: ProviderAccountConfig | undefined): boolean {
  if (account?.enabled === false) {
    return false;
  }
  const connectors = account?.connectors ?? [];
  if (connectors.length === 0) {
    return true;
  }
  return connectors.every(isGrokAccountConnector);
}

function isGrokAccountConnector(connector: ProviderAccountConnectorConfig): boolean {
  if (connector.type === "standard") {
    return !connector.endpoint?.trim() && !connector.endpoints?.length && !connector.headers && !connector.id;
  }
  if (connector.type !== "http-json") {
    return false;
  }
  return /^https:\/\/grok\.com\/(?:billing|user)(?:$|[?#/])/i.test(connector.endpoint.trim()) ||
    /^https:\/\/cli-chat-proxy\.grok\.com\/v1\/(?:billing|user)(?:$|[?#/])/i.test(connector.endpoint.trim());
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseurl || provider.baseUrl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function grokOauthPlugin(suffix: string, token: string, providerName?: string): Record<string, unknown> {
  return {
    ...bearerAuthPlugin(suffix, token, {}, providerName),
    request: {
      headers: {
        "x-grok-client-identifier": "xai-grok-cli",
        "x-grok-client-version": grokClientVersion(),
        "x-grok-model-override": "{{ model }}"
      },
      strict: true
    }
  };
}

export function grokClientVersion(): string {
  const explicit = process.env.GROK_CLI_VERSION?.trim();
  if (explicit) {
    return explicit;
  }
  const payload = readJsonRecord(path.join(grokStorageRoot(), "version.json"));
  return readString(payload?.version) || grokFallbackClientVersion;
}

async function refreshGrokAuth(auth: GrokTokenSet): Promise<GrokTokenSet> {
  const refreshToken = auth.refreshToken;
  if (!refreshToken) {
    throw new Error("Grok CLI refresh token was not found.");
  }
  const clientId = auth.oidcClientId || readString(process.env.GROK_OIDC_CLIENT_ID);
  if (!clientId) {
    throw new Error("Grok CLI OAuth client id was not found.");
  }

  const tokenEndpoint = await grokTokenEndpoint(auth);
  const timeoutMs = normalizeGrokOauthTimeout(process.env.GROK_OIDC_REFRESH_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithSystemProxy(tokenEndpoint, {
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      method: "POST",
      signal: controller.signal
    });
    const text = await response.text();
    const payload = parseJsonRecord(text);
    if (!response.ok) {
      throw new Error(`Grok CLI OAuth token refresh returned HTTP ${response.status}${tokenRefreshErrorMessage(payload, text)}`);
    }
    const accessToken = readString(payload?.access_token) || readString(payload?.accessToken);
    if (!accessToken) {
      throw new Error("Grok CLI OAuth token refresh did not return an access token.");
    }
    const refreshed: GrokTokenSet = {
      ...auth,
      accessToken,
      expiresAt: refreshedGrokExpiresAt(accessToken, payload),
      refreshToken: readString(payload?.refresh_token) || readString(payload?.refreshToken) || refreshToken
    };
    persistRefreshedGrokAuth(refreshed);
    return refreshed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Grok CLI OAuth token refresh timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function grokTokenEndpoint(auth: GrokTokenSet): Promise<string> {
  const configured = readString(process.env.GROK_OIDC_TOKEN_ENDPOINT);
  if (configured) {
    return configured;
  }
  const issuer = (auth.oidcIssuer || readString(process.env.GROK_OIDC_ISSUER) || grokDefaultOidcIssuer).replace(/\/+$/, "");
  const metadataUrl = `${issuer}/.well-known/openid-configuration`;
  const timeoutMs = normalizeGrokOauthTimeout(process.env.GROK_OIDC_REFRESH_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithSystemProxy(metadataUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    const payload = parseJsonRecord(text);
    if (!response.ok) {
      throw new Error(`Grok CLI OIDC discovery returned HTTP ${response.status}${tokenRefreshErrorMessage(payload, text)}`);
    }
    const tokenEndpoint = readString(payload?.token_endpoint) || readString(payload?.tokenEndpoint);
    if (!tokenEndpoint) {
      throw new Error("Grok CLI OIDC discovery did not return a token endpoint.");
    }
    return tokenEndpoint;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Grok CLI OIDC discovery timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function grokCredentialFiles(): string[] {
  const explicitFile = process.env.GROK_AUTH_FILE?.trim();
  return uniqueStrings([
    explicitFile,
    path.join(grokStorageRoot(), "auth.json"),
    path.join(grokStorageRoot(), "credentials.json")
  ]);
}

function grokConfigFiles(): string[] {
  const explicitFile = process.env.GROK_CONFIG_FILE?.trim();
  return uniqueStrings([
    explicitFile,
    path.join(grokStorageRoot(), "config.toml")
  ]);
}

function grokModelsCacheFile(): string {
  return process.env.GROK_MODELS_CACHE_FILE?.trim() || path.join(grokStorageRoot(), "models_cache.json");
}

function grokStorageRoot(): string {
  const explicitRoot = process.env.GROK_HOME?.trim() || process.env.GROK_STORAGE_DIR?.trim() || process.env.GROK_CONFIG_DIR?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }
  const homeDir = process.env.CCR_INTERNAL_HOME_DIR?.trim() || process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  return path.join(homeDir, ".grok");
}

function grokRuntimeDefaultBaseUrl(): string {
  return process.env.GROK_CLI_CHAT_PROXY_BASE_URL?.trim() || grokDefaultBaseUrl;
}

function grokBillingEndpoint(): string {
  return process.env.GROK_BILLING_ENDPOINT?.trim() || grokDefaultBillingEndpoint;
}

function grokSubscriptionEndpoint(): string {
  return process.env.GROK_SUBSCRIPTION_ENDPOINT?.trim() || grokDefaultSubscriptionEndpoint;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readString(value) || undefined;
}

function dateMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function jwtExpiresAtMs(token: string | undefined): number | undefined {
  const encoded = token?.split(".")[1];
  if (!encoded) {
    return undefined;
  }
  try {
    const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), "=");
    const payload = JSON.parse(Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as unknown;
    const exp = isRecord(payload) && typeof payload.exp === "number" ? payload.exp : undefined;
    return exp ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function refreshedGrokExpiresAt(accessToken: string, payload: Record<string, unknown> | undefined): string | undefined {
  const expiresAtMs = jwtExpiresAtMs(accessToken) ?? expiresInMs(payload?.expires_in) ?? expiresInMs(payload?.expiresIn);
  return expiresAtMs ? new Date(expiresAtMs).toISOString() : undefined;
}

function expiresInMs(value: unknown): number | undefined {
  const seconds = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : undefined;
  return seconds && Number.isFinite(seconds) ? Date.now() + seconds * 1000 : undefined;
}

function persistRefreshedGrokAuth(auth: GrokTokenSet): void {
  if (!auth.sourceFile || !auth.accessToken) {
    return;
  }
  try {
    const parsed = JSON.parse(readFileSync(auth.sourceFile, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return;
    }
    let target: Record<string, unknown> = parsed;
    if (auth.authRecordKey) {
      const authRecord = parsed[auth.authRecordKey];
      if (isRecord(authRecord)) {
        target = authRecord;
      }
    }
    target.key = auth.accessToken;
    if (auth.refreshToken) {
      target.refresh_token = auth.refreshToken;
    }
    if (auth.expiresAt) {
      target.expires_at = auth.expiresAt;
    }
    writeFileSync(auth.sourceFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch {
    // Best effort. The refreshed token is still used for this CCR run.
  }
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const payload = JSON.parse(text) as unknown;
    return isRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function tokenRefreshErrorMessage(payload: Record<string, unknown> | undefined, text: string): string {
  const message =
    readString(payload?.error_description) ||
    readString(payload?.error) ||
    readString(payload?.message) ||
    readableResponseSnippet(text);
  return message ? `: ${message}` : "";
}

function readableResponseSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

function normalizeGrokOauthTimeout(value: unknown): number {
  const numeric = Number(value);
  return Math.max(1, Number.isFinite(numeric) ? numeric : grokOauthDefaultTimeoutMs);
}

export function grokModelCatalogFromPayloadForTest(payload: unknown, preferredModel?: string): GrokModelCatalog {
  return grokModelCatalogFromPayload(payload, preferredModel);
}
