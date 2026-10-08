import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  isRecord,
  providerNamePlaceholder,
  providerNameSlugPlaceholder,
  readString
} from "@ccr/core/agents/local-providers/shared";

/**
 * Free-tier client fingerprint for login-less ("public") OpenCode Zen imports.
 *
 * Zen serves zero-cost models to anonymous callers only when the request looks
 * like it comes from the official OpenCode client: the User-Agent must carry
 * the `opencode/` prefix, the `x-opencode-session` / `x-opencode-request`
 * headers must be well-formed client IDs with a fresh embedded timestamp, the
 * request must stream, and the declared tools must include OpenCode's own
 * `bash` and `read` (other tools may be declared alongside them). Anything
 * else is rejected with `403 FreeTierError: "OpenCode's free tier can only be
 * used from within OpenCode"`.
 *
 * The ID layout mirrors the open-source OpenCode ID generator
 * (`ses_` descending, `msg_` ascending: 12 hex chars of
 * `(timestampMs * 0x1000 + counter)` over 48 bits, plus 14 random base62
 * chars). There is no shared secret involved, so CCR can mint equally valid
 * IDs per request. If Zen ever hardens this gate (it already did once),
 * public imports stop working and the supported fallback is a logged-in Zen
 * API key.
 *
 * These headers never touch authentication: the provider keeps `apiKey:
 * "public"` and the hook below only sets client-identification headers.
 */
export const OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX = "opencode-public-freetier";

export const OPENCODE_PUBLIC_FREETIER_USER_AGENT_FALLBACK = "opencode/1.18.31";

const OPENCODE_CLIENT = "cli";
const OPENCODE_ID_TIME_BYTES = 6;
const OPENCODE_ID_TIME_HEX_LENGTH = OPENCODE_ID_TIME_BYTES * 2;
const OPENCODE_ID_RANDOM_LENGTH = 14;
const OPENCODE_ID_SUFFIX_LENGTH = OPENCODE_ID_TIME_HEX_LENGTH + OPENCODE_ID_RANDOM_LENGTH;
const OPENCODE_ID_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const OPENCODE_FREETIER_REQUIRED_TOOL_NAMES = ["bash", "read"];
const OPENCODE_FREETIER_PLACEHOLDER_TOOL_DESCRIPTION = "Unavailable in this client. Never call this tool; use the other tools instead.";
const OPENCODE_FREETIER_PLACEHOLDER_TOOL_PARAMETERS = { properties: {}, type: "object" };

let freetierIdCounter = 0;
let freetierIdLastTimestamp = 0;
let cachedUserAgent: string | undefined;

export function isOpenCodePublicFreeTierPlugin(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const key = readString(value.key)?.toLowerCase();
  return Boolean(key?.startsWith("ccr-local-agent-") && key.includes(OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX));
}

export function openCodePublicFreeTierPlugin(providerName = providerNamePlaceholder, keySuffix = ""): Record<string, unknown> {
  return {
    key: `ccr-local-agent-${providerNameSlugPlaceholder}-${OPENCODE_PUBLIC_FREETIER_PLUGIN_SUFFIX}${keySuffix}`,
    providerName,
    // The gateway drops provider plugins without an auth/request/response
    // section before handing the config to runtime hooks, so a bare marker
    // would never reach the free-tier hook.
    request: {
      headers: { "x-opencode-client": OPENCODE_CLIENT }
    }
  };
}

export function mintOpenCodeSessionId(timestamp = Date.now()): string {
  return formatOpenCodeId("ses", "descending", timestamp, nextFreeTierCounter(timestamp), randomOpenCodeIdPart());
}

export function mintOpenCodeRequestId(timestamp = Date.now()): string {
  return formatOpenCodeId("msg", "ascending", timestamp, nextFreeTierCounter(timestamp), randomOpenCodeIdPart());
}

export function formatOpenCodeId(
  prefix: string,
  direction: "ascending" | "descending",
  timestampMs: number,
  counter: number,
  randomPart: string
): string {
  const mask = (1n << BigInt(OPENCODE_ID_TIME_BYTES * 8)) - 1n;
  let now = BigInt(Math.trunc(timestampMs)) * 0x1000n + BigInt(Math.trunc(counter));
  now = direction === "descending" ? ~now & mask : now & mask;
  return `${prefix}_${now.toString(16).padStart(OPENCODE_ID_TIME_HEX_LENGTH, "0")}${randomPart}`;
}

/**
 * Extracts the embedded millisecond timestamp from an ascending (`msg_`) or
 * descending (`ses_`) client ID. The 48-bit time field wraps roughly every 2.2
 * years, so callers must compare against the same wrap window.
 */
export function openCodeIdTimestampMs(id: string): number | undefined {
  const separator = id.indexOf("_");
  if (separator <= 0) {
    return undefined;
  }
  const suffix = id.slice(separator + 1);
  if (suffix.length !== OPENCODE_ID_SUFFIX_LENGTH || !/^[0-9A-Za-z]{26}$/.test(suffix)) {
    return undefined;
  }
  const hex = suffix.slice(0, OPENCODE_ID_TIME_HEX_LENGTH);
  if (!/^[0-9a-f]{12}$/.test(hex)) {
    return undefined;
  }
  const mask = (1n << BigInt(OPENCODE_ID_TIME_BYTES * 8)) - 1n;
  const encoded = BigInt(`0x${hex}`);
  const timestamp = id.slice(0, separator) === "ses" ? (~encoded & mask) / 0x1000n : encoded / 0x1000n;
  return Number(timestamp);
}

export function openCodePublicFreeTierHeaders(): Record<string, string> {
  return {
    "user-agent": openCodePublicFreeTierUserAgent(),
    "x-opencode-client": OPENCODE_CLIENT,
    "x-opencode-request": mintOpenCodeRequestId(),
    "x-opencode-session": mintOpenCodeSessionId()
  };
}

export function applyOpenCodePublicFreeTierHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const next: Record<string, string> = { ...(headers ?? {}) };
  for (const [name, value] of Object.entries(openCodePublicFreeTierHeaders())) {
    for (const key of Object.keys(next)) {
      if (key.toLowerCase() === name) {
        delete next[key];
      }
    }
    next[name] = value;
  }
  return next;
}

export function withOpenCodePublicFreeTierTools(body: unknown, upstreamUrl: string): unknown {
  if (!isRecord(body)) {
    return body;
  }
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const declaredNames = new Set(tools.map(declaredToolName));
  const missingNames = OPENCODE_FREETIER_REQUIRED_TOOL_NAMES.filter((name) => !declaredNames.has(name));
  if (missingNames.length === 0) {
    return body;
  }
  const placeholderTool = isResponsesEndpoint(upstreamUrl) ? responsesPlaceholderTool : chatCompletionsPlaceholderTool;
  return { ...body, tools: [...tools, ...missingNames.map(placeholderTool)] };
}

export function openCodePublicFreeTierUserAgent(): string {
  const override = process.env.CCR_OPENCODE_USER_AGENT?.trim();
  if (override) {
    return override;
  }
  if (cachedUserAgent) {
    return cachedUserAgent;
  }
  cachedUserAgent = readInstalledOpenCodeUserAgent() ?? OPENCODE_PUBLIC_FREETIER_USER_AGENT_FALLBACK;
  return cachedUserAgent;
}

export function resetOpenCodePublicFreeTierState(): void {
  freetierIdCounter = 0;
  freetierIdLastTimestamp = 0;
  cachedUserAgent = undefined;
}

function nextFreeTierCounter(timestamp: number): number {
  if (timestamp !== freetierIdLastTimestamp) {
    freetierIdLastTimestamp = timestamp;
    freetierIdCounter = 0;
  }
  freetierIdCounter += 1;
  return freetierIdCounter;
}

function declaredToolName(tool: unknown): string | undefined {
  if (!isRecord(tool)) {
    return undefined;
  }
  return readString(tool.name) ?? (isRecord(tool.function) ? readString(tool.function.name) : undefined);
}

function isResponsesEndpoint(upstreamUrl: string): boolean {
  try {
    return new URL(upstreamUrl).pathname.replace(/\/+$/, "").endsWith("/responses");
  } catch {
    return false;
  }
}

function responsesPlaceholderTool(name: string): Record<string, unknown> {
  return {
    description: OPENCODE_FREETIER_PLACEHOLDER_TOOL_DESCRIPTION,
    name,
    parameters: OPENCODE_FREETIER_PLACEHOLDER_TOOL_PARAMETERS,
    type: "function"
  };
}

function chatCompletionsPlaceholderTool(name: string): Record<string, unknown> {
  return {
    function: {
      description: OPENCODE_FREETIER_PLACEHOLDER_TOOL_DESCRIPTION,
      name,
      parameters: OPENCODE_FREETIER_PLACEHOLDER_TOOL_PARAMETERS
    },
    type: "function"
  };
}

function randomOpenCodeIdPart(): string {
  const bytes = randomBytes(OPENCODE_ID_RANDOM_LENGTH);
  let result = "";
  for (let index = 0; index < OPENCODE_ID_RANDOM_LENGTH; index += 1) {
    result += OPENCODE_ID_BASE62[bytes[index] % OPENCODE_ID_BASE62.length];
  }
  return result;
}

function readInstalledOpenCodeUserAgent(): string | undefined {
  try {
    const output = execFileSync("opencode", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    }).trim();
    const version = output.match(/\d+\.\d+\.\d+/)?.[0];
    return version ? `opencode/${version}` : undefined;
  } catch {
    // The CCR host may not have the OpenCode CLI installed; callers fall back
    // to a pinned recent client version instead of failing the request.
    return undefined;
  }
}
