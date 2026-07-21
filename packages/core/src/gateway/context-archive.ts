import packageJson from "../../package.json";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { CONTEXT_ARCHIVE_DB_FILE } from "@ccr/core/config/constants";
import type {
  AppConfig,
  ContextArchiveConfig,
  GatewayMcpServerConfig,
  GatewayProviderProtocol
} from "@ccr/core/contracts/app";
import {
  appendArchiveTask,
  appendArchiveFooterToResponse,
  archiveHandoffFooter,
  archiveResponseRequiresTool,
  compactHandoffTask,
  extractArchiveAssistantText,
  hasExplicitCompactSignal,
  historyReplayTask,
  parseArchiveBody,
  replayableArchiveProtocols
} from "@ccr/core/gateway/context-archive/protocol";
import {
  ContextArchiveStore,
  type ArchiveRoute,
  type ArchiveSnapshot
} from "@ccr/core/gateway/context-archive/store";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | { id: null | number | string; jsonrpc: "2.0"; result: JsonValue }
  | { error: { code: number; data?: JsonValue; message: string }; id: null | number | string; jsonrpc: "2.0" };

type McpTool = {
  description: string;
  inputSchema: JsonValue;
  name: string;
};

export type ContextArchiveRecord = {
  archiveId: string;
  footer: string;
  generation: number;
  sessionId: string;
};

type ContextArchivePreparation = {
  body: Buffer;
  diagnostic: string;
  record: ContextArchiveRecord;
};

export type ContextArchiveReplayInput = {
  body: Buffer;
  signal: AbortSignal;
  snapshot: ArchiveSnapshot;
};

export type ContextArchiveReplayResult = {
  body: Buffer | string;
  contentType?: string;
  statusCode: number;
};

export type ContextArchiveReplayExecutor = (
  input: ContextArchiveReplayInput
) => Promise<ContextArchiveReplayResult>;

export type ContextArchiveAskOutput = {
  answer: string;
  archiveId: string;
  generation: number;
  task: string;
};

const protocolVersion = "2024-11-05";
const maxMcpRequestBytes = 2 * 1024 * 1024;
const defaultToolName = "ccr_history_ask";
const maxUpstreamErrorCharacters = 4000;

export const CONTEXT_ARCHIVE_MCP_SERVER_NAME = "ccr-context-archive";
export const CONTEXT_ARCHIVE_MCP_PATH = "/__ccr/context-archive/mcp";

export class ContextArchiveService {
  private readonly stores = new Map<string, ContextArchiveStore>();

  clear(config?: ContextArchiveConfig): void {
    if (config) {
      this.store(config).clear();
      return;
    }
    for (const store of this.stores.values()) {
      store.clear();
    }
  }

  close(): void {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }

  createSnapshot(input: {
    body: Buffer;
    config: ContextArchiveConfig;
    headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
    method: string;
    path: string;
    protocol: GatewayProviderProtocol;
    requestId: string;
    sessionId: string;
  }): { record: ContextArchiveRecord; sessionToken: string } {
    const maxSnapshotBytes = clampInteger(input.config.maxSnapshotBytes, 64 * 1024, 1024 * 1024 * 1024, 32 * 1024 * 1024);
    if (input.body.byteLength > maxSnapshotBytes) {
      throw contextArchiveError(
        "ARCHIVE_SNAPSHOT_TOO_LARGE",
        `Compact request is ${input.body.byteLength} bytes; the configured snapshot limit is ${maxSnapshotBytes} bytes.`
      );
    }

    const archiveId = `arc_${randomBytes(18).toString("base64url")}`;
    const sessionToken = randomBytes(32).toString("base64url");
    const createdAt = Date.now();
    const retentionDays = clampInteger(input.config.retentionDays, 1, 3650, 30);
    const snapshot = this.store(input.config).create({
      archiveId,
      body: Buffer.from(input.body),
      bodySha256: sha256(input.body),
      createdAt,
      expiresAt: createdAt + retentionDays * 24 * 60 * 60 * 1000,
      method: input.method,
      path: input.path,
      protocol: input.protocol,
      replayHeaders: replaySafeHeaders(input.headers),
      requestId: input.requestId,
      sessionId: input.sessionId,
      tokenHash: sha256(sessionToken)
    }, {
      maxBytes: clampInteger(input.config.maxBytes, 1024 * 1024, 64 * 1024 * 1024 * 1024, 512 * 1024 * 1024),
      maxSnapshots: clampInteger(input.config.maxSnapshots, 1, 100000, 200),
      retentionDays
    });
    const footer = archiveHandoffFooter({
      archiveId,
      generation: snapshot.generation,
      sessionId: input.sessionId,
      sessionToken,
      toolName: input.config.toolName || defaultToolName
    });
    return {
      record: {
        archiveId,
        footer,
        generation: snapshot.generation,
        sessionId: input.sessionId
      },
      sessionToken
    };
  }

  finalize(record: ContextArchiveRecord | undefined, route: ArchiveRoute, config: ContextArchiveConfig): void {
    if (!record) {
      return;
    }
    this.store(config).finalize(record.archiveId, route);
  }

  fail(record: ContextArchiveRecord | undefined, config: ContextArchiveConfig): void {
    if (!record) {
      return;
    }
    this.store(config).fail(record.archiveId);
  }

  getSnapshot(archiveId: string, config: ContextArchiveConfig): ArchiveSnapshot | undefined {
    return this.store(config).get(archiveId);
  }

  async ask(input: {
    archiveId: string;
    sessionToken: string;
    task: string;
  }, config: ContextArchiveConfig, executor?: ContextArchiveReplayExecutor): Promise<ContextArchiveAskOutput> {
    const archiveId = input.archiveId.trim();
    const sessionToken = input.sessionToken.trim();
    const task = input.task.trim();
    const toolName = config.toolName || defaultToolName;
    if (!archiveId || !sessionToken || !task) {
      throw contextArchiveError("ARCHIVE_INVALID_ARGUMENT", `${toolName} requires archive_id, session_token, and task.`);
    }

    const snapshot = this.store(config).get(archiveId);
    if (!snapshot) {
      throw contextArchiveError("ARCHIVE_NOT_FOUND", `Archive ${archiveId} does not exist or has expired.`);
    }
    if (snapshot.expiresAt !== undefined && snapshot.expiresAt <= Date.now()) {
      throw contextArchiveError("ARCHIVE_EXPIRED", `Archive ${archiveId} has expired.`);
    }
    if (snapshot.status !== "ready") {
      throw contextArchiveError("ARCHIVE_NOT_READY", `Archive ${archiveId} is ${snapshot.status}.`);
    }
    if (!constantTimeEqual(snapshot.tokenHash, sha256(sessionToken))) {
      throw contextArchiveError("ARCHIVE_ACCESS_DENIED", "The archive session token is invalid.");
    }
    if (!executor) {
      throw contextArchiveError("ARCHIVE_REPLAY_UNAVAILABLE", "The gateway replay executor is not available.");
    }

    const replayBody = appendArchiveTask(snapshot.body, snapshot.protocol, historyReplayTask(task));
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(contextArchiveError("ARCHIVE_REPLAY_TIMEOUT", "The archived agent replay timed out.")),
      clampInteger(config.replayTimeoutMs, 1000, 600000, 60000)
    );
    let result: ContextArchiveReplayResult;
    try {
      result = await executor({ body: replayBody, signal: controller.signal, snapshot });
    } finally {
      clearTimeout(timeout);
    }

    const rawText = Buffer.isBuffer(result.body) ? result.body.toString("utf8") : result.body;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw contextArchiveError(
        "ARCHIVE_UPSTREAM_ERROR",
        `Archived agent returned HTTP ${result.statusCode}: ${rawText.slice(0, maxUpstreamErrorCharacters)}`
      );
    }
    const answer = extractArchiveAssistantText(rawText, snapshot.protocol, result.contentType);
    if (!answer && archiveResponseRequiresTool(rawText)) {
      throw contextArchiveError(
        "ARCHIVE_REPLAY_TOOL_REQUIRED",
        "The archived agent requested a tool. Exact replay does not execute external client tools."
      );
    }
    if (!answer) {
      throw contextArchiveError("ARCHIVE_EMPTY_ANSWER", "The archived agent returned no textual answer.");
    }
    return {
      answer,
      archiveId,
      generation: snapshot.generation,
      task
    };
  }

  private store(config: ContextArchiveConfig): ContextArchiveStore {
    const dbFile = config.storagePath.trim() || CONTEXT_ARCHIVE_DB_FILE;
    let store = this.stores.get(dbFile);
    if (!store) {
      store = new ContextArchiveStore(dbFile);
      this.stores.set(dbFile, store);
    }
    return store;
  }
}

export const contextArchiveService = new ContextArchiveService();

export function contextArchiveEnabled(config: AppConfig | undefined): boolean {
  return Boolean(config?.contextArchive?.enabled);
}

export function contextArchiveMcpEnabled(config: AppConfig | undefined): boolean {
  return Boolean(config?.contextArchive?.enabled && config.contextArchive.mcpEnabled !== false);
}

export function contextArchiveMcpServer(
  config: AppConfig,
  gatewayEndpoint: string,
  apiKey?: string
): GatewayMcpServerConfig | undefined {
  if (!contextArchiveMcpEnabled(config)) {
    return undefined;
  }
  return {
    apiKey,
    headers: {},
    name: CONTEXT_ARCHIVE_MCP_SERVER_NAME,
    protocolVersion,
    requestTimeoutMs: config.contextArchive.replayTimeoutMs,
    startupTimeoutMs: 10000,
    transport: "streamable-http",
    url: `${gatewayEndpoint.replace(/\/+$/g, "")}${CONTEXT_ARCHIVE_MCP_PATH}`
  };
}

export function isContextArchiveMcpPath(path: string): boolean {
  return path === CONTEXT_ARCHIVE_MCP_PATH || path === `${CONTEXT_ARCHIVE_MCP_PATH}/`;
}

export async function prepareContextArchiveRequest(input: {
  body: Buffer | undefined;
  config: AppConfig;
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  protocol?: GatewayProviderProtocol;
  requestId: string;
}): Promise<ContextArchivePreparation | undefined> {
  if (!contextArchiveEnabled(input.config) || input.method.toUpperCase() !== "POST") {
    return undefined;
  }
  const protocol = input.protocol;
  if (!protocol || !replayableArchiveProtocols.includes(protocol)) {
    return undefined;
  }
  const parsedBody = parseArchiveBody(input.body);
  if (!parsedBody || !hasExplicitCompactSignal(parsedBody, input.headers as Record<string, string | string[] | undefined>)) {
    return undefined;
  }
  const originalBody = Buffer.from(input.body ?? Buffer.alloc(0));
  const sessionId = resolveArchiveSessionId(parsedBody, input.headers, input.requestId);
  const created = contextArchiveService.createSnapshot({
    body: originalBody,
    config: input.config.contextArchive,
    headers: input.headers,
    method: input.method,
    path: input.path,
    protocol,
    requestId: input.requestId,
    sessionId
  });
  try {
    const task = compactHandoffTask({
      archiveId: created.record.archiveId,
      generation: created.record.generation,
      sessionId,
      sessionToken: created.sessionToken,
      toolName: input.config.contextArchive.toolName || defaultToolName
    });
    return {
      body: appendArchiveTask(originalBody, protocol, task),
      diagnostic: `compact-handoff:${sessionId}:${created.record.generation}:${created.record.archiveId}`,
      record: created.record
    };
  } catch (error) {
    contextArchiveService.fail(created.record, input.config.contextArchive);
    throw error;
  }
}

export function finalizeContextArchiveRequest(
  record: ContextArchiveRecord | undefined,
  route: ArchiveRoute,
  config: AppConfig | undefined
): void {
  if (!config?.contextArchive?.enabled) {
    return;
  }
  contextArchiveService.finalize(record, route, config.contextArchive);
}

export function failContextArchiveRequest(
  record: ContextArchiveRecord | undefined,
  config: AppConfig | undefined
): void {
  if (!config?.contextArchive?.enabled) {
    return;
  }
  contextArchiveService.fail(record, config.contextArchive);
}

export function contextArchiveHandoffResponseStream(
  input: Readable,
  record: ContextArchiveRecord,
  protocol: GatewayProviderProtocol,
  contentType?: string
): Readable {
  const chunks: Buffer[] = [];
  return input.pipe(new Transform({
    transform(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
    flush(callback) {
      const rawBody = Buffer.concat(chunks);
      try {
        this.push(appendArchiveFooterToResponse(rawBody, protocol, contentType, record.footer));
      } catch {
        this.push(rawBody);
      }
      callback();
    }
  }));
}

export async function handleContextArchiveMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig,
  executor?: ContextArchiveReplayExecutor
): Promise<void> {
  if (!contextArchiveMcpEnabled(config)) {
    sendJson(response, 404, { error: { message: "CCR context archive MCP is disabled." } });
    return;
  }
  if ((request.method || "GET").toUpperCase() !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { error: { message: "Method not allowed." } });
    return;
  }

  let payload: JsonRpcRequest;
  try {
    const body = await readBody(request, maxMcpRequestBytes);
    payload = JSON.parse(body.toString("utf8")) as JsonRpcRequest;
  } catch (error) {
    sendJson(response, 400, jsonRpcError(null, -32700, formatError(error)));
    return;
  }
  if (!payload || payload.jsonrpc !== "2.0" || !payload.method) {
    sendJson(response, 400, jsonRpcError(payload?.id ?? null, -32600, "Invalid JSON-RPC request."));
    return;
  }

  const id = payload.id ?? null;
  try {
    const result = await handleJsonRpc(payload, config, executor);
    if (payload.id === undefined && payload.method.startsWith("notifications/")) {
      response.writeHead(202);
      response.end();
      return;
    }
    sendJson(response, 200, result ?? jsonRpcResult(id, {}));
  } catch (error) {
    sendJson(response, 200, jsonRpcError(id, -32000, formatError(error)));
  }
}

async function handleJsonRpc(
  request: JsonRpcRequest,
  config: AppConfig,
  executor?: ContextArchiveReplayExecutor
): Promise<JsonRpcResponse | undefined> {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize":
      return jsonRpcResult(id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: { name: CONTEXT_ARCHIVE_MCP_SERVER_NAME, version: packageJson.version }
      });
    case "ping":
      return jsonRpcResult(id, {});
    case "notifications/initialized":
    case "notifications/cancelled":
      return undefined;
    case "tools/list":
      return jsonRpcResult(id, { tools: [historyAskTool(config.contextArchive)] });
    case "tools/call":
      return jsonRpcResult(id, await callHistoryTool(request.params, config, executor));
    default:
      return jsonRpcError(id, -32601, `Unknown method: ${request.method}`);
  }
}

async function callHistoryTool(
  params: unknown,
  config: AppConfig,
  executor?: ContextArchiveReplayExecutor
): Promise<JsonValue> {
  const value = isRecord(params) ? params : {};
  const toolName = config.contextArchive.toolName || defaultToolName;
  if (stringValue(value.name) !== toolName) {
    throw new Error(`Unknown context archive tool: ${stringValue(value.name) ?? ""}`);
  }
  const args = isRecord(value.arguments) ? value.arguments : {};
  const output = await contextArchiveService.ask({
    archiveId: stringValue(args.archive_id ?? args.archiveId) ?? "",
    sessionToken: stringValue(args.session_token ?? args.sessionToken) ?? "",
    task: stringValue(args.task) ?? ""
  }, config.contextArchive, executor);
  return {
    content: [{ text: JSON.stringify(output), type: "text" }],
    isError: false,
    structuredContent: output
  } as unknown as JsonValue;
}

function historyAskTool(config: ContextArchiveConfig): McpTool {
  return {
    description: [
      "Ask one exact archived pre-compaction agent a natural-language history task.",
      "CCR loads the immutable original request and appends only this task before replaying the original model route.",
      "Use archive_id and session_token exactly as provided by the compact handoff."
    ].join(" "),
    inputSchema: {
      additionalProperties: false,
      properties: {
        archive_id: { description: "Exact immutable archive id from the handoff.", type: "string" },
        session_token: { description: "Opaque access token from the same handoff.", type: "string" },
        task: { description: "Natural-language task for the archived previous-context agent.", type: "string" }
      },
      required: ["archive_id", "session_token", "task"],
      type: "object"
    },
    name: config.toolName || defaultToolName
  };
}

function resolveArchiveSessionId(
  body: Record<string, unknown>,
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  requestId: string
): string {
  const candidates = [
    readHeader(headers, "x-claude-code-session-id"),
    readHeader(headers, "x-claude-session-id"),
    readHeader(headers, "x-codex-session-id"),
    readHeader(headers, "x-openai-session-id"),
    readHeader(headers, "x-agent-session-id"),
    readHeader(headers, "x-session-id"),
    stringValue(isRecord(body.metadata) ? body.metadata.session_id : undefined),
    stringValue(isRecord(body.metadata) ? body.metadata.sessionId : undefined),
    stringValue(isRecord(body.metadata) ? body.metadata.conversation_id : undefined),
    stringValue(body.conversation_id)
  ];
  const selected = candidates.find((value) => value?.trim());
  return safeIdentifier(selected || `request-${requestId}`);
}

function replaySafeHeaders(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>
): Record<string, string> {
  const allowed = new Set([
    "anthropic-beta",
    "anthropic-version",
    "content-type",
    "openai-beta",
    "openai-organization",
    "openai-project",
    "user-agent",
    "x-ccr-client",
    "x-client-name"
  ]);
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (!allowed.has(normalized) || value === undefined) {
      continue;
    }
    output[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  output["content-type"] = "application/json";
  return output;
}

function safeIdentifier(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || "session").slice(0, 160);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function contextArchiveError(code: string, message: string): Error {
  const error = new Error(`${code}: ${message}`);
  error.name = "ContextArchiveError";
  return error;
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function readHeader(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value.join(",") : value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return { id, jsonrpc: "2.0", result };
}

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(body);
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
