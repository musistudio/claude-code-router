import type { ApiKeyLimitConfig } from "@ccr/core/contracts/app";
import { parseJsonObject } from "@ccr/core/gateway/http/io";
import { isRecord } from "@ccr/core/gateway/internal/value";
import {
  type ApiKeyLimitRule,
  type ApiKeyLimitUsage,
  type ApiKeyWindowCounter
} from "@ccr/core/gateway/internal/shared";

const apiKeyLimitCounterRetentionWindows = 2;
const apiKeyLimitCounters = new Map<string, ApiKeyWindowCounter>();

export function limitRules(limits: ApiKeyLimitConfig | undefined, usage: ApiKeyLimitUsage): ApiKeyLimitRule[] {
  if (!limits) {
    return [];
  }
  const rules: ApiKeyLimitRule[] = [];
  addLimitRule(rules, "requests", "requests", limits.windowMs ?? 60_000, limits.maxRequests, 1);
  addLimitRule(rules, "rpm", "requests", 60_000, limits.rpm, 1);
  addLimitRule(rules, "rph", "requests", 3_600_000, limits.rph, 1);
  addLimitRule(rules, "rpd", "requests", 86_400_000, limits.rpd, 1);
  addLimitRule(rules, "tpm", "tokens", 60_000, limits.tpm, usage.totalTokens);
  addLimitRule(rules, "tph", "tokens", 3_600_000, limits.tph, usage.totalTokens);
  addLimitRule(rules, "tpd", "tokens", 86_400_000, limits.tpd, usage.totalTokens);
  addLimitRule(rules, "ipm", "images", 60_000, limits.ipm, usage.imageCount);
  addLimitRule(rules, "iph", "images", 3_600_000, limits.iph, usage.imageCount);
  addLimitRule(rules, "ipd", "images", 86_400_000, limits.ipd, usage.imageCount);
  addLimitRule(rules, "quota", "tokens", limits.quotaWindowMs ?? 86_400_000, limits.maxTokens, usage.totalTokens);
  return rules;
}

export function readWindowCounter(
  key: string,
  windowStart: number,
  windowMs: number,
  now = Date.now()
): ApiKeyWindowCounter {
  pruneExpiredCounters(now);
  const existing = apiKeyLimitCounters.get(key);
  if (existing && existing.windowStart === windowStart) {
    return existing;
  }
  const fresh = {
    expiresAt: windowStart + windowMs * apiKeyLimitCounterRetentionWindows,
    value: 0,
    windowStart
  };
  apiKeyLimitCounters.set(key, fresh);
  return fresh;
}

export function estimateLimitUsage(method: string, requestBody: Buffer): ApiKeyLimitUsage {
  if (method.toUpperCase() !== "POST" || requestBody.byteLength === 0) {
    return { imageCount: 0, totalTokens: 0 };
  }

  const body = parseJsonObject(requestBody);
  const inputCharacters = countUnknownCharacters(body.messages) + countUnknownCharacters(body.system) + countUnknownCharacters(body.tools);
  const inputTokens = Math.ceil(inputCharacters / 4);
  const outputTokens = readPositiveNumber(body.max_tokens) ?? readPositiveNumber(body.max_output_tokens) ?? 1024;
  return {
    imageCount: countImageInputs(body),
    totalTokens: Math.max(1, inputTokens + outputTokens)
  };
}

function addLimitRule(
  rules: ApiKeyLimitRule[],
  name: string,
  metric: ApiKeyLimitRule["metric"],
  windowMs: number,
  limit: number | undefined,
  requested: number
): void {
  if (!limit || limit <= 0 || windowMs <= 0) {
    return;
  }
  rules.push({ limit, metric, name, requested, windowMs });
}

function pruneExpiredCounters(now: number): void {
  for (const [key, counter] of apiKeyLimitCounters) {
    if (counter.expiresAt <= now) {
      apiKeyLimitCounters.delete(key);
    }
  }
}

function countUnknownCharacters(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return String(value).length;
  }
}

function countImageInputs(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countImageInputs(item), 0);
  }
  if (!isRecord(value)) return 0;
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  const isImage = type === "image" || type === "image_url" || type === "input_image" || value.image_url !== undefined || value.input_image !== undefined;
  return (isImage ? 1 : 0) + Object.values(value).reduce<number>((sum, item) => sum + countImageInputs(item), 0);
}

function readPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : undefined;
}
