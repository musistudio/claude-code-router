import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import type { AppConfig, RouterConfig, RouterFallbackConfig, RouterRule, RouterRuleCondition, RouterRuleRewrite } from "../../shared/app";

type HeaderValue = string | string[] | undefined;

export type MutableRequestLike = {
  body: Record<string, unknown>;
  headers: Record<string, HeaderValue>;
  log: Pick<Console, "debug" | "error" | "info" | "warn">;
  method: string;
  sessionId?: string;
  tokenCount?: number;
  url: string;
};

export type ClaudeCodeRouteDecision = {
  fallback?: RouterFallbackConfig;
  model?: string;
  reason: string;
  sessionId?: string;
  tokenCount: number;
};

type ConfiguredRouteDecision = {
  fallback?: RouterFallbackConfig;
  model?: string;
  reason: string;
  rewrite?: RouterRuleRewrite;
  rewrites?: RouterRuleRewrite[];
};

const requireFromHere = createRequire(__filename);

export class ClaudeCodeRouterPlugin {
  private readonly event = new EventEmitter();

  constructor(private readonly config: AppConfig) {}

  async routeRequest(input: {
    body: Record<string, unknown>;
    headers: Record<string, HeaderValue>;
    method: string;
    url: string;
  }): Promise<{ body: Record<string, unknown>; decision: ClaudeCodeRouteDecision }> {
    const body = cloneRecord(input.body);
    const sessionId = resolveSessionId(body, input.headers);
    const tokenCount = calculateTokenCount(body.messages, body.system, body.tools);
    const request: MutableRequestLike = {
      body,
      headers: input.headers,
      log: console,
      method: input.method,
      sessionId,
      tokenCount,
      url: input.url
    };

    const customModel = await this.resolveCustomRoute(request);
    const configuredDecision = resolveConfiguredRouteDecision(request, this.config, tokenCount);
    if (customModel) {
      body.model = customModel;
    } else {
      if (configuredDecision.rewrites?.length) {
        for (const rewrite of configuredDecision.rewrites) {
          applyRouterRewrite(rewrite, request);
        }
      } else if (configuredDecision.rewrite) {
        applyRouterRewrite(configuredDecision.rewrite, request);
      }
      if (configuredDecision.model) {
        body.model = configuredDecision.model;
      }
    }
    const routedModel = customModel ?? configuredDecision.model ?? readString(body.model);

    return {
      body,
      decision: {
        fallback: customModel ? this.config.Router.fallback : configuredDecision.fallback,
        model: routedModel,
        reason: customModel ? "custom-router" : configuredDecision.reason,
        sessionId,
        tokenCount
      }
    };
  }

  countTokens(body: Record<string, unknown>) {
    return {
      input_tokens: calculateTokenCount(body.messages, body.system, body.tools)
    };
  }

  private async resolveCustomRoute(request: MutableRequestLike): Promise<string | undefined> {
    const routerPath = this.config.CUSTOM_ROUTER_PATH;
    if (!routerPath) {
      return undefined;
    }

    try {
      delete requireFromHere.cache[requireFromHere.resolve(routerPath)];
      const loaded = requireFromHere(routerPath) as unknown;
      const customRouter = typeof loaded === "function" ? loaded : readDefaultFunction(loaded);
      if (!customRouter) {
        request.log.warn(`Custom router does not export a function: ${routerPath}`);
        return undefined;
      }
      const result = await customRouter(request, this.config, { event: this.event });
      return normalizeRouteSelector(typeof result === "string" ? result : undefined);
    } catch (error) {
      request.log.error(`Failed to load custom router "${routerPath}": ${formatError(error)}`);
      return undefined;
    }
  }
}

function resolveConfiguredRouteDecision(
  request: MutableRequestLike,
  config: AppConfig,
  tokenCount: number
): ConfiguredRouteDecision {
  const requestedModel = readString(request.body.model);
  const explicitModel = normalizeRouteSelector(requestedModel);
  if (explicitModel && isKnownInlineRoute(explicitModel, config)) {
    return { fallback: config.Router.fallback, model: explicitModel, reason: "inline-model" };
  }

  const router = config.Router;
  const rules = router.rules ?? [];
  for (const rule of rules) {
    const decision = resolveRouterRule(rule, request, tokenCount, router);
    if (decision) {
      return decision;
    }
  }

  return { fallback: router.fallback, model: normalizeRouteSelector(router.default) ?? explicitModel, reason: "default" };
}

function resolveRouterRule(
  rule: RouterRule,
  request: MutableRequestLike,
  tokenCount: number,
  router: RouterConfig
): ConfiguredRouteDecision | undefined {
  if (!rule.enabled) {
    return undefined;
  }
  const fallback = rule.fallback ?? router.fallback;

  if (rule.type === "subagent") {
    const subagentModel = extractSubagentModel(request.body.system);
    return subagentModel ? { fallback, model: normalizeRouteSelector(subagentModel), reason: "subagent" } : undefined;
  }

  const rewrites = routerRuleRewritesFromRule(rule);
  if (rewrites.length === 0) {
    return undefined;
  }

  if (rule.type === "condition") {
    return rule.condition && routerRuleConditionMatches(rule.condition, request)
      ? routerRuleRewriteDecision(rule, rewrites, fallback)
      : undefined;
  }

  if (rule.type === "long-context") {
    const threshold = rule.threshold || router.longContextThreshold || 200000;
    return tokenCount > threshold ? routerRuleRewriteDecision(rule, rewrites, fallback) : undefined;
  }

  if (rule.type === "model-prefix") {
    const pattern = readString(rule.pattern);
    const requestedModel = readString(request.body.model);
    return pattern && requestedModel?.startsWith(pattern)
      ? routerRuleRewriteDecision(rule, rewrites, fallback)
      : undefined;
  }

  if (rule.type === "thinking") {
    return request.body.thinking ? routerRuleRewriteDecision(rule, rewrites, fallback) : undefined;
  }

  if (rule.type === "web-search") {
    return hasWebSearchTool(request.body.tools) ? routerRuleRewriteDecision(rule, rewrites, fallback) : undefined;
  }

  if (rule.type === "image") {
    return hasImageContent(request.body.messages) ? routerRuleRewriteDecision(rule, rewrites, fallback) : undefined;
  }

  return undefined;
}

function routerRuleRewriteDecision(
  rule: RouterRule,
  rewrites: RouterRuleRewrite[],
  fallback: RouterFallbackConfig
): ConfiguredRouteDecision {
  const modelRewrite = rewrites.find((rewrite) => (rewrite.operation ?? "set") === "set" && rewrite.key === "request.body.model");
  return {
    fallback,
    model: modelRewrite?.value ? normalizeRouteSelector(modelRewrite.value) : undefined,
    reason: routerRuleReason(rule),
    rewrite: rewrites[0],
    rewrites
  };
}

function routerRuleRewritesFromRule(rule: RouterRule): RouterRuleRewrite[] {
  if (rule.rewrites?.length) {
    return rule.rewrites;
  }
  if (rule.rewrite) {
    return [rule.rewrite];
  }
  return rule.target
    ? [{ key: "request.body.model", operation: "set", value: rule.target }]
    : [];
}

function applyRouterRewrite(rewrite: RouterRuleRewrite, request: MutableRequestLike): void {
  const parts = rewrite.key
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const [scope, section, ...rest] = parts;
  if (scope !== "request") {
    return;
  }

  if (section === "header" || section === "headers") {
    const name = rest.join(".").trim().toLowerCase();
    if (!name) {
      return;
    }
    if ((rewrite.operation ?? "set") === "delete") {
      delete request.headers[name];
    } else if (rewrite.value !== undefined) {
      request.headers[name] = rewrite.value;
    }
    return;
  }

  if (section === "body") {
    applyBodyRewrite(request.body, rest, rewrite);
  }
}

function applyBodyRewrite(body: Record<string, unknown>, path: string[], rewrite: RouterRuleRewrite): void {
  const operation = rewrite.operation ?? "set";
  if (operation === "delete") {
    deletePathValue(body, path);
    return;
  }

  const value = rewrite.key === "request.body.model" && rewrite.value !== undefined
    ? normalizeRouteSelector(rewrite.value) ?? rewrite.value
    : rewrite.value !== undefined
      ? parseRewriteLiteral(rewrite.value)
      : undefined;

  if (operation === "set") {
    setPathValue(body, path, value);
    return;
  }

  const current = readPathValue(body, path);
  const array = Array.isArray(current) ? [...current] : [];
  if (operation === "array-append") {
    array.push(value);
    setPathValue(body, path, array);
    return;
  }
  if (operation === "array-prepend") {
    array.unshift(value);
    setPathValue(body, path, array);
    return;
  }
  if (operation === "array-remove") {
    setPathValue(body, path, array.filter((item) => !arrayElementMatches(item, value)));
    return;
  }
  if (operation === "array-replace" && rewrite.match !== undefined) {
    const match = parseRewriteLiteral(rewrite.match);
    setPathValue(body, path, array.map((item) => arrayElementMatches(item, match) ? value : item));
  }
}

function setPathValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    return;
  }

  let current: unknown = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextKey = path[index + 1];
    if (Array.isArray(current)) {
      const arrayIndex = Number(key);
      if (!Number.isInteger(arrayIndex)) {
        return;
      }
      if (!isRecord(current[arrayIndex]) && !Array.isArray(current[arrayIndex])) {
        current[arrayIndex] = numericPathSegment(nextKey) ? [] : {};
      }
      current = current[arrayIndex];
      continue;
    }
    if (!isRecord(current)) {
      return;
    }
    if (!isRecord(current[key]) && !Array.isArray(current[key])) {
      current[key] = numericPathSegment(nextKey) ? [] : {};
    }
    current = current[key];
  }

  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    const arrayIndex = Number(lastKey);
    if (Number.isInteger(arrayIndex)) {
      current[arrayIndex] = value;
    }
    return;
  }
  if (isRecord(current)) {
    current[lastKey] = value;
  }
}

function deletePathValue(target: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) {
    return;
  }
  const parent = readPathValue(target, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      parent.splice(index, 1);
    }
    return;
  }
  if (isRecord(parent)) {
    delete parent[key];
  }
}

function numericPathSegment(value: string): boolean {
  return /^\d+$/.test(value);
}

function parseRewriteLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const json = parseJsonLiteral(trimmed);
  if (json.ok) return json.value;
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const parsedNumber = Number(trimmed);
  return trimmed && Number.isFinite(parsedNumber) ? parsedNumber : trimmed;
}

function routerRuleConditionMatches(condition: RouterRuleCondition, request: MutableRequestLike): boolean {
  if (condition.left.trim().startsWith("response.")) {
    return false;
  }
  const actual = resolveRouterConditionValue(condition.left, request);
  const expected = parseConditionLiteral(condition.right);

  if (condition.operator === "starts-with") {
    const actualText = conditionComparableText(actual);
    const expectedText = conditionComparableText(expected);
    return actualText !== undefined && expectedText !== undefined && actualText.startsWith(expectedText);
  }

  if (condition.operator === "contains" || condition.operator === "not-contains" || condition.operator === "contains-deep") {
    const matched = condition.operator === "contains-deep"
      ? valueContainsDeep(actual, expected)
      : valueContains(actual, expected);
    return condition.operator === "not-contains" ? !matched : matched;
  }

  if (condition.operator === "==" || condition.operator === "!=") {
    const matched = valuesEqual(actual, expected);
    return condition.operator === "==" ? matched : !matched;
  }

  const actualNumber = numberValue(actual);
  const expectedNumber = numberValue(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    if (condition.operator === ">") return actualNumber > expectedNumber;
    if (condition.operator === ">=") return actualNumber >= expectedNumber;
    if (condition.operator === "<") return actualNumber < expectedNumber;
    if (condition.operator === "<=") return actualNumber <= expectedNumber;
  }

  const actualText = conditionComparableText(actual);
  const expectedText = conditionComparableText(expected);
  if (actualText === undefined || expectedText === undefined) {
    return false;
  }
  if (condition.operator === ">") return actualText > expectedText;
  if (condition.operator === ">=") return actualText >= expectedText;
  if (condition.operator === "<") return actualText < expectedText;
  if (condition.operator === "<=") return actualText <= expectedText;
  return false;
}

function resolveRouterConditionValue(path: string, request: MutableRequestLike): unknown {
  const parts = path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  const [scope, section, ...rest] = parts;
  if (scope === "response") {
    return undefined;
  }
  if (scope !== "request") {
    return undefined;
  }

  if (section === "header" || section === "headers") {
    return readRequestHeader(request.headers, rest.join("."));
  }
  if (section === "body") {
    return readPathValue(request.body, rest);
  }
  if (section === "method") {
    return request.method;
  }
  if (section === "url") {
    return request.url;
  }
  if (section === "tokenCount" || section === "token_count") {
    return request.tokenCount;
  }
  if (section === "sessionId" || section === "session_id") {
    return request.sessionId;
  }

  return readPathValue(request.body, [section, ...rest].filter(Boolean));
}

function readRequestHeader(headers: Record<string, HeaderValue>, name: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const direct = readHeader(headers[normalized]);
  if (direct !== undefined) {
    return direct;
  }
  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === normalized);
  return matchedKey ? readHeader(headers[matchedKey]) : undefined;
}

function readPathValue(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return isRecord(current) ? current[part] : undefined;
  }, value);
}

function parseConditionLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;
  const json = parseJsonLiteral(trimmed);
  if (json.ok) return json.value;
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const parsedNumber = Number(trimmed);
  return trimmed && Number.isFinite(parsedNumber) ? parsedNumber : trimmed;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true;
  }
  const actualNumber = numberValue(actual);
  const expectedNumber = numberValue(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    return actualNumber === expectedNumber;
  }
  return conditionComparableText(actual) === conditionComparableText(expected);
}

function valueContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => arrayElementMatches(item, expected));
  }
  if (typeof actual === "string") {
    const expectedText = conditionComparableText(expected);
    return expectedText !== undefined && actual.includes(expectedText);
  }
  return false;
}

function valueContainsDeep(actual: unknown, expected: unknown): boolean {
  if (valueContains(actual, expected) || valuesEqual(actual, expected)) {
    return true;
  }
  if (Array.isArray(actual)) {
    return actual.some((item) => valueContainsDeep(item, expected));
  }
  if (isRecord(actual)) {
    return Object.values(actual).some((item) => valueContainsDeep(item, expected));
  }
  const actualText = conditionComparableText(actual);
  const expectedText = conditionComparableText(expected);
  return actualText !== undefined && expectedText !== undefined && actualText.includes(expectedText);
}

function arrayElementMatches(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected) && isRecord(actual)) {
    return Object.entries(expected).every(([key, expectedValue]) => arrayElementMatches(actual[key], expectedValue));
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((item, index) => arrayElementMatches(actual[index], item));
  }
  return valuesEqual(actual, expected);
}

function parseJsonLiteral(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value || (!value.startsWith("{") && !value.startsWith("["))) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function conditionComparableText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.map((item) => conditionComparableText(item)).filter((item): item is string => item !== undefined).join(",");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function routerRuleReason(rule: RouterRule): string {
  if (rule.id.startsWith("legacy-")) {
    return rule.id.replace(/^legacy-/, "");
  }
  return `rule:${rule.id}`;
}

export function normalizeRouteSelector(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return provider && model ? `${provider}/${model}` : undefined;
  }

  return trimmed;
}

function isKnownInlineRoute(model: string | undefined, config: AppConfig): boolean {
  if (!model) {
    return false;
  }

  const separator = model.indexOf("/");
  if (separator <= 0) {
    return false;
  }

  const providerName = model.slice(0, separator).trim().toLowerCase();
  return config.Providers.some((provider) => provider.name.trim().toLowerCase() === providerName);
}

function calculateTokenCount(messages: unknown, system: unknown, tools: unknown): number {
  return countMessageTokens(messages) + countSystemTokens(system) + countToolTokens(tools);
}

function countMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((total, message) => total + countUnknownTokens(message), 0);
}

function countSystemTokens(system: unknown): number {
  return countUnknownTokens(system);
}

function countToolTokens(tools: unknown): number {
  if (!Array.isArray(tools)) {
    return 0;
  }
  return tools.reduce((total, tool) => total + countUnknownTokens(tool), 0);
}

function countUnknownTokens(value: unknown): number {
  if (typeof value === "string") {
    return estimateTextTokens(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countUnknownTokens(item), 0);
  }

  if (!isRecord(value)) {
    return 0;
  }

  let total = 0;
  for (const [key, item] of Object.entries(value)) {
    total += estimateTextTokens(key);
    total += countUnknownTokens(item);
  }
  return total;
}

function estimateTextTokens(text: string): number {
  const asciiWords = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return Math.max(1, Math.ceil((asciiWords + cjkChars) * 1.15));
}

function extractSubagentModel(system: unknown): string | undefined {
  if (!Array.isArray(system) || system.length < 2) {
    return undefined;
  }
  const second = system[1];
  if (!isRecord(second) || typeof second.text !== "string") {
    return undefined;
  }

  const match = second.text.match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
  if (!match?.[1]) {
    return undefined;
  }

  second.text = second.text.replace(match[0], "");
  return match[1].trim();
}

function hasWebSearchTool(tools: unknown): boolean {
  return Array.isArray(tools) && tools.some((tool) => isRecord(tool) && readString(tool.type)?.startsWith("web_search"));
}

function hasImageContent(messages: unknown): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some((message) => JSON.stringify(message).includes("\"image\""));
}

function resolveSessionId(body: Record<string, unknown>, headers: Record<string, HeaderValue>): string | undefined {
  const fromHeader = readHeader(headers["x-claude-code-session-id"]) || readHeader(headers["x-claude-session-id"]);
  if (fromHeader) {
    return fromHeader;
  }

  const metadata = body.metadata;
  if (isRecord(metadata) && typeof metadata.user_id === "string") {
    const parts = metadata.user_id.split("_session_");
    if (parts.length > 1) {
      return parts.at(-1);
    }
  }

  return undefined;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDefaultFunction(value: unknown): ((...args: unknown[]) => unknown) | undefined {
  if (isRecord(value) && typeof value.default === "function") {
    return value.default as (...args: unknown[]) => unknown;
  }
  return undefined;
}

function readHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
