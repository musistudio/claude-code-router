import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { loadPersistedApiKeys } from "@ccr/core/config/config-repository";
import { formatError, readAuthToken, readRemoteControlQueryAuthToken, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { estimateLimitUsage, limitRules, readWindowCounter } from "@ccr/core/gateway/limits/window-limiter";
import type { ApiKeyAuthorizationResult, ApiKeyLimitRule, ApiKeyLimitUsage } from "@ccr/core/gateway/internal/shared";

export const claudeCodeWifTokenPath = "/v1/oauth/token";
const claudeCodeWifGrantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const claudeCodeWifTokenExpiresInSeconds = 3600;
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
  let apiKey = token ? findApiKeyByToken(apiKeys, token) : undefined;
  if (!apiKey && token) {
    apiKeys = await configuredApiKeys(config, { refresh: true });
    apiKey = findApiKeyByToken(apiKeys, token);
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

export async function handleClaudeCodeWifTokenRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig
): Promise<void> {
  const result = await exchangeClaudeCodeWifToken(config, await readRequestBody(request));
  sendJson(response, result.statusCode, result.payload);
}

export async function exchangeClaudeCodeWifToken(
  config: AppConfig,
  requestBody: Buffer
): Promise<{ payload: Record<string, unknown>; statusCode: number }> {
  const body = parseClaudeCodeWifTokenRequestBody(requestBody);
  const grantType = stringField(body.grant_type);
  if (grantType !== claudeCodeWifGrantType) {
    return oauthTokenError(400, "unsupported_grant_type", "Claude Code WIF requires the JWT bearer grant type.");
  }

  const assertion = stringField(body.assertion);
  if (!assertion) {
    return oauthTokenError(400, "invalid_request", "Claude Code WIF assertion is missing.");
  }

  let apiKeys = await configuredApiKeys(config);
  let apiKey = findApiKeyByToken(apiKeys, assertion);
  if (!apiKey) {
    apiKeys = await configuredApiKeys(config, { refresh: true });
    apiKey = findApiKeyByToken(apiKeys, assertion);
  }
  if (!apiKey || isApiKeyExpired(apiKey)) {
    return oauthTokenError(401, "invalid_grant", "Claude Code WIF assertion is invalid or expired.");
  }

  return {
    payload: {
      access_token: apiKey.key,
      expires_in: claudeCodeWifTokenExpiresInSeconds,
      token_type: "Bearer"
    },
    statusCode: 200
  };
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

function parseClaudeCodeWifTokenRequestBody(buffer: Buffer): Record<string, unknown> {
  const text = buffer.toString("utf8").trim();
  if (!text) {
    return {};
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function oauthTokenError(
  statusCode: number,
  error: string,
  errorDescription: string
): { payload: Record<string, unknown>; statusCode: number } {
  return {
    payload: {
      error,
      error_description: errorDescription
    },
    statusCode
  };
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

function findApiKeyByToken(apiKeys: ApiKeyConfig[], token: string): ApiKeyConfig | undefined {
  return apiKeys.find((item) => constantTimeEqual(item.key, token));
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isApiKeyExpired(apiKey: ApiKeyConfig): boolean {
  if (!apiKey.expiresAt) return false;
  const expiresAt = Date.parse(apiKey.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function apiKeyLimitRules(apiKey: ApiKeyConfig, usage: ApiKeyLimitUsage): ApiKeyLimitRule[] {
  return limitRules(apiKey.limits, usage);
}
