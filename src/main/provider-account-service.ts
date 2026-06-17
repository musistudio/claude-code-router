import { loadAppConfig } from "./config";
import { pluginService } from "./plugins/service";
import { getUsageTotalsSince } from "./usage-store";
import { normalizeProviderBaseUrl, providerUrlWithDefaultScheme } from "../shared/provider-url";
import type {
  AppConfig,
  GatewayProviderConfig,
  ProviderAccountConfig,
  ProviderAccountConnectorConfig,
  ProviderAccountConnectorError,
  ProviderAccountConnectorSource,
  ProviderAccountHttpJsonConnectorConfig,
  ProviderAccountLocalEstimateConnectorConfig,
  ProviderAccountLocalWindowConfig,
  ProviderAccountMappedMeterConfig,
  ProviderAccountMeter,
  ProviderAccountMeterKind,
  ProviderAccountMeterUnit,
  ProviderAccountPluginConnectorConfig,
  ProviderAccountSnapshot,
  ProviderAccountStandardConnectorConfig,
  ProviderAccountStatus
} from "../shared/app";

type CacheEntry = {
  expiresAt: number;
  snapshot: ProviderAccountSnapshot;
};

type ConnectorResult = {
  errors: ProviderAccountConnectorError[];
  meters: ProviderAccountMeter[];
  message?: string;
  source: ProviderAccountConnectorSource;
  status?: ProviderAccountStatus;
};

const defaultRefreshIntervalMs = 5 * 60 * 1000;
const minRefreshIntervalMs = 30 * 1000;
const standardAccountPaths = ["/.well-known/ccr/account", "/v1/account/limits"];
const cache = new Map<string, CacheEntry>();

export async function getProviderAccountSnapshots(providerName?: string): Promise<ProviderAccountSnapshot[]> {
  const config = await loadAppConfig();
  const normalizedProviderName = normalizeProviderName(providerName);
  const providers = config.Providers.filter((provider) => {
    if (!normalizedProviderName) {
      return true;
    }
    return provider.name.trim().toLowerCase() === normalizedProviderName;
  });

  const snapshots = await Promise.all(providers.map((provider) => resolveProviderAccountSnapshot(config, provider)));
  return snapshots.filter((snapshot): snapshot is ProviderAccountSnapshot => Boolean(snapshot));
}

async function resolveProviderAccountSnapshot(config: AppConfig, provider: GatewayProviderConfig): Promise<ProviderAccountSnapshot | undefined> {
  const account = provider.account;
  if (!account?.enabled) {
    return undefined;
  }

  const providerName = provider.name.trim();
  if (!providerName) {
    return undefined;
  }

  const refreshIntervalMs = normalizeRefreshInterval(account.refreshIntervalMs);
  const cacheKey = `${providerName}:${JSON.stringify(account.connectors ?? [])}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const now = new Date();
  const connectorResults = await Promise.all(
    normalizeConnectors(account).map((connector) => resolveConnector(config, provider, connector, now))
  );
  const snapshot = mergeConnectorResults(providerName, connectorResults, now, refreshIntervalMs);
  cache.set(cacheKey, {
    expiresAt: Date.now() + refreshIntervalMs,
    snapshot
  });
  return snapshot;
}

function normalizeConnectors(account: ProviderAccountConfig): ProviderAccountConnectorConfig[] {
  return Array.isArray(account.connectors) ? account.connectors : [];
}

async function resolveConnector(
  config: AppConfig,
  provider: GatewayProviderConfig,
  connector: ProviderAccountConnectorConfig,
  now: Date
): Promise<ConnectorResult> {
  try {
    if (connector.type === "standard") {
      return await resolveStandardConnector(provider, connector);
    }
    if (connector.type === "http-json") {
      return await resolveHttpJsonConnector(provider, connector);
    }
    if (connector.type === "plugin") {
      return await resolvePluginConnector(config, provider, connector, now);
    }
    if (connector.type === "local-estimate") {
      return await resolveLocalEstimateConnector(provider, connector, now);
    }
    return connectorError("unsupported", `Unsupported account connector type: ${readConnectorType(connector)}`, connectorId(connector));
  } catch (error) {
    return connectorError(connectorSource(connector), formatError(error), connectorId(connector));
  }
}

async function resolveStandardConnector(
  provider: GatewayProviderConfig,
  connector: ProviderAccountStandardConnectorConfig
): Promise<ConnectorResult> {
  const endpoints = standardConnectorEndpoints(provider, connector);
  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(endpoint, provider, connector.auth, connector.headers);
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
  provider: GatewayProviderConfig,
  connector: ProviderAccountHttpJsonConnectorConfig
): Promise<ConnectorResult> {
  const payload = await fetchJson(connector.endpoint, provider, connector.auth, connector.headers, connector.method, connector.body);
  const meters = connector.mapping.meters
    .map((meter) => mappedMeterFromPayload(meter, payload))
    .filter((meter): meter is ProviderAccountMeter => Boolean(meter));
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
  now: Date
): Promise<ConnectorResult> {
  const meters = await Promise.all(
    connector.windows.map((window) => localEstimateMeter(provider, window, now))
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
  now: Date
): Promise<ProviderAccountMeter | undefined> {
  const limit = normalizeNumber(window.limit);
  if (!window.id || !window.label || !limit || limit <= 0) {
    return undefined;
  }

  const since = localEstimateWindowStart(window.window, now);
  const totals = await getUsageTotalsSince(since, { provider: provider.name });
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
  refreshIntervalMs: number
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
  return normalizeMeter({
    id,
    kind: config.kind,
    label,
    limit: readMappedNumber(config.limit, payload),
    remaining: readMappedNumber(config.remaining, payload),
    resetAt: readMappedString(config.resetAt, payload),
    unit: config.unit,
    used: readMappedNumber(config.used, payload),
    window: config.window
  }, "http-json");
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
  return {
    id,
    kind: normalizeMeterKind(readString(value.kind)) ?? inferMeterKind(unit),
    label,
    limit: normalizeNumber(value.limit),
    remaining: normalizeNumber(value.remaining),
    resetAt: readString(value.resetAt),
    source,
    unit,
    used: normalizeNumber(value.used),
    window: readString(value.window)
  };
}

async function fetchJson(
  endpoint: string,
  provider: GatewayProviderConfig,
  auth: "provider-api-key" | "none" = "provider-api-key",
  headers: Record<string, string> | undefined = undefined,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<unknown> {
  const apiKey = providerApiKey(provider);
  const requestHeaders: Record<string, string> = {
    accept: "application/json",
    ...(headers ?? {})
  };
  if (auth === "provider-api-key" && apiKey) {
    requestHeaders.authorization = requestHeaders.authorization ?? `Bearer ${apiKey}`;
  }
  if (method === "POST") {
    requestHeaders["content-type"] = requestHeaders["content-type"] ?? "application/json";
  }

  const response = await fetch(endpoint, {
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    headers: requestHeaders,
    method
  });
  if (!response.ok) {
    throw new Error(`Account endpoint returned HTTP ${response.status}.`);
  }
  return await response.json() as unknown;
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

function readMappedNumber(value: number | string | undefined, payload: unknown): number | undefined {
  if (typeof value === "number") {
    return normalizeNumber(value);
  }
  if (!value) {
    return undefined;
  }
  const resolved = value.trim().startsWith("$") ? readJsonPath(payload, value) : value;
  return normalizeNumber(resolved);
}

function readMappedString(value: string | undefined, payload: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  const resolved = value.trim().startsWith("$") ? readJsonPath(payload, value) : value;
  return readString(resolved);
}

function readJsonPath(payload: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (trimmed === "$") {
    return payload;
  }
  if (!trimmed.startsWith("$.")) {
    return undefined;
  }

  let current = payload;
  for (const segment of trimmed.slice(2).split(".")) {
    if (!segment) {
      return undefined;
    }
    const match = /^([^\[]+)(?:\[(\d+)])?$/.exec(segment);
    if (!match || !isRecord(current)) {
      return undefined;
    }
    current = current[match[1]];
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[Number(match[2])];
    }
  }
  return current;
}

function normalizeMeterKind(value: string | undefined): ProviderAccountMeterKind | undefined {
  if (value === "balance" || value === "quota" || value === "time_window" || value === "tokens" || value === "requests") {
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
