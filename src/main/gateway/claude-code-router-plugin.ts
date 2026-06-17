import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import type { AppConfig, RouterConfig, RouterFallbackConfig, RouterRule } from "../../shared/app";

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
    const routedModel = customModel ?? configuredDecision.model;
    if (routedModel) {
      body.model = routedModel;
    }

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

  const target = normalizeRouteSelector(rule.target);
  if (!target) {
    return undefined;
  }

  if (rule.type === "always") {
    return { fallback, model: target, reason: routerRuleReason(rule) };
  }

  if (rule.type === "long-context") {
    const threshold = rule.threshold || router.longContextThreshold || 200000;
    return tokenCount > threshold ? { fallback, model: target, reason: routerRuleReason(rule) } : undefined;
  }

  if (rule.type === "model-prefix") {
    const pattern = readString(rule.pattern);
    const requestedModel = readString(request.body.model);
    return pattern && requestedModel?.startsWith(pattern)
      ? { fallback, model: target, reason: routerRuleReason(rule) }
      : undefined;
  }

  if (rule.type === "thinking") {
    return request.body.thinking ? { fallback, model: target, reason: routerRuleReason(rule) } : undefined;
  }

  if (rule.type === "web-search") {
    return hasWebSearchTool(request.body.tools) ? { fallback, model: target, reason: routerRuleReason(rule) } : undefined;
  }

  if (rule.type === "image") {
    return hasImageContent(request.body.messages) ? { fallback, model: target, reason: routerRuleReason(rule) } : undefined;
  }

  return undefined;
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
