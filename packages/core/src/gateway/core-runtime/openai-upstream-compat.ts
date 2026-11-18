import { isRecord } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  url: string;
};

const responsesMinOutputTokens = 16;

/**
 * o-series (o1, o3, o4-mini, ...) and gpt-5 family models (gpt-5, gpt-5-mini, gpt-5.2,
 * dated suffixes) reject `max_tokens` on Chat Completions. Fine-tunes keep the base model
 * name after `ft:` and OpenAI-qualified ids keep it after `openai/`.
 */
const maxTokensRejectingModel = /^(?:openai\/)?(?:ft:)?(?:o\d+|gpt-5)(?:[-.:]|$)/i;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isOfficialOpenAiUrl(url: URL): boolean {
  return url.protocol === "https:" &&
    url.hostname === "api.openai.com" &&
    (url.port === "" || url.port === "443");
}

/**
 * Fixes request fields that an Anthropic-originated request still carries after protocol
 * conversion but that OpenAI rejects:
 *
 * - Chat Completions: `max_tokens` becomes `max_completion_tokens` for models that reject
 *   `max_tokens`. Other models keep `max_tokens`, since older official models and many
 *   OpenAI-compatible proxies do not understand `max_completion_tokens`.
 * - Responses on the official OpenAI API: `max_output_tokens` below 16 is raised to 16.
 *
 * Returns the original request when nothing needs to change and never mutates it.
 */
export function applyOpenAiUpstreamCompat<T extends UpstreamRequest>(request: T): T {
  if ((request.bodyEncoding ?? "json") !== "json" || !isRecord(request.body)) {
    return request;
  }
  const url = parseUrl(request.url);
  if (!url) {
    return request;
  }
  const body = request.body;
  let next = body;
  if (/\/chat\/completions\/?$/.test(url.pathname)) {
    next = remapMaxTokens(body);
  } else if (/\/responses\/?$/.test(url.pathname) && isOfficialOpenAiUrl(url)) {
    next = floorResponsesMaxOutputTokens(body);
  }
  return next === body ? request : { ...request, body: next };
}

function remapMaxTokens(body: Record<string, unknown>): Record<string, unknown> {
  if (
    typeof body.model !== "string" ||
    !maxTokensRejectingModel.test(body.model.trim()) ||
    !isPositiveInteger(body.max_tokens)
  ) {
    return body;
  }
  const { max_tokens: maxTokens, ...rest } = body;
  return isPositiveInteger(rest.max_completion_tokens)
    ? rest
    : { ...rest, max_completion_tokens: maxTokens };
}

function floorResponsesMaxOutputTokens(body: Record<string, unknown>): Record<string, unknown> {
  const value = body.max_output_tokens;
  return isPositiveInteger(value) && value < responsesMinOutputTokens
    ? { ...body, max_output_tokens: responsesMinOutputTokens }
    : body;
}
