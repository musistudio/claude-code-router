import type { RouteRequest } from "@ccr/core/routing/contracts";

const maxLastUserTextChars = 16 * 1024;
const maxSystemTextChars = 8 * 1024;
const maxToolNames = 128;
type BodySnapshot = { json: string; body?: Record<string, unknown> };
const bodySnapshots = new WeakMap<RouteScriptInput, BodySnapshot>();

export type RouteScriptInput = {
  apiKeyId?: string;
  builtInSubagentModel?: string;
  body: Record<string, unknown>;
  headers: Record<string, string | string[]>;
  method: string;
  model?: string;
  profileId?: string;
  sessionId?: string;
  summary: {
    hasImage: boolean;
    lastUserText: string;
    messageCount: number;
    systemText: string;
    toolNames: string[];
  };
  tokenCount?: number;
  url: string;
};

export type BuildRouteScriptInputOptions = {
  deferTokenCount?: boolean;
  profileId?: string;
  tokenCount?: number;
};

export function buildRouteScriptInput(
  request: RouteRequest,
  options: BuildRouteScriptInputOptions = {}
): RouteScriptInput {
  const apiKeyId = readHeader(request.headers, "x-auth-api-key-id");
  const snapshot: BodySnapshot = { json: JSON.stringify(request.body) };
  const input: RouteScriptInput = {
    ...(apiKeyId ? { apiKeyId } : {}),
    ...(request.builtInSubagentModel ? { builtInSubagentModel: request.builtInSubagentModel } : {}),
    body: {},
    headers: requestHeaders(request.headers),
    method: request.method,
    ...(typeof request.body.model === "string" ? { model: request.body.model } : {}),
    ...(options.profileId ? { profileId: options.profileId } : {}),
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    summary: {
      hasImage: containsImage(request.body),
      lastUserText: truncateText(lastUserText(request.body.messages), maxLastUserTextChars),
      messageCount: Array.isArray(request.body.messages) ? request.body.messages.length : 0,
      systemText: truncateText(textFromUnknown(request.body.system), maxSystemTextChars),
      toolNames: toolNames(request.body.tools).slice(0, maxToolNames)
    },
    tokenCount: options.deferTokenCount ? options.tokenCount : request.tokenCount ?? 0,
    url: request.url
  };
  // Retain an immutable JSON snapshot for transport, without parsing and then
  // cloning the entire conversation again on the host's main thread.
  bodySnapshots.set(input, snapshot);
  Object.defineProperty(input, "body", {
    configurable: true,
    enumerable: true,
    get: () => snapshot.body ??= JSON.parse(snapshot.json) as Record<string, unknown>,
    set: (body: Record<string, unknown>) => { snapshot.body = body; }
  });
  return input;
}

export function serializeRouteScriptInput(input: RouteScriptInput): string {
  const snapshot = bodySnapshots.get(input);
  if (!snapshot) return JSON.stringify(input);
  const metadata: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (key !== "body") metadata[key] = input[key as keyof RouteScriptInput];
  }
  const bodyJson = snapshot.body ? JSON.stringify(snapshot.body) : snapshot.json;
  return `${JSON.stringify(metadata).slice(0, -1)},"body":${bodyJson}}`;
}

function requestHeaders(headers: RouteRequest["headers"]): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, rawValue] of Object.entries(headers)) {
    if (Array.isArray(rawValue)) result[name] = [...rawValue];
    else if (typeof rawValue === "string") result[name] = rawValue;
  }
  return result;
}

function readHeader(headers: RouteRequest["headers"], name: string): string | undefined {
  const normalized = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized)?.[1];
  return Array.isArray(entry) ? entry[0] : entry;
}

function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isRecord(message) && message.role === "user") return textFromUnknown(message.content);
  }
  return "";
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return "";
}

function toolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tool) => {
    if (!isRecord(tool)) return [];
    const fn = isRecord(tool.function) ? tool.function : undefined;
    const name = typeof tool.name === "string" ? tool.name : typeof fn?.name === "string" ? fn.name : undefined;
    return name ? [name] : [];
  });
}

function containsImage(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.some((item) => containsImage(item, depth + 1));
  if (!isRecord(value)) return false;
  const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
  if (type.includes("image")) return true;
  const mediaType = typeof value.media_type === "string" ? value.media_type.toLowerCase() : "";
  if (mediaType.startsWith("image/")) return true;
  return Object.values(value).some((item) => containsImage(item, depth + 1));
}

function truncateText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
