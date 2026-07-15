import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { loadPersistedApiKeys } from "@ccr/core/config/api-key-store";
import { formatError, readAuthToken, readRemoteControlQueryAuthToken, sendJson } from "@ccr/core/gateway/http/io";
import { estimateLimitUsage, limitRules, readWindowCounter } from "@ccr/core/gateway/limits/window-limiter";
import type { ApiKeyAuthorizationResult, ApiKeyLimitRule, ApiKeyLimitUsage } from "@ccr/core/gateway/internal/shared";

const persistedApiKeyCacheTtlMs = 1000;
let persistedApiKeyCache: { loadedAt: number; values: ApiKeyConfig[] } | undefined;

export async function authorize(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig
): Promise<ApiKeyAuthorizationResult> {
  let apiKeys = await configuredApiKeys(config);
  if (apiKeys.length === 0) {
    sendJson(response, 403, {
      error: {
        message: "CCR API key is not initialized. Save a gateway API key or restart CCR to generate one."
      }
    });
    return { ok: false };
  }

  const token = readAuthToken(request.headers) || readRemoteControlQueryAuthToken(request);
  let apiKey = token ? apiKeys.find((item) => item.key === token) : undefined;
  if (!apiKey && token) {
    apiKeys = await configuredApiKeys(config, { refresh: true });
    apiKey = apiKeys.find((item) => item.key === token);
  }
  if (apiKey) {
    if (isApiKeyExpired(apiKey)) {
      sendJson(response, 401, { error: { message: "API key is expired." } });
      return { ok: false };
    }
    return { ok: true, apiKey };
  }

  sendJson(response, 401, { error: { message: token ? "Invalid API key." : "API key is missing." } });
  return { ok: false };
}

export function reserveApiKeyLimits(
  apiKey: ApiKeyConfig | undefined,
  request: IncomingMessage,
  response: ServerResponse,
  requestBody: Buffer
): boolean {
  if (!apiKey?.limits) return true;

  const usage = estimateLimitUsage(request.method ?? "GET", requestBody);
  const rules = apiKeyLimitRules(apiKey, usage);
  const now = Date.now();
  const checks = rules.map((rule) => {
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    return {
      counterKey: ["api-key", apiKey.id, rule.name, rule.metric, rule.windowMs, windowStart].join("|"),
      rule,
      windowStart
    };
  });

  for (const check of checks) {
    const counter = readWindowCounter(check.counterKey, check.windowStart, check.rule.windowMs, now);
    if (counter.value + check.rule.requested > check.rule.limit) {
      sendJson(response, 429, {
        error: {
          code: "rate_limit_exceeded",
          message: `API key ${check.rule.name} limit exceeded.`,
          details: {
            limit: check.rule.limit,
            limit_name: check.rule.name,
            metric: check.rule.metric,
            requested: check.rule.requested,
            used: counter.value,
            window_ms: check.rule.windowMs
          }
        }
      });
      return false;
    }
  }

  for (const check of checks) {
    readWindowCounter(check.counterKey, check.windowStart, check.rule.windowMs, now).value += check.rule.requested;
  }
  return true;
}

async function configuredApiKeys(config: AppConfig, options: { refresh?: boolean } = {}): Promise<ApiKeyConfig[]> {
  const persistedApiKeys = await loadPersistedApiKeysCached(options);
  const values = [
    ...persistedApiKeys,
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS : []),
    ...(config.APIKEY ? [{ createdAt: new Date(0).toISOString(), id: "legacy", key: config.APIKEY }] : [])
  ];
  const seen = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const value of values) {
    const key = value?.key?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...value, key });
  }
  return result;
}

async function loadPersistedApiKeysCached(options: { refresh?: boolean } = {}): Promise<ApiKeyConfig[]> {
  const now = Date.now();
  if (!options.refresh && persistedApiKeyCache && now - persistedApiKeyCache.loadedAt < persistedApiKeyCacheTtlMs) {
    return persistedApiKeyCache.values;
  }
  try {
    const values = await loadPersistedApiKeys();
    persistedApiKeyCache = { loadedAt: now, values };
    return values;
  } catch (error) {
    console.warn(`[gateway] Failed to load persisted API keys: ${formatError(error)}`);
    return [];
  }
}

function isApiKeyExpired(apiKey: ApiKeyConfig): boolean {
  if (!apiKey.expiresAt) return false;
  const expiresAt = Date.parse(apiKey.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function apiKeyLimitRules(apiKey: ApiKeyConfig, usage: ApiKeyLimitUsage): ApiKeyLimitRule[] {
  return limitRules(apiKey.limits, usage);
}
