import { isRecord } from "@ccr/core/gateway/internal/value";
import { requestProtocolForPath } from "@ccr/core/routing/protocol-endpoints";

export const claudeCodeBillingSystemHeaderPrefix = "x-anthropic-billing-header:";
const claudeCodeBillingKeyPattern = /^(?:cc_[a-z0-9_]+|cch)$/i;
const billingSegmentKeyPattern = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const trailingSubagentModelTagPattern = /^<CCR-SUBAGENT-MODEL>[\s\S]*<\/CCR-SUBAGENT-MODEL>$/;

type ParsedClaudeCodeBillingPayload =
  | { kind: "json"; record: Record<string, unknown> }
  | { kind: "kv"; entries: { key: string; value: string }[] };

export function isAnthropicMessagesRequestPath(urlValue: string | undefined): boolean {
  if (!urlValue) {
    return false;
  }
  try {
    const pathname = new URL(urlValue, "http://localhost").pathname.replace(/\/+$/, "") || "/";
    return requestProtocolForPath(pathname) === "anthropic_messages";
  } catch {
    return false;
  }
}

export function billingSystemBlockText(block: unknown): string | undefined {
  if (typeof block === "string") {
    return block;
  }
  if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
    return block.text;
  }
  return undefined;
}

function hasClaudeCodeBillingKey(keys: readonly string[]): boolean {
  return keys.some((key) => claudeCodeBillingKeyPattern.test(key));
}

function parseLeadingJsonRecord(text: string): { record: Record<string, unknown>; rest: string } | undefined {
  if (!text.startsWith("{")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? { record: parsed, rest: "" } : undefined;
  } catch {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
      const ch = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }
      if (ch === "\"") {
        inString = true;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(0, index + 1)) as unknown;
            if (!isRecord(parsed)) {
              return undefined;
            }
            return { record: parsed, rest: text.slice(index + 1) };
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  }
}

function parseClaudeCodeBillingPayload(payload: string): ParsedClaudeCodeBillingPayload | undefined {
  const trimmed = payload.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("{")) {
    const parsed = parseLeadingJsonRecord(trimmed);
    if (!parsed || !hasClaudeCodeBillingKey(Object.keys(parsed.record))) {
      return undefined;
    }
    const rest = parsed.rest.trim();
    if (rest !== "" && !trailingSubagentModelTagPattern.test(rest)) {
      return undefined;
    }
    return { kind: "json", record: parsed.record };
  }
  if (/[\r\n]/.test(trimmed)) {
    return undefined;
  }
  const parts = trimmed
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  const entries: { key: string; value: string }[] = [];
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      return undefined;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!billingSegmentKeyPattern.test(key)) {
      return undefined;
    }
    entries.push({ key, value });
  }
  if (!hasClaudeCodeBillingKey(entries.map((entry) => entry.key))) {
    return undefined;
  }
  return { kind: "kv", entries };
}

export function isClaudeCodeBillingSystemBlock(block: unknown): boolean {
  const text = billingSystemBlockText(block);
  if (typeof text !== "string" || !text.startsWith(claudeCodeBillingSystemHeaderPrefix)) {
    return false;
  }
  return parseClaudeCodeBillingPayload(text.slice(claudeCodeBillingSystemHeaderPrefix.length)) !== undefined;
}

export function claudeCodeBillingMetadataIsSubagent(text: string): boolean {
  if (!text.startsWith(claudeCodeBillingSystemHeaderPrefix)) {
    return false;
  }
  const parsed = parseClaudeCodeBillingPayload(text.slice(claudeCodeBillingSystemHeaderPrefix.length));
  if (!parsed) {
    return false;
  }
  if (parsed.kind === "json") {
    return parsed.record.cc_is_subagent === true;
  }
  const values = parsed.entries
    .filter((entry) => entry.key === "cc_is_subagent")
    .map((entry) => entry.value);
  return values.length === 1 && values[0] === "true";
}

export function isClaudeCodeBillingSubagentBlock(block: unknown): boolean {
  const text = billingSystemBlockText(block);
  return typeof text === "string" && claudeCodeBillingMetadataIsSubagent(text);
}

export function detachClaudeCodeBillingSystemBlock(
  body: Record<string, unknown>
): { block: unknown; body: Record<string, unknown> } | undefined {
  const system = body.system;
  if (!Array.isArray(system) || system.length === 0 || !isClaudeCodeBillingSystemBlock(system[0])) {
    return undefined;
  }
  const [block, ...rest] = system;
  const nextBody: Record<string, unknown> = { ...body };
  if (rest.length === 0) {
    delete nextBody.system;
  } else {
    nextBody.system = rest;
  }
  return { block, body: nextBody };
}

export function prependClaudeCodeBillingSystemBlock(
  system: unknown,
  block: unknown
): unknown[] {
  if (Array.isArray(system)) {
    return [block, ...system];
  }
  if (typeof system === "string") {
    return system.length > 0 ? [block, { text: system, type: "text" }] : [block];
  }
  return [block];
}

export function isOfficialAnthropicMessagesTarget(
  upstreamUrl: string | undefined,
  targetProviderConfig?: { type?: string }
): boolean {
  const providerType = targetProviderConfig?.type?.trim().toLowerCase();
  if (providerType && providerType !== "anthropic_messages" && providerType !== "anthropic") {
    return false;
  }
  if (!upstreamUrl) {
    return false;
  }
  try {
    const url = new URL(upstreamUrl);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "api.anthropic.com" &&
      (url.port === "" || url.port === "443") &&
      /^\/v1\/messages\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function restoreClaudeCodeBillingSystemBlock(
  upstreamBody: unknown,
  block: unknown,
  bodyEncoding?: string
): unknown {
  if (bodyEncoding && bodyEncoding !== "json") {
    return upstreamBody;
  }
  let parsed: unknown;
  let wireKind: "buffer" | "object" | "string";
  if (typeof upstreamBody === "string") {
    try {
      parsed = JSON.parse(upstreamBody);
    } catch {
      return upstreamBody;
    }
    wireKind = "string";
  } else if (Buffer.isBuffer(upstreamBody) || upstreamBody instanceof Uint8Array) {
    try {
      parsed = JSON.parse(Buffer.from(upstreamBody).toString("utf8"));
    } catch {
      return upstreamBody;
    }
    wireKind = "buffer";
  } else if (isRecord(upstreamBody)) {
    parsed = upstreamBody;
    wireKind = "object";
  } else {
    return upstreamBody;
  }

  if (!isRecord(parsed)) {
    return upstreamBody;
  }

  const nextBody = {
    ...parsed,
    system: prependClaudeCodeBillingSystemBlock(parsed.system, block)
  };
  if (wireKind === "string") {
    return JSON.stringify(nextBody);
  }
  if (wireKind === "buffer") {
    return Buffer.from(JSON.stringify(nextBody));
  }
  return nextBody;
}
