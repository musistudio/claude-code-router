/**
 * Aggregate-error detail enrichment.
 *
 * When every provider attempt fails, the core gateway responds with an
 * aggregate error whose per-attempt root causes (stage, status, message per
 * provider/credential) are kept in `error.attempts`. Most clients — including
 * Claude Code — only render `error.message`, so the actual failure reason
 * ("429 Throttling", "403 Model access denied", ...) stays invisible behind
 * the generic "All target providers failed." line.
 *
 * The helpers here append a compact per-attempt summary to `error.message` so
 * single-field clients can surface the root cause directly. An attempt's own
 * `message` is often itself a generic wrapper ("Upstream request failed.");
 * the real upstream cause then lives in `error.attempts[].details` — either as
 * structured fields (`message` + `code`/`type`, Anthropic-style) or as an SSE
 * error frame (`details.raw`, provider-style). When the attempt message is
 * generic, the summary falls back to extracting the cause from `details`.
 */

const attemptMessageLimit = 200;
const attemptCountLimit = 8;
const attemptSummarySpacing = " | ";

const genericAttemptMessages = new Set(["upstream request failed", "upstream request failed."]);

export type AggregateErrorAttempt = {
  details?: unknown;
  message?: unknown;
  stage?: unknown;
  status?: unknown;
};

type AggregateErrorPayload = {
  error?: {
    attempts?: unknown;
    message?: unknown;
  };
};

export const maxAggregateErrorDetailBodyBytes = 262_144;

/**
 * Returns the enriched JSON text for an aggregate error payload, or undefined
 * when the payload is not enrichable (not JSON, no `error.attempts`, nothing
 * new to add). The payload object is copied; the input is never mutated.
 */
export function appendAggregateErrorAttemptSummary(text: string): string | undefined {
  let payload: AggregateErrorPayload;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    payload = parsed as AggregateErrorPayload;
  } catch {
    return undefined;
  }

  const error = payload.error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return undefined;
  }
  if (typeof error.message !== "string" || !Array.isArray(error.attempts) || error.attempts.length === 0) {
    return undefined;
  }

  const summary = formatAttemptSummaries(error.attempts);
  if (!summary || error.message.endsWith(summary)) {
    return undefined;
  }

  const enriched: AggregateErrorPayload = { ...payload, error: { ...error, message: `${error.message} ${summary}` } };
  return `${JSON.stringify(enriched)}\n`;
}

function formatAttemptSummaries(attempts: unknown[]): string | undefined {
  const summaries: string[] = [];
  for (const attempt of attempts.slice(0, attemptCountLimit)) {
    if (typeof attempt !== "object" || attempt === null) {
      continue;
    }
    const record = attempt as AggregateErrorAttempt;
    const summary = formatAttemptSummary(record);
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries.length > 0 ? summaries.join(attemptSummarySpacing) : undefined;
}

function formatAttemptSummary(attempt: AggregateErrorAttempt): string | undefined {
  const stage = primitiveLabel(attempt.stage);
  const status = primitiveLabel(attempt.status);
  const message = attemptSummaryMessage(attempt);
  if (!stage && !status && !message) {
    return undefined;
  }
  const label = [stage, status].filter(Boolean).join("|");
  return label ? `[${label}] ${message ?? ""}`.trim() : (message ?? "");
}

/**
 * The message rendered for one attempt: the attempt's own message unless it is
 * a generic wrapper, in which case the upstream cause is extracted from
 * `attempt.details` (structured fields or an SSE error frame) when available.
 */
function attemptSummaryMessage(attempt: AggregateErrorAttempt): string | undefined {
  const message = typeof attempt.message === "string" && attempt.message.trim()
    ? attempt.message.trim().slice(0, attemptMessageLimit)
    : undefined;
  if (message && !isGenericAttemptMessage(message)) {
    return message;
  }
  const detailed = extractAttemptDetailMessage(attempt.details);
  return detailed ?? message;
}

function isGenericAttemptMessage(message: string): boolean {
  return genericAttemptMessages.has(message.trim().toLowerCase());
}

function extractAttemptDetailMessage(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return undefined;
  }
  const record = details as Record<string, unknown>;
  const direct = describeDetailError(record);
  if (direct) {
    return direct;
  }
  const raw = record.raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = parseSseErrorPayload(raw);
    const fromStream = parsed ? describeDetailError(parsed) : undefined;
    return fromStream ?? raw.trim().slice(0, attemptMessageLimit);
  }
  return undefined;
}

function describeDetailError(record: Record<string, unknown>): string | undefined {
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const code = primitiveLabel(record.code) ?? primitiveLabel(record.type);
  if (message && code) {
    return `${code}: ${message}`.slice(0, attemptMessageLimit);
  }
  if (message) {
    return message.slice(0, attemptMessageLimit);
  }
  return code;
}

function parseSseErrorPayload(raw: string): Record<string, unknown> | undefined {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const body = trimmed.slice("data:".length).trim();
    if (!body || body === "[DONE]") {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function primitiveLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/**
 * Whether an upstream error response is safe to buffer for enrichment:
 * declared JSON and a bounded content length. Streaming continues untouched
 * for anything else (no content length, oversized, SSE, ...).
 */
export function shouldBufferAggregateErrorBody(responseHeaders: Headers): boolean {
  const contentType = responseHeaders.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return false;
  }
  const contentLength = Number(responseHeaders.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > 0 && contentLength <= maxAggregateErrorDetailBodyBytes;
}
