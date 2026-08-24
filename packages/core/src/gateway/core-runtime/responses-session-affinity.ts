import { isRecord, stringValue } from "@ccr/core/gateway/internal/value";

type HeaderValue = string | string[] | undefined;

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  headers?: Record<string, string>;
  method?: string;
  url: string;
};

export type ResponsesSessionAffinityInput = {
  request?: {
    body?: unknown;
    headers?: Record<string, HeaderValue>;
  };
  targetProviderConfig?: {
    baseurl?: string;
    name?: string;
    type?: string;
  };
  upstreamRequest: UpstreamRequest;
};

const sessionIdHeaderNames = ["x-claude-code-session-id", "x-claude-session-id"];
const codexUpstreamUrlMarkers = ["chatgpt.com/backend-api/codex", "/backend-api/codex"];

/**
 * Copies the Claude Code session identity onto outbound OpenAI Responses
 * bodies. The protocol conversion emits neither `prompt_cache_key` nor
 * `metadata.user_id`, so multi-channel Responses upstreams that pin sessions
 * on body fields hash each turn onto a different channel and the next hop
 * rejects channel-bound `encrypted_content` continuations. A caller-supplied
 * non-empty `prompt_cache_key` always wins; other protocols and non-JSON
 * bodies pass through untouched. Codex upstreams reject unknown body fields
 * with `400 Unsupported parameter`, so affinity is skipped for them.
 */
export function applyResponsesSessionAffinity(input: ResponsesSessionAffinityInput): UpstreamRequest {
  const upstreamRequest = input.upstreamRequest;
  const providerType = input.targetProviderConfig?.type?.trim().toLowerCase();
  if (providerType !== "openai_responses") {
    return upstreamRequest;
  }
  if (isCodexResponsesUpstream(upstreamRequest.url, input.targetProviderConfig)) {
    return upstreamRequest;
  }
  const body = upstreamRequest.body;
  if ((upstreamRequest.bodyEncoding ?? "json") !== "json" || !isRecord(body)) {
    return upstreamRequest;
  }

  const inboundUserId = inboundMetadataUserId(input.request?.body);
  const changes: Record<string, unknown> = {};
  if (!stringValue(body.prompt_cache_key)) {
    const sessionKey = resolveResponsesSessionKey(input.request?.headers, inboundUserId);
    if (sessionKey) {
      changes.prompt_cache_key = sessionKey;
    }
  }
  if (inboundUserId && body.metadata === undefined) {
    changes.metadata = { user_id: inboundUserId };
  }
  if (Object.keys(changes).length === 0) {
    return upstreamRequest;
  }
  return {
    ...upstreamRequest,
    body: { ...body, ...changes }
  };
}

/**
 * First non-empty of the Claude Code session headers (case-insensitive),
 * falling back to the inbound Anthropic `metadata.user_id`.
 */
export function resolveResponsesSessionKey(
  headers: Record<string, HeaderValue> | undefined,
  inboundUserId: string | undefined
): string | undefined {
  for (const name of sessionIdHeaderNames) {
    const value = readHeaderValue(headers, name);
    if (value) {
      return value;
    }
  }
  return inboundUserId;
}

/**
 * Codex backend detection: the outbound URL is authoritative (it carries the
 * final rewritten base), with the configured provider base URL as a fallback
 * for requests that bypass URL rewriting.
 */
export function isCodexResponsesUpstream(
  upstreamUrl: string,
  providerConfig?: { baseurl?: string }
): boolean {
  const candidates = [upstreamUrl, providerConfig?.baseurl];
  return candidates.some((candidate) => {
    const normalized = candidate?.trim().toLowerCase();
    return Boolean(normalized && codexUpstreamUrlMarkers.some((marker) => normalized.includes(marker)));
  });
}

function inboundMetadataUserId(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.metadata)) {
    return undefined;
  }
  return stringValue(body.metadata.user_id);
}

function readHeaderValue(headers: Record<string, HeaderValue> | undefined, name: string): string | undefined {
  for (const [headerName, headerValue] of Object.entries(headers ?? {})) {
    if (headerName.trim().toLowerCase() !== name) {
      continue;
    }
    const values = Array.isArray(headerValue) ? headerValue : [headerValue];
    for (const value of values) {
      const normalized = stringValue(value);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}
