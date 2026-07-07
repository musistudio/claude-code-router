import { createHash, randomUUID } from "node:crypto";
import { loadAppConfig } from "@ccr/core/config/config";
import { attachCodexRateLimitResetCreditDetails } from "@ccr/core/agents/local-providers/codex";
import { localAgentProviderApiKey, readCodexAuth } from "@ccr/core/agents/local-providers/service";
import { pluginService } from "@ccr/core/plugins/service";
import { getUsageTotalsSince } from "@ccr/core/usage/store";
import { findProviderPresetByBaseUrl, providerEndpointCanReceiveProviderApiKey } from "@ccr/core/providers/presets/index";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "@ccr/core/providers/url";
import type {
  AppConfig,
  GatewayProviderConfig,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountConnectorError,
  ProviderAccountConnectorSource,
  ProviderAccountAuthMode,
  ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountLocalEstimateConnectorConfig,
  ProviderAccountLocalWindowConfig,
  ProviderAccountMappedMeterConfig,
  ProviderAccountMappedNumberExpression,
  ProviderAccountMappedStringExpression,
  ProviderAccountMeter,
  ProviderAccountMeterDetail,
  ProviderAccountMeterKind,
  ProviderAccountMeterUnit,
  ProviderAccountPluginConnectorConfig,
  ProviderAccountSnapshot,
  ProviderAccountSnapshotRequestOptions,
  ProviderAccountResetRequest,
  ProviderAccountResetResult,
  ProviderAccountTestPath,
  ProviderAccountTestRequest,
  ProviderAccountTestResult,
  ProviderAccountStandardConnectorConfig,
  ProviderCredentialConfig,
  ProviderAccountStatus
} from "@ccr/core/contracts/app";

type CacheEntry = {
  expiresAt: number;
  snapshot: ProviderAccountSnapshot;
  staleUntil: number;
};

type ConnectorResult = {
  errors: ProviderAccountConnectorError[];
  meters: ProviderAccountMeter[];
  message?: string;
  source: ProviderAccountConnectorSource;
  status?: ProviderAccountStatus;
};

type ProviderAccountTarget = {
  account: ProviderAccountConfig;
  credential?: ProviderCredentialConfig;
  provider: GatewayProviderConfig;
};

type MaterializedProviderAccountRequest = {
  headers?: Record<string, string>;
  provider: GatewayProviderConfig;
};

const defaultRefreshIntervalMs = 5 * 60 * 1000;
const minRefreshIntervalMs = 30 * 1000;
const maxErrorRefreshIntervalMs = 60 * 1000;
const maxStaleAccountSnapshotMs = 2 * 60 * 1000;
const maxCacheEntries = 500;
const standardAccountPaths = ["/.well-known/ccr/account", "/v1/account/limits"];
const codexRateLimitResetCreditConsumeEndpoint = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume";
const cache = new Map<string, CacheEntry>();
const inFlightRefreshes = new Map<string, Promise<ProviderAccountSnapshot | undefined>>();
let cacheGeneration = 0;

export async function getProviderAccountSnapshots(
  providerName?: string,
  options: ProviderAccountSnapshotRequestOptions = {}
): Promise<ProviderAccountSnapshot[]> {
  const config = await loadAppConfig();
  pruneProviderAccountCache();
  const normalizedProviderName = normalizeProviderName(providerName);
  const providers = config.Providers.filter((provider) => {
    if (!normalizedProviderName) {
      return true;
    }
    return provider.name.trim().toLowerCase() === normalizedProviderName;
  });

  const snapshots = await Promise.all(
    providers.flatMap((provider) => {
      const targets = providerAccountTargets(provider);
      if (targets.length > 0) {
        return targets.map((target) => resolveProviderAccountSnapshot(config, target, options));
      }
      return providerAccountUnavailableSnapshots(provider).map((snapshot) => Promise.resolve(snapshot));
    })
  );
  return snapshots.filter((snapshot): snapshot is ProviderAccountSnapshot => Boolean(snapshot));
}

export function invalidateProviderAccountSnapshotCache(providerName?: string): void {
  const normalizedProviderName = normalizeProviderName(providerName);
  cacheGeneration += 1;
  if (!normalizedProviderName) {
    cache.clear();
    inFlightRefreshes.clear();
    return;
  }

  const providerNameKey = `"providerName":"${normalizedProviderName}"`;
  for (const [key, entry] of cache.entries()) {
    if (normalizeProviderName(entry.snapshot.provider) === normalizedProviderName || key.includes(providerNameKey)) {
      cache.delete(key);
    }
  }
  for (const key of inFlightRefreshes.keys()) {
    if (key.includes(providerNameKey)) {
      inFlightRefreshes.delete(key);
    }
  }
}

export async function testProviderAccountConnector(request: ProviderAccountTestRequest): Promise<ProviderAccountTestResult> {
  const provider: GatewayProviderConfig = {
    api_base_url: request.baseUrl,
    api_key: request.apiKey ?? "",
    models: [],
    name: request.providerName?.trim() || "Provider"
  };
  const connector: ProviderAccountHttpJsonConnectorConfig = {
    ...request.connector,
    auth: request.connector.auth ?? "provider-api-key",
    method: request.connector.method ?? "GET",
    type: "http-json"
  };
  const payload = await fetchJson(connector.endpoint, provider, connector.auth, connector.headers, connector.method, connector.body);
  if (connector.parser === "kimi-code-usages") {
    const meters = kimiCodeUsageMeters(payload);
    return {
      meters,
      message: meters.length === 0 ? "No usage data available." : undefined,
      paths: flattenJsonPaths(payload),
      payload,
      status: statusFromMeters(meters, [], 1)
    };
  }
  if (connector.parser === "new-api-key-usage") {
    const meters = newApiKeyUsageMeters(payload);
    return {
      meters,
      message: meters.length === 0 ? newApiKeyUsageFallbackMessage(payload) : readMappedString(connector.mapping.message, payload),
      paths: flattenJsonPaths(payload),
      payload,
      status: statusFromMeters(meters, [], 1)
    };
  }
  if (connector.parser === "new-api-user-self") {
    const meters = newApiUserSelfMeters(payload);
    return {
      meters,
      message: meters.length === 0 ? readMappedString(connector.mapping.message, payload) ?? "No user balance data available." : readMappedString(connector.mapping.message, payload),
      paths: flattenJsonPaths(payload),
      payload,
      status: statusFromMeters(meters, [], 1)
    };
  }

  const meters = mappedMetersFromPayload(connector, payload);

  return {
    meters,
    message: readMappedString(connector.mapping.message, payload),
    paths: flattenJsonPaths(payload),
    payload,
    status: normalizeStatus(readMappedString(connector.mapping.status, payload))
  };
}

export function newApiKeyUsageMetersForTest(payload: unknown): ProviderAccountMeter[] {
  return newApiKeyUsageMeters(payload);
}

export function newApiKeyUsageFallbackMessageForTest(payload: unknown): string {
  return newApiKeyUsageFallbackMessage(payload);
}

export function newApiUserSelfMetersForTest(payload: unknown): ProviderAccountMeter[] {
  return newApiUserSelfMeters(payload);
}

export async function resetCodexRateLimitCredit(request: ProviderAccountResetRequest): Promise<ProviderAccountResetResult> {
  const providerName = request.provider?.trim();
  const creditId = request.creditId?.trim();
  if (!providerName) {
    throw new Error("Provider is required.");
  }
  if (!creditId) {
    throw new Error("Reset credit id is required.");
  }

  const config = await loadAppConfig();
  const provider = codexResetProvider(config, providerName, request.credentialId);
  const materialized = materializeProviderAccountRequest(config, provider);
  const payload = await fetchJson(
    codexRateLimitResetCreditConsumeEndpoint,
    materialized.provider,
    "provider-api-key",
    {
      "User-Agent": "codex-cli",
      ...(materialized.headers ?? {})
    },
    "POST",
    {
      credit_id: creditId,
      redeem_request_id: randomUUID()
    }
  );

  invalidateProviderAccountSnapshotCache(providerName);
  return {
    code: isRecord(payload) ? readString(payload.code) : undefined,
    creditId,
    ok: true
  };
}

async function resolveProviderAccountSnapshot(
  config: AppConfig,
  target: ProviderAccountTarget,
  options: ProviderAccountSnapshotRequestOptions
): Promise<ProviderAccountSnapshot | undefined> {
  const { account, credential } = target;
  const provider = credential
    ? providerWithCredentialApiKey(target.provider, credential, account)
    : { ...target.provider, account };
  const providerName = provider.name.trim();
  if (!providerName) {
    return undefined;
  }

  const refreshIntervalMs = normalizeRefreshInterval(account.refreshIntervalMs);
  const cacheKey = providerAccountCacheKey(provider, account, credential);
  const nowMs = Date.now();
  const cached = cache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > nowMs) {
    return cached.snapshot;
  }
  const inFlight = inFlightRefreshes.get(cacheKey);
  if (!options.forceRefresh && cached && cached.staleUntil > nowMs) {
    if (!inFlight) {
      void startProviderAccountRefresh(config, provider, account, credential, cacheKey, refreshIntervalMs);
    }
    return cached.snapshot;
  }
  if (inFlight) {
    return inFlight;
  }

  return startProviderAccountRefresh(config, provider, account, credential, cacheKey, refreshIntervalMs);
}

function startProviderAccountRefresh(
  config: AppConfig,
  provider: GatewayProviderConfig,
  account: ProviderAccountConfig,
  credential: ProviderCredentialConfig | undefined,
  cacheKey: string,
  refreshIntervalMs: number
): Promise<ProviderAccountSnapshot | undefined> {
  const generation = cacheGeneration;
  const refresh = refreshProviderAccountSnapshot(config, provider, account, credential, cacheKey, refreshIntervalMs, generation);
  inFlightRefreshes.set(cacheKey, refresh);
  refresh.then(
    () => {
      if (inFlightRefreshes.get(cacheKey) === refresh) {
        inFlightRefreshes.delete(cacheKey);
      }
    },
    () => {
      if (inFlightRefreshes.get(cacheKey) === refresh) {
        inFlightRefreshes.delete(cacheKey);
      }
    }
  );
  return refresh;
}

async function refreshProviderAccountSnapshot(
  config: AppConfig,
  provider: GatewayProviderConfig,
  account: ProviderAccountConfig,
  credential: ProviderCredentialConfig | undefined,
  cacheKey: string,
  refreshIntervalMs: number,
  generation: number
): Promise<ProviderAccountSnapshot | undefined> {
  const now = new Date();
  const credentialId = credential ? providerCredentialRuntimeId(provider, credential) : undefined;
  const connectorResults = await Promise.all(
    normalizeConnectors(account).map((connector) => resolveConnector(config, provider, connector, now, credentialId))
  );
  const snapshot = mergeConnectorResults(provider.name.trim(), connectorResults, now, refreshIntervalMs, credential, credentialId);
  const cacheTtlMs = providerAccountCacheTtl(snapshot, refreshIntervalMs);
  const expiresAt = Date.now() + cacheTtlMs;
  snapshot.nextRefreshAt = new Date(expiresAt).toISOString();
  if (generation === cacheGeneration) {
    cache.set(cacheKey, {
      expiresAt,
      snapshot,
      staleUntil: expiresAt + providerAccountStaleWindow(cacheTtlMs)
    });
    pruneProviderAccountCache();
  }
  return snapshot;
}

function providerAccountCacheKey(
  provider: GatewayProviderConfig,
  account: ProviderAccountConfig,
  credential?: ProviderCredentialConfig
): string {
  return JSON.stringify({
    apiKeyHash: hashSensitiveValue(providerApiKey(provider)),
    baseUrl: providerBaseUrl(provider),
    connectors: account.connectors ?? [],
    credentialId: credential ? providerCredentialRuntimeId(provider, credential) : "",
    providerName: normalizeProviderName(provider.name),
    refreshIntervalMs: account.refreshIntervalMs ?? null
  });
}

function providerAccountCacheTtl(snapshot: ProviderAccountSnapshot, refreshIntervalMs: number): number {
  if (snapshot.status === "error" || (snapshot.meters.length === 0 && (snapshot.errors?.length || snapshot.status === "unsupported"))) {
    return Math.min(refreshIntervalMs, maxErrorRefreshIntervalMs);
  }
  return refreshIntervalMs;
}

function providerAccountStaleWindow(cacheTtlMs: number): number {
  return Math.min(Math.max(cacheTtlMs, minRefreshIntervalMs), maxStaleAccountSnapshotMs);
}

function pruneProviderAccountCache(now = Date.now()): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.staleUntil <= now) {
      cache.delete(key);
    }
  }
  if (cache.size <= maxCacheEntries) {
    return;
  }

  const oldestEntries = [...cache.entries()]
    .sort(([, left], [, right]) => left.staleUntil - right.staleUntil)
    .slice(0, cache.size - maxCacheEntries);
  for (const [key] of oldestEntries) {
    cache.delete(key);
  }
}

function hashSensitiveValue(value: string): string {
  return value
    ? createHash("sha256").update(value).digest("hex").slice(0, 16)
    : "";
}

function providerAccountTargets(provider: GatewayProviderConfig): ProviderAccountTarget[] {
  const providerAccount = effectiveProviderAccount(provider);
  const credentials = activeProviderCredentials(provider);
  if (credentials.length === 0) {
    return providerAccount ? [{ account: providerAccount, provider }] : [];
  }

  const credentialTargets = credentials
    .map((credential): ProviderAccountTarget | undefined => {
      const account = effectiveProviderCredentialAccount(provider, credential, providerAccount);
      return account ? { account, credential, provider } : undefined;
    })
    .filter((target): target is ProviderAccountTarget => Boolean(target));
  if (credentialTargets.length > 0) {
    return credentialTargets;
  }

  return providerAccount && providerApiKey(provider) ? [{ account: providerAccount, provider }] : [];
}

function codexResetProvider(config: AppConfig, providerName: string, credentialId: string | undefined): GatewayProviderConfig {
  const normalizedProviderName = normalizeProviderName(providerName);
  const provider = config.Providers.find((candidate) => normalizeProviderName(candidate.name) === normalizedProviderName);
  if (!provider) {
    throw new Error("Provider account was not found.");
  }

  const target = providerAccountTargets(provider).find((candidate) => {
    const candidateCredentialId = candidate.credential ? providerCredentialRuntimeId(candidate.provider, candidate.credential) : undefined;
    return !credentialId || candidateCredentialId === credentialId;
  });
  if (!target) {
    throw new Error("Provider account credential was not found.");
  }
  if (!providerAccountHasCodexResetCreditsConnector(target.account)) {
    throw new Error("Provider account does not support Codex manual reset credits.");
  }

  return target.credential
    ? providerWithCredentialApiKey(target.provider, target.credential, target.account)
    : { ...target.provider, account: target.account };
}

function providerAccountHasCodexResetCreditsConnector(account: ProviderAccountConfig): boolean {
  return normalizeConnectors(account).some((connector) =>
    connector.type === "http-json" &&
    /\/wham\/rate-limit-reset-credits(?:$|[?#/])/i.test(connector.endpoint.trim())
  );
}

function providerAccountUnavailableSnapshots(provider: GatewayProviderConfig): ProviderAccountSnapshot[] {
  const credentials = activeProviderCredentials(provider);
  if (credentials.length > 0) {
    return credentials
      .map((credential) => providerAccountUnavailableSnapshot(provider, credential.account ?? provider.account, credential))
      .filter((snapshot): snapshot is ProviderAccountSnapshot => Boolean(snapshot));
  }

  const snapshot = providerAccountUnavailableSnapshot(provider, provider.account);
  return snapshot ? [snapshot] : [];
}

function providerAccountUnavailableSnapshot(
  provider: GatewayProviderConfig,
  account: ProviderAccountConfig | undefined,
  credential?: ProviderCredentialConfig
): ProviderAccountSnapshot | undefined {
  const providerName = provider.name.trim();
  if (!providerName || !account?.enabled || !providerAccountConnectorsAreDefaultStandard(account.connectors ?? [])) {
    return undefined;
  }
  if (effectiveProviderAccountConfig(provider, account)) {
    return undefined;
  }

  const message = "No supported account usage endpoint is available for this provider. Configure an HTTP JSON connector or disable account balance.";
  return {
    credentialId: credential ? providerCredentialRuntimeId(provider, credential) : undefined,
    credentialLabel: credential?.name ?? credential?.label ?? credential?.id,
    errors: [
      {
        message,
        source: "unsupported"
      }
    ],
    message,
    meters: [],
    provider: providerName,
    source: "unsupported",
    status: "unsupported",
    updatedAt: new Date().toISOString()
  };
}

function effectiveProviderAccount(provider: GatewayProviderConfig): ProviderAccountConfig | undefined {
  return effectiveProviderAccountConfig(provider, provider.account);
}

function effectiveProviderCredentialAccount(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  inheritedAccount: ProviderAccountConfig | undefined
): ProviderAccountConfig | undefined {
  if (credential.account !== undefined) {
    return effectiveProviderAccountConfig(provider, credential.account);
  }
  return inheritedAccount;
}

function effectiveProviderAccountConfig(
  provider: GatewayProviderConfig,
  account: ProviderAccountConfig | undefined
): ProviderAccountConfig | undefined {
  if (!account?.enabled) {
    return undefined;
  }

  if (!providerAccountConnectorsAreDefaultStandard(account.connectors ?? [])) {
    return account;
  }

  const presetAccount = findProviderPresetByBaseUrl(providerBaseUrl(provider))?.account;
  if (!presetAccount?.enabled) {
    return undefined;
  }
  return {
    ...presetAccount,
    refreshIntervalMs: account.refreshIntervalMs ?? presetAccount.refreshIntervalMs
  };
}

function activeProviderCredentials(provider: GatewayProviderConfig): ProviderCredentialConfig[] {
  return (provider.credentials ?? []).filter((credential) =>
    credential.enabled !== false &&
    Boolean(providerCredentialApiKey(credential))
  );
}

function providerWithCredentialApiKey(
  provider: GatewayProviderConfig,
  credential: ProviderCredentialConfig,
  account: ProviderAccountConfig
): GatewayProviderConfig {
  return {
    ...provider,
    account,
    api_key: providerCredentialApiKey(credential),
    apiKey: undefined,
    apikey: undefined
  };
}

function normalizeConnectors(account: ProviderAccountConfig): ProviderAccountConnectorConfig[] {
  return Array.isArray(account.connectors) ? account.connectors : [];
}

function providerAccountConnectorsAreDefaultStandard(connectors: ProviderAccountConnectorConfig[]): boolean {
  if (connectors.length !== 1 || connectors[0]?.type !== "standard") {
    return false;
  }
  const connector = connectors[0] as ProviderAccountStandardConnectorConfig;
  return (
    (connector.auth ?? "provider-api-key") === "provider-api-key" &&
    !connector.endpoint?.trim() &&
    !connector.endpoints?.length &&
    !connector.headers &&
    !connector.id
  );
}

async function resolveConnector(
  config: AppConfig,
  provider: GatewayProviderConfig,
  connector: ProviderAccountConnectorConfig,
  now: Date,
  credentialId?: string
): Promise<ConnectorResult> {
  try {
    if (connector.type === "standard") {
      return await resolveStandardConnector(config, provider, connector);
    }
    if (connector.type === "http-json") {
      return await resolveHttpJsonConnector(config, provider, connector);
    }
    if (connector.type === "plugin") {
      return await resolvePluginConnector(config, provider, connector, now);
    }
    if (connector.type === "local-estimate") {
      return await resolveLocalEstimateConnector(provider, connector, now, credentialId);
    }
    return connectorError("unsupported", `Unsupported account connector type: ${readConnectorType(connector)}`, connectorId(connector));
  } catch (error) {
    return connectorError(connectorSource(connector), formatError(error), connectorId(connector));
  }
}

async function resolveStandardConnector(
  config: AppConfig,
  provider: GatewayProviderConfig,
  connector: ProviderAccountStandardConnectorConfig
): Promise<ConnectorResult> {
  const endpoints = standardConnectorEndpoints(provider, connector);
  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const request = providerAccountConnectorUsesProviderApiKey(connector)
        ? materializeProviderAccountRequest(config, provider)
        : { provider };
      const payload = await fetchJson(endpoint, request.provider, connector.auth, {
        ...(connector.headers ?? {}),
        ...(request.headers ?? {})
      });
      const snapshot = normalizeRemoteSnapshot(provider.name, payload, "standard");
      if (snapshot.meters.length > 0 || snapshot.status !== "unsupported") {
        return {
          errors: [],
          meters: snapshot.meters,
          message: snapshot.message,
          source: "standard",
          status: snapshot.status
        };
      }
    } catch (error) {
      lastError = formatError(error);
    }
  }

  return connectorError("standard", lastError || "No standard account endpoint returned a usable snapshot.", connectorId(connector));
}

async function resolveHttpJsonConnector(
  config: AppConfig,
  provider: GatewayProviderConfig,
  connector: ProviderAccountHttpJsonConnectorConfig
): Promise<ConnectorResult> {
  const request = providerAccountConnectorUsesProviderApiKey(connector)
    ? materializeProviderAccountRequest(config, provider)
    : { provider };
  const payload = await fetchJson(connector.endpoint, request.provider, connector.auth, {
    ...(connector.headers ?? {}),
    ...(request.headers ?? {})
  }, connector.method, connector.body);
  if (connector.parser === "kimi-code-usages") {
    const meters = kimiCodeUsageMeters(payload);
    return {
      errors: [],
      message: meters.length === 0 ? "No usage data available." : undefined,
      meters,
      source: "http-json"
    };
  }
  if (connector.parser === "new-api-key-usage") {
    const meters = newApiKeyUsageMeters(payload);
    return {
      errors: [],
      message: meters.length === 0 ? newApiKeyUsageFallbackMessage(payload) : readMappedString(connector.mapping.message, payload),
      meters,
      source: "http-json"
    };
  }
  if (connector.parser === "new-api-user-self") {
    const meters = newApiUserSelfMeters(payload);
    return {
      errors: [],
      message: meters.length === 0 ? readMappedString(connector.mapping.message, payload) ?? "No user balance data available." : readMappedString(connector.mapping.message, payload),
      meters,
      source: "http-json"
    };
  }

  const meters = mappedMetersFromPayload(connector, payload);
  return {
    errors: [],
    meters,
    message: readMappedString(connector.mapping.message, payload),
    source: "http-json",
    status: normalizeStatus(readMappedString(connector.mapping.status, payload))
  };
}

async function resolvePluginConnector(
  config: AppConfig,
  provider: GatewayProviderConfig,
  connector: ProviderAccountPluginConnectorConfig,
  now: Date
): Promise<ConnectorResult> {
  const pluginConnector = pluginService.getProviderAccountConnector(connector.pluginId, connector.connectorId);
  if (!pluginConnector) {
    return connectorError("plugin", `Plugin account connector is not registered: ${connector.pluginId}/${connector.connectorId}`, connectorId(connector));
  }

  const result = await pluginConnector.resolve({
    config,
    connector,
    now: now.toISOString(),
    provider
  });

  if (!result) {
    return connectorError("plugin", "Plugin account connector returned no account data.", connectorId(connector));
  }

  if (Array.isArray(result)) {
    return {
      errors: [],
      meters: result.map((meter) => normalizeMeter(meter, "plugin")).filter((meter): meter is ProviderAccountMeter => Boolean(meter)),
      source: "plugin"
    };
  }

  return {
    errors: result.errors ?? [],
    meters: result.meters.map((meter) => normalizeMeter(meter, "plugin")).filter((meter): meter is ProviderAccountMeter => Boolean(meter)),
    message: result.message,
    source: "plugin",
    status: result.status
  };
}

async function resolveLocalEstimateConnector(
  provider: GatewayProviderConfig,
  connector: ProviderAccountLocalEstimateConnectorConfig,
  now: Date,
  credentialId?: string
): Promise<ConnectorResult> {
  const meters = await Promise.all(
    connector.windows.map((window) => localEstimateMeter(provider, window, now, credentialId))
  );

  return {
    errors: [],
    meters: meters.filter((meter): meter is ProviderAccountMeter => Boolean(meter)),
    message: "Local estimate from CCR usage history.",
    source: "local-estimate"
  };
}

async function localEstimateMeter(
  provider: GatewayProviderConfig,
  window: ProviderAccountLocalWindowConfig,
  now: Date,
  credentialId?: string
): Promise<ProviderAccountMeter | undefined> {
  const limit = normalizeNumber(window.limit);
  if (!window.id || !window.label || !limit || limit <= 0) {
    return undefined;
  }

  const since = localEstimateWindowStart(window.window, now);
  const totals = await getUsageTotalsSince(since, {
    ...(credentialId ? { credential: credentialId } : {}),
    provider: provider.name
  });
  const used = window.unit === "tokens"
    ? totals.totalTokens
    : window.unit === "requests"
      ? totals.requestCount
      : totals.requestCount * totals.avgDurationMs / 3_600_000;

  return {
    id: window.id,
    kind: window.unit === "tokens" ? "tokens" : window.unit === "requests" ? "requests" : "time_window",
    label: window.label,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: localEstimateResetAt(window.window, now).toISOString(),
    source: "local-estimate",
    unit: window.unit,
    used,
    window: window.window
  };
}

function mergeConnectorResults(
  provider: string,
  results: ConnectorResult[],
  now: Date,
  refreshIntervalMs: number,
  credential?: ProviderCredentialConfig,
  credentialId?: string
): ProviderAccountSnapshot {
  const errors = results.flatMap((result) => result.errors);
  const metersById = new Map<string, ProviderAccountMeter>();
  for (const result of results) {
    for (const meter of result.meters) {
      const key = meter.id.trim();
      if (!key) {
        continue;
      }
      metersById.set(key, meter);
    }
  }

  const meters = [...metersById.values()];
  const successfulSources = results.filter((result) => result.meters.length > 0).map((result) => result.source);
  const source = successfulSources.length === 0
    ? "merged"
    : new Set(successfulSources).size === 1
      ? successfulSources[0]
      : "merged";
  const explicitStatus = mostSevereStatus(results.map((result) => result.status).filter((status): status is ProviderAccountStatus => Boolean(status)));
  const status = explicitStatus ?? statusFromMeters(meters, errors, results.length);
  const message = results.find((result) => result.message)?.message ?? (errors.length > 0 && meters.length === 0 ? errors[0]?.message : undefined);

  return {
    credentialId,
    credentialLabel: credential?.name ?? credential?.label ?? credential?.id,
    errors: errors.length > 0 ? errors : undefined,
    message,
    meters,
    nextRefreshAt: new Date(now.getTime() + refreshIntervalMs).toISOString(),
    provider,
    source,
    status,
    updatedAt: now.toISOString()
  };
}

function normalizeRemoteSnapshot(
  provider: string,
  payload: unknown,
  source: ProviderAccountConnectorSource
): ProviderAccountSnapshot {
  if (!isRecord(payload)) {
    throw new Error("Account endpoint returned a non-object payload.");
  }
  const meters = Array.isArray(payload.meters)
    ? payload.meters.map((meter) => normalizeMeter(meter, source)).filter((meter): meter is ProviderAccountMeter => Boolean(meter))
    : [];
  return {
    errors: normalizeRemoteErrors(payload.errors, source),
    message: readString(payload.message),
    meters,
    nextRefreshAt: readString(payload.nextRefreshAt),
    provider: readString(payload.provider) || provider,
    source,
    status: normalizeStatus(readString(payload.status)) ?? statusFromMeters(meters, [], 1),
    updatedAt: readString(payload.updatedAt) || new Date().toISOString()
  };
}

function newApiKeyUsageMeters(payload: unknown): ProviderAccountMeter[] {
  const meter = newApiKeyUsageMeter(payload);
  return meter ? [meter] : [];
}

function newApiKeyUsageMeter(payload: unknown): ProviderAccountMeter | undefined {
  const data = newApiKeyUsageData(payload);
  if (!data) {
    return undefined;
  }

  const unlimited = readBoolean(readJsonRecordValue(data, "unlimited_quota")) === true;
  const remaining = normalizeNumber(readJsonRecordValue(data, "total_available"));
  const limit = normalizeNumber(readJsonRecordValue(data, "total_granted"));
  const used = normalizeNumber(readJsonRecordValue(data, "total_used"));
  if (unlimited || (limit === undefined && remaining === undefined && used === undefined)) {
    return undefined;
  }

  return {
    id: "new_api_key_quota",
    kind: "quota",
    label: "API key quota",
    limit,
    remaining,
    source: "http-json",
    unit: "quota",
    used
  };
}

function newApiKeyUsageFallbackMessage(payload: unknown): string {
  const data = newApiKeyUsageData(payload);
  if (data && readBoolean(readJsonRecordValue(data, "unlimited_quota")) === true) {
    return "API key has no dedicated quota limit. Configure a New API user balance connector with an access token and New-Api-User to read account balance.";
  }
  return readMappedString("$.message", payload) ?? "No API key quota data available.";
}

function newApiUserSelfMeters(payload: unknown): ProviderAccountMeter[] {
  const meter = newApiUserSelfMeter(payload);
  return meter ? [meter] : [];
}

function newApiUserSelfMeter(payload: unknown): ProviderAccountMeter | undefined {
  const data = newApiUserSelfData(payload);
  if (!data) {
    return undefined;
  }

  const remaining = normalizeNumber(readJsonRecordValue(data, "quota"));
  const used = normalizeNumber(readJsonRecordValue(data, "used_quota"));
  if (remaining === undefined && used === undefined) {
    return undefined;
  }

  return {
    id: "new_api_user_balance",
    kind: "balance",
    label: "User balance",
    limit: remaining !== undefined && used !== undefined ? remaining + used : undefined,
    remaining,
    source: "http-json",
    unit: "quota",
    used
  };
}

function newApiKeyUsageData(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const data = readJsonRecordValue(payload, "data");
  return isRecord(data) ? data : payload;
}

function newApiUserSelfData(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const data = readJsonRecordValue(payload, "data");
  return isRecord(data) ? data : payload;
}

function kimiCodeUsageMeters(payload: unknown): ProviderAccountMeter[] {
  if (!isRecord(payload)) {
    return [];
  }

  const meters: ProviderAccountMeter[] = [];
  const usage = isRecord(payload.usage) ? kimiCodeUsageMeter(payload.usage, "weekly_quota", "Weekly quota") : undefined;
  if (usage) {
    meters.push(usage);
  }

  if (Array.isArray(payload.limits)) {
    const seenIds = new Set(meters.map((meter) => meter.id));
    payload.limits.forEach((item, index) => {
      if (!isRecord(item)) {
        return;
      }
      const detail = isRecord(item.detail) ? item.detail : item;
      const window = isRecord(item.window) ? item.window : {};
      const label = kimiCodeUsageLimitLabel(item, detail, window, index);
      const meter = kimiCodeUsageMeter(detail, uniqueKimiCodeUsageMeterId(kimiCodeUsageMeterId(item, detail, label, index), seenIds), label, item);
      if (meter) {
        seenIds.add(meter.id);
        meters.push(meter);
      }
    });
  }

  return meters;
}

function kimiCodeUsageMeter(
  data: Record<string, unknown>,
  id: string,
  defaultLabel: string,
  fallbackData?: Record<string, unknown>
): ProviderAccountMeter | undefined {
  const limit = normalizeNumber(data.limit);
  let used = normalizeNumber(data.used);
  let remaining = normalizeNumber(data.remaining);
  if (used === undefined && remaining !== undefined && limit !== undefined) {
    used = limit - remaining;
  }
  if (remaining === undefined && used !== undefined && limit !== undefined) {
    remaining = limit - used;
  }
  if (limit === undefined && used === undefined && remaining === undefined) {
    return undefined;
  }

  const label = readString(data.name) || readString(data.title) || defaultLabel;
  const resetAt = kimiCodeUsageResetAt(data) ?? (fallbackData ? kimiCodeUsageResetAt(fallbackData) : undefined);
  if (limit !== undefined && limit > 0) {
    const remainingRatio = remaining !== undefined
      ? Math.max(0, Math.min(1, remaining / limit))
      : used !== undefined
        ? Math.max(0, Math.min(1, (limit - used) / limit))
        : undefined;
    const remainingPercent = remainingRatio === undefined ? undefined : remainingRatio * 100;
    return {
      id,
      kind: "quota",
      label,
      limit: 100,
      remaining: remainingPercent,
      resetAt,
      source: "http-json",
      unit: "%",
      used: remainingPercent === undefined ? undefined : 100 - remainingPercent
    };
  }

  return {
    id,
    kind: "quota",
    label,
    limit,
    remaining,
    resetAt,
    source: "http-json",
    unit: "quota",
    used
  };
}

function kimiCodeUsageLimitLabel(
  item: Record<string, unknown>,
  detail: Record<string, unknown>,
  window: Record<string, unknown>,
  index: number
): string {
  const named = readString(item.name) || readString(detail.name) || readString(item.title) || readString(detail.title) || readString(item.scope) || readString(detail.scope);
  if (named) {
    return named;
  }

  const duration = normalizeNumber(window.duration) ?? normalizeNumber(item.duration) ?? normalizeNumber(detail.duration);
  const timeUnit = (readString(window.timeUnit) || readString(item.timeUnit) || readString(detail.timeUnit) || "").toUpperCase();
  if (duration && duration > 0) {
    if (timeUnit.includes("MINUTE")) {
      return duration >= 60 && duration % 60 === 0 ? `${duration / 60}h quota` : `${duration}m quota`;
    }
    if (timeUnit.includes("HOUR")) {
      return `${duration}h quota`;
    }
    if (timeUnit.includes("DAY")) {
      return `${duration}d quota`;
    }
    return `${duration}s quota`;
  }

  return `Limit #${index + 1}`;
}

function kimiCodeUsageMeterId(
  item: Record<string, unknown>,
  detail: Record<string, unknown>,
  label: string,
  index: number
): string {
  const explicit = readString(item.id) || readString(detail.id) || readString(item.name) || readString(detail.name) || readString(item.scope) || readString(detail.scope);
  return providerCredentialSlug(explicit || label || `limit-${index + 1}`) || `limit-${index + 1}`;
}

function uniqueKimiCodeUsageMeterId(id: string, seenIds: Set<string>): string {
  if (!seenIds.has(id)) {
    return id;
  }
  let index = 2;
  while (seenIds.has(`${id}-${index}`)) {
    index += 1;
  }
  return `${id}-${index}`;
}

function kimiCodeUsageResetAt(data: Record<string, unknown>): string | undefined {
  for (const key of ["reset_at", "resetAt", "reset_time", "resetTime"]) {
    const value = data[key];
    const timestamp = typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : undefined;
    if (timestamp !== undefined && Number.isFinite(timestamp)) {
      const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    const dateString = readString(value);
    if (dateString) {
      const date = new Date(dateString);
      return Number.isNaN(date.getTime()) ? dateString : date.toISOString();
    }
  }

  for (const key of ["reset_in", "resetIn", "ttl", "window"]) {
    const seconds = normalizeNumber(data[key]);
    if (seconds && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }

  return undefined;
}

function normalizeRemoteErrors(value: unknown, source: ProviderAccountConnectorSource): ProviderAccountConnectorError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const errors = value
    .map((item): ProviderAccountConnectorError | undefined => {
      if (!isRecord(item)) {
        return undefined;
      }
      const message = readString(item.message);
      if (!message) {
        return undefined;
      }
      return {
        connectorId: readString(item.connectorId),
        message,
        source
      };
    })
    .filter((item): item is ProviderAccountConnectorError => Boolean(item));
  return errors.length > 0 ? errors : undefined;
}

function mappedMeterFromPayload(config: ProviderAccountMappedMeterConfig, payload: unknown): ProviderAccountMeter | undefined {
  const id = config.id.trim();
  const label = config.label.trim();
  if (!id || !label) {
    return undefined;
  }
  const unit = config.unit ? readMappedString(config.unit, payload) : undefined;
  const limit = readMappedNumber(config.limit, payload);
  const remaining = readMappedNumber(config.remaining, payload);
  const used = readMappedNumber(config.used, payload);
  if (limit === undefined && remaining === undefined && used === undefined) {
    return undefined;
  }
  return normalizeMeter({
    id,
    kind: config.kind,
    label,
    limit,
    remaining,
    resetAt: readMappedDateString(config.resetAt, payload),
    unit,
    used,
    window: config.window
  }, "http-json");
}

function mappedMetersFromPayload(connector: ProviderAccountHttpJsonConnectorConfig, payload: unknown): ProviderAccountMeter[] {
  const meters = connector.mapping.meters
    .map((meter) => mappedMeterFromPayload(meter, payload))
    .filter((meter): meter is ProviderAccountMeter => Boolean(meter));
  return attachCodexRateLimitResetCreditDetails(meters, payload);
}

function normalizeMeter(value: unknown, source: ProviderAccountConnectorSource): ProviderAccountMeter | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = readString(value.id);
  const label = readString(value.label);
  const unit = readString(value.unit) as ProviderAccountMeterUnit | undefined;
  if (!id || !label || !unit) {
    return undefined;
  }
  const limit = normalizeNumber(value.limit);
  const used = normalizeNumber(value.used);
  const remaining = normalizeNumber(value.remaining) ?? (limit !== undefined && used !== undefined ? limit - used : undefined);
  const details = normalizeMeterDetails(value.details);
  return {
    ...(details.length > 0 ? { details } : {}),
    id,
    kind: normalizeMeterKind(readString(value.kind)) ?? inferMeterKind(unit),
    label,
    limit,
    remaining,
    resetAt: readString(value.resetAt),
    source,
    unit,
    used,
    window: readString(value.window)
  };
}

function normalizeMeterDetails(value: unknown): ProviderAccountMeterDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(normalizeMeterDetail)
    .filter((detail): detail is ProviderAccountMeterDetail => Boolean(detail));
}

function normalizeMeterDetail(value: unknown): ProviderAccountMeterDetail | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const detail: ProviderAccountMeterDetail = {
    description: readString(value.description),
    effectiveAt: readString(value.effectiveAt),
    expiresAt: readString(value.expiresAt),
    id: readString(value.id),
    label: readString(value.label),
    redeemable: readBoolean(value.redeemable),
    status: readString(value.status)
  };
  return detail.description || detail.effectiveAt || detail.expiresAt || detail.id || detail.label || detail.redeemable !== undefined || detail.status ? detail : undefined;
}

function materializeProviderAccountRequest(
  config: AppConfig,
  provider: GatewayProviderConfig
): MaterializedProviderAccountRequest {
  if (providerApiKey(provider) !== localAgentProviderApiKey) {
    return { provider };
  }

  const credential = localAgentProviderAccountCredential(config, provider);
  if (!credential?.apiKey) {
    throw new Error("Local agent account credential was not found. Sign in again, then re-import the local login provider.");
  }

  return {
    headers: credential.headers,
    provider: {
      ...provider,
      api_key: credential.apiKey,
      apiKey: undefined,
      apikey: undefined
    }
  };
}

function providerAccountConnectorUsesProviderApiKey(
  connector: ProviderAccountStandardConnectorConfig | ProviderAccountHttpJsonConnectorConfig
): boolean {
  return (connector.auth ?? "provider-api-key") !== "none";
}

function localAgentProviderAccountCredential(
  config: AppConfig,
  provider: GatewayProviderConfig
): { apiKey?: string; headers?: Record<string, string> } | undefined {
  for (const plugin of config.providerPlugins ?? []) {
    if (!localAgentProviderPluginMatches(plugin, provider)) {
      continue;
    }

    const key = readString((plugin as { key?: unknown }).key)?.toLowerCase() ?? "";
    if (key.includes("codex-oauth")) {
      return localCodexAccountCredential(plugin);
    }
    if (key.includes("claude-code-oauth")) {
      return localBearerAccountCredential(plugin);
    }
    if (key.includes("zcode-api-key")) {
      return localApiKeyHeaderAccountCredential(plugin);
    }
  }
  return undefined;
}

function localAgentProviderPluginMatches(plugin: unknown, provider: GatewayProviderConfig): plugin is Record<string, unknown> {
  if (!isRecord(plugin)) {
    return false;
  }
  const key = readString(plugin.key)?.toLowerCase() ?? "";
  if (!key.startsWith("ccr-local-agent-")) {
    return false;
  }

  const pluginProviderName = readString(plugin.providerName) || readString(plugin.provider);
  if (!pluginProviderName) {
    return false;
  }

  const providerNames = new Set([
    provider.name,
    provider.type ? `${provider.name}::${provider.type}` : ""
  ].map((value) => value.trim().toLowerCase()).filter(Boolean));
  return providerNames.has(pluginProviderName.trim().toLowerCase());
}

function localCodexAccountCredential(plugin: Record<string, unknown>): { apiKey?: string; headers?: Record<string, string> } {
  const codexOauth = isRecord(plugin.codexOauth) ? plugin.codexOauth : {};
  const codexAuth = readCodexAuth();
  // Imported plugins contain a point-in-time access token. Prefer the live Codex
  // auth file so account checks follow tokens refreshed by Codex CLI/App.
  const apiKey =
    codexAuth?.accessToken ||
    readString(codexOauth.accessToken) ||
    readString(codexOauth.access_token);
  const accountId =
    codexAuth?.accountId ||
    readString(codexOauth.accountId) ||
    readString(codexOauth.account_id);
  const headers = {
    ...localProviderPluginAuthHeaders(plugin),
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    ...(codexAuth?.isFedrampAccount ? { "X-OpenAI-Fedramp": "true" } : {})
  };
  return {
    apiKey,
    headers
  };
}

function localBearerAccountCredential(plugin: Record<string, unknown>): { apiKey?: string; headers?: Record<string, string> } {
  const headers = localProviderPluginAuthHeaders(plugin);
  const apiKey = readBearerToken(headers.authorization || headers.Authorization);
  return {
    apiKey,
    headers: withoutHeader(headers, "authorization")
  };
}

function localApiKeyHeaderAccountCredential(plugin: Record<string, unknown>): { apiKey?: string; headers?: Record<string, string> } {
  const headers = localProviderPluginAuthHeaders(plugin);
  const apiKey = headers["x-api-key"] || headers["X-API-Key"];
  return {
    apiKey,
    headers: withoutHeader(headers, "x-api-key")
  };
}

function localProviderPluginAuthHeaders(plugin: Record<string, unknown>): Record<string, string> {
  const auth = isRecord(plugin.auth) ? plugin.auth : {};
  const headers = isRecord(auth.headers) ? auth.headers : {};
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [key, readString(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
}

function withoutHeader(headers: Record<string, string>, header: string): Record<string, string> {
  const normalized = header.toLowerCase();
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== normalized));
}

function readBearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

async function fetchJson(
  endpoint: string,
  provider: GatewayProviderConfig,
  auth: ProviderAccountAuthMode = "provider-api-key",
  headers: Record<string, string> | undefined = undefined,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<unknown> {
  const apiKey = providerApiKey(provider);
  const requestHeaders: Record<string, string> = {
    accept: "application/json",
    ...(headers ?? {})
  };
  if ((auth === "provider-api-key" || auth === "provider-api-key-raw") && apiKey) {
    const safetyIssue = providerEndpointCanReceiveProviderApiKey({
      apiKey,
      endpoint,
      providerName: provider.name,
      providerPresetId: findProviderPresetByBaseUrl(providerBaseUrl(provider))?.id
    });
    if (safetyIssue) {
      throw new Error(safetyIssue.message);
    }
    requestHeaders.authorization = requestHeaders.authorization ?? (auth === "provider-api-key-raw" ? apiKey : `Bearer ${apiKey}`);
  }
  if (method === "POST") {
    requestHeaders["content-type"] = requestHeaders["content-type"] ?? "application/json";
  }

  const response = await fetchWithSystemProxy(endpoint, {
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    headers: requestHeaders,
    method
  });
  return await readJsonResponse(response);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!response.ok) {
    const errorMessage = jsonErrorMessage(text) || readableResponseSnippet(text) || response.statusText;
    throw new Error(`Account endpoint returned HTTP ${response.status}${errorMessage ? `: ${errorMessage}` : ""}.`);
  }
  if (!responseLooksJson(contentType, text)) {
    throw new Error(`Account endpoint returned non-JSON response${contentType ? ` (${contentType.split(";")[0]})` : ""}.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Account endpoint returned malformed JSON.");
  }
}

function responseLooksJson(contentType: string, text: string): boolean {
  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType.includes("json")) {
    return true;
  }
  return /^[\s]*[\[{]/.test(text);
}

function jsonErrorMessage(text: string): string | undefined {
  if (!responseLooksJson("", text)) {
    return undefined;
  }
  try {
    const payload = JSON.parse(text) as unknown;
    if (!isRecord(payload)) {
      return undefined;
    }
    const directMessage = readString(payload.message) || readString(payload.detail);
    if (directMessage) {
      return directMessage;
    }
    if (isRecord(payload.error)) {
      return readString(payload.error.message) || readString(payload.error.type);
    }
    return readString(payload.error);
  } catch {
    return undefined;
  }
}

function readableResponseSnippet(text: string): string | undefined {
  const compact = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function standardConnectorEndpoints(provider: GatewayProviderConfig, connector: ProviderAccountStandardConnectorConfig): string[] {
  const configured = [
    connector.endpoint,
    ...(connector.endpoints ?? [])
  ].filter((value): value is string => Boolean(value?.trim()));
  if (configured.length > 0) {
    return configured.map((endpoint) => absoluteAccountEndpoint(provider, endpoint));
  }

  const baseUrl = providerBaseUrl(provider);
  if (!baseUrl) {
    return [];
  }
  return standardAccountPaths.map((path) => absoluteAccountEndpoint(provider, path));
}

function absoluteAccountEndpoint(provider: GatewayProviderConfig, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const baseUrl = providerBaseUrl(provider);
  if (!baseUrl) {
    return endpoint;
  }
  const url = new URL(providerUrlWithDefaultScheme(normalizeProviderBaseUrl(baseUrl)));
  url.pathname = endpoint.startsWith("/") ? endpoint : joinUrlPath(url.pathname, endpoint);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function providerBaseUrl(provider: GatewayProviderConfig): string {
  return provider.api_base_url || provider.baseUrl || provider.baseurl || "";
}

function providerApiKey(provider: GatewayProviderConfig): string {
  return provider.api_key || provider.apiKey || provider.apikey || "";
}

function providerCredentialRuntimeId(
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

function providerCredentialApiKey(credential: ProviderCredentialConfig): string {
  return credential.api_key || credential.apiKey || credential.apikey || "";
}

function providerCredentialSlug(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "key";
}

function localEstimateWindowStart(window: string, now: Date): Date {
  const start = new Date(now);
  if (window === "5h") {
    start.setHours(start.getHours() - 5);
    return start;
  }
  if (window === "weekly") {
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (window === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

function localEstimateResetAt(window: string, now: Date): Date {
  const resetAt = localEstimateWindowStart(window, now);
  if (window === "5h") {
    resetAt.setHours(resetAt.getHours() + 5);
    return resetAt;
  }
  if (window === "weekly") {
    resetAt.setDate(resetAt.getDate() + 7);
    return resetAt;
  }
  if (window === "monthly") {
    resetAt.setMonth(resetAt.getMonth() + 1);
    return resetAt;
  }
  resetAt.setDate(resetAt.getDate() + 1);
  return resetAt;
}

function statusFromMeters(
  meters: ProviderAccountMeter[],
  errors: ProviderAccountConnectorError[],
  connectorCount: number
): ProviderAccountStatus {
  if (meters.length === 0) {
    return errors.length > 0 ? "error" : connectorCount > 0 ? "unsupported" : "unsupported";
  }

  let status: ProviderAccountStatus = errors.length > 0 ? "warning" : "ok";
  for (const meter of meters) {
    const ratio = meterRemainingRatio(meter);
    if (ratio === undefined) {
      continue;
    }
    if (ratio <= 0.05) {
      status = "critical";
      continue;
    }
    if (ratio <= 0.2 && status !== "critical") {
      status = "warning";
    }
  }
  return status;
}

function meterRemainingRatio(meter: ProviderAccountMeter): number | undefined {
  const limit = normalizeNumber(meter.limit);
  const remaining = normalizeNumber(meter.remaining);
  if (!limit || limit <= 0 || remaining === undefined) {
    return undefined;
  }
  return remaining / limit;
}

function mostSevereStatus(statuses: ProviderAccountStatus[]): ProviderAccountStatus | undefined {
  if (statuses.length === 0) {
    return undefined;
  }
  const severity: Record<ProviderAccountStatus, number> = {
    critical: 4,
    error: 5,
    ok: 1,
    unsupported: 0,
    warning: 3
  };
  return statuses.sort((a, b) => severity[b] - severity[a])[0];
}

function connectorError(source: ProviderAccountConnectorSource, message: string, connectorId?: string): ConnectorResult {
  return {
    errors: [{ connectorId, message, source }],
    meters: [],
    source,
    status: source === "unsupported" ? "unsupported" : "error"
  };
}

function connectorSource(connector: ProviderAccountConnectorConfig): ProviderAccountConnectorSource {
  return connector.type === "standard" || connector.type === "http-json" || connector.type === "plugin" || connector.type === "local-estimate"
    ? connector.type
    : "unsupported";
}

function connectorId(connector: ProviderAccountConnectorConfig): string | undefined {
  return readString((connector as { id?: unknown }).id);
}

function readConnectorType(connector: ProviderAccountConnectorConfig): string {
  return readString((connector as { type?: unknown }).type) || "unknown";
}

type JsonPathBracketSelection = {
  filter?: JsonPathFilterCondition[];
  key?: number | string;
  nextIndex: number;
};

type JsonPathFilterCondition = {
  expected: number | string;
  path: string[];
};

function readMappedNumber(value: ProviderAccountMappedNumberExpression | undefined, payload: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = readMappedNumber(candidate, payload);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }
  if (typeof value === "number") {
    return normalizeNumber(value);
  }
  if (!value) {
    return undefined;
  }
  const resolved = resolveMappedNumberExpression(value, payload);
  return normalizeNumber(resolved);
}

function resolveMappedNumberExpression(expression: string, payload: unknown): unknown {
  const subtraction = splitMappedSubtractionExpression(expression);
  if (subtraction) {
    const left = normalizeNumber(resolveMappedNumberTerm(subtraction.left, payload));
    const right = normalizeNumber(resolveMappedNumberTerm(subtraction.right, payload));
    return left === undefined || right === undefined ? undefined : left - right;
  }
  return resolveMappedNumberTerm(expression, payload);
}

function splitMappedSubtractionExpression(expression: string): { left: string; right: string } | undefined {
  const match = expression.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    return undefined;
  }
  return {
    left: match[1]?.trim() ?? "",
    right: match[2]?.trim() ?? ""
  };
}

function resolveMappedNumberTerm(term: string, payload: unknown): unknown {
  const trimmed = term.trim();
  return trimmed.startsWith("$") ? readJsonPath(payload, trimmed) : trimmed;
}

function readMappedString(value: ProviderAccountMappedStringExpression | undefined, payload: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = readMappedString(candidate, payload);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }
  if (!value) {
    return undefined;
  }
  const resolved = value.trim().startsWith("$") ? readJsonPath(payload, value) : value;
  return readString(resolved);
}

function readMappedDateString(value: ProviderAccountMappedStringExpression | undefined, payload: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = readMappedDateString(candidate, payload);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    return undefined;
  }
  if (!value) {
    return undefined;
  }
  const resolved = value.trim().startsWith("$") ? readJsonPath(payload, value) : value;
  const numericTimestamp = typeof resolved === "number"
    ? resolved
    : typeof resolved === "string" && /^\d+$/.test(resolved.trim())
      ? Number(resolved)
      : undefined;
  if (numericTimestamp !== undefined && Number.isFinite(numericTimestamp)) {
    const milliseconds = numericTimestamp < 1_000_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return readString(resolved);
}

function readJsonPath(payload: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (trimmed === "$") {
    return payload;
  }
  if (!trimmed.startsWith("$")) {
    return undefined;
  }

  let current = payload;
  let index = 1;
  while (index < trimmed.length) {
    if (trimmed[index] === ".") {
      const nextIndex = nextJsonPathBoundary(trimmed, index + 1);
      const key = trimmed.slice(index + 1, nextIndex);
      if (!key || !isRecord(current)) {
        return undefined;
      }
      current = readJsonRecordValue(current, key);
      index = nextIndex;
      continue;
    }

    if (trimmed[index] === "[") {
      const parsed = readJsonPathBracket(trimmed, index);
      if (!parsed) {
        return undefined;
      }
      if (parsed.filter) {
        if (!Array.isArray(current)) {
          return undefined;
        }
        current = current.find((item) => jsonPathFilterMatches(item, parsed.filter ?? []));
      } else if (typeof parsed.key === "number") {
        if (!Array.isArray(current)) {
          return undefined;
        }
        current = current[parsed.key];
      } else if (typeof parsed.key === "string") {
        if (!isRecord(current)) {
          return undefined;
        }
        current = readJsonRecordValue(current, parsed.key);
      } else {
        return undefined;
      }
      index = parsed.nextIndex;
      continue;
    }

    return undefined;
  }
  return current;
}

function nextJsonPathBoundary(path: string, startIndex: number): number {
  let index = startIndex;
  while (index < path.length && path[index] !== "." && path[index] !== "[") {
    index += 1;
  }
  return index;
}

function readJsonRecordValue(record: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key];
  }
  for (const alternate of jsonPathKeyAlternates(key)) {
    if (Object.prototype.hasOwnProperty.call(record, alternate)) {
      return record[alternate];
    }
  }
  return undefined;
}

function jsonPathKeyAlternates(key: string): string[] {
  const alternates = new Set<string>();
  const camel = key.replace(/[_-]([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase());
  if (camel !== key) {
    alternates.add(camel);
  }
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
  if (snake !== key) {
    alternates.add(snake);
  }
  return [...alternates];
}

function readJsonPathBracket(path: string, startIndex: number): JsonPathBracketSelection | undefined {
  if (path[startIndex] !== "[") {
    return undefined;
  }
  const quote = path[startIndex + 1];
  if (quote === "\"" || quote === "'") {
    let index = startIndex + 2;
    let escaped = false;
    while (index < path.length) {
      const char = path[index];
      if (!escaped && char === quote) {
        const raw = path.slice(startIndex + 1, index + 1);
        if (path[index + 1] !== "]") {
          return undefined;
        }
        try {
          return {
            key: JSON.parse(quote === "'" ? `"${raw.slice(1, -1).replace(/"/g, "\\\"")}"` : raw),
            nextIndex: index + 2
          };
        } catch {
          return undefined;
        }
      }
      escaped = !escaped && char === "\\";
      if (char !== "\\") {
        escaped = false;
      }
      index += 1;
    }
    return undefined;
  }

  const endIndex = path.indexOf("]", startIndex + 1);
  if (endIndex < 0) {
    return undefined;
  }
  const rawIndex = path.slice(startIndex + 1, endIndex).trim();
  if (/^\d+$/.test(rawIndex)) {
    return {
      key: Number(rawIndex),
      nextIndex: endIndex + 1
    };
  }
  const filter = parseJsonPathFilter(rawIndex);
  return filter
    ? {
      filter,
      nextIndex: endIndex + 1
    }
    : undefined;
}

function parseJsonPathFilter(raw: string): JsonPathFilterCondition[] | undefined {
  const match = raw.match(/^\?\((.*)\)$/);
  if (!match) {
    return undefined;
  }
  const conditions = match[1]
    .split(/\s+&&\s+/)
    .map((condition) => parseJsonPathFilterCondition(condition.trim()));
  if (conditions.some((condition) => !condition)) {
    return undefined;
  }
  return conditions as JsonPathFilterCondition[];
}

function parseJsonPathFilterCondition(condition: string): JsonPathFilterCondition | undefined {
  const match = condition.match(/^@((?:\.[A-Za-z_$][A-Za-z0-9_$]*)+)\s*==\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))$/);
  if (!match) {
    return undefined;
  }
  const path = match[1]
    ?.slice(1)
    .split(".")
    .filter(Boolean);
  if (!path?.length) {
    return undefined;
  }
  const expected = match[2] ?? match[3] ?? match[4];
  if (expected === undefined) {
    return undefined;
  }
  return {
    expected: match[4] !== undefined ? Number(expected) : expected,
    path
  };
}

function jsonPathFilterMatches(value: unknown, conditions: JsonPathFilterCondition[]): boolean {
  return conditions.every((condition) => {
    const actual = condition.path.reduce<unknown>((current, key) => isRecord(current) ? readJsonRecordValue(current, key) : undefined, value);
    if (typeof condition.expected === "number") {
      return normalizeNumber(actual) === condition.expected;
    }
    return actual === condition.expected;
  });
}

function normalizeMeterKind(value: string | undefined): ProviderAccountMeterKind | undefined {
  if (value === "balance" || value === "subscription" || value === "quota" || value === "time_window" || value === "tokens" || value === "requests") {
    return value;
  }
  return undefined;
}

function inferMeterKind(unit: string): ProviderAccountMeterKind {
  if (unit === "tokens") {
    return "tokens";
  }
  if (unit === "requests") {
    return "requests";
  }
  if (unit === "hours" || unit === "minutes") {
    return "time_window";
  }
  return "balance";
}

function normalizeStatus(value: string | undefined): ProviderAccountStatus | undefined {
  if (value === "ok" || value === "warning" || value === "critical" || value === "error" || value === "unsupported") {
    return value;
  }
  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeRefreshInterval(value: number | undefined): number {
  return Math.max(minRefreshIntervalMs, value && Number.isFinite(value) ? value : defaultRefreshIntervalMs);
}

function normalizeProviderName(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function joinUrlPath(basePath: string, suffix: string): string {
  const normalizedBase = basePath === "/" ? "" : basePath.replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${normalizedBase}${normalizedSuffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flattenJsonPaths(value: unknown, path = "$", depth = 0): ProviderAccountTestPath[] {
  if (depth > 12) {
    return [{ path, preview: previewJsonValue(value), type: jsonValueType(value) }];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ path, preview: "[]", type: "array" }];
    }
    return value.flatMap((item, index) => flattenJsonPaths(item, `${path}[${index}]`, depth + 1));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [{ path, preview: "{}", type: "object" }];
    }
    return entries.flatMap(([key, item]) => flattenJsonPaths(item, `${path}${escapeJsonPathSegment(key)}`, depth + 1));
  }
  return [{ path, preview: previewJsonValue(value), type: jsonValueType(value) }];
}

function escapeJsonPathSegment(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? `.${value}` : `[${JSON.stringify(value)}]`;
}

function previewJsonValue(value: unknown): string {
  const preview = typeof value === "string" ? value : JSON.stringify(value);
  if (preview === undefined) {
    return String(value);
  }
  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

function jsonValueType(value: unknown): ProviderAccountTestPath["type"] {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "string";
}
