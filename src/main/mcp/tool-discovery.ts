import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  GatewayMcpRemoteServerConfig,
  GatewayMcpServerConfig,
  GatewayMcpStdioServerConfig,
  GatewayMcpToolInfo
} from "../../shared/app";

type JsonRpcMessage = {
  error?: unknown;
  id?: number | string | null;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (message: JsonRpcMessage) => void;
};

type SseEvent = {
  data: string;
  event: string;
};

const mcpClientInfo = {
  name: "CCR",
  version: "3.0.0"
};

export async function listMcpServerTools(server: GatewayMcpServerConfig): Promise<GatewayMcpToolInfo[]> {
  if (server.transport === "stdio") {
    return listStdioMcpServerTools(server);
  }

  try {
    return await listStreamableHttpMcpServerTools(server);
  } catch (error) {
    if (server.transport !== "sse") {
      throw error;
    }
    return listLegacySseMcpServerTools(server, error);
  }
}

async function listStdioMcpServerTools(server: GatewayMcpStdioServerConfig): Promise<GatewayMcpToolInfo[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args, {
      cwd: server.cwd || undefined,
      env: {
        ...process.env,
        ...server.env
      },
      stdio: ["pipe", "pipe", "pipe"]
    }) as ChildProcessWithoutNullStreams;
    const pending = new Map<string, PendingRequest>();
    const timeout = setTimeout(() => finish(new Error(`MCP tools discovery timed out after ${mcpTimeoutMs(server)} ms.`)), mcpTimeoutMs(server));
    const readMessage = createStdioMessageReader(server.stdioMessageMode, routeMessage);
    let nextId = 1;
    let settled = false;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => readMessage(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (!settled) {
        const detail = stderr.trim() ? ` ${stderr.trim()}` : "";
        finish(new Error(`MCP server exited before tools/list completed (${signal ?? code ?? "unknown"}).${detail}`));
      }
    });

    run().catch((error: unknown) => finish(error));

    async function run() {
      await request("initialize", {
        capabilities: {},
        clientInfo: mcpClientInfo,
        protocolVersion: server.protocolVersion || "2024-11-05"
      });
      notify("notifications/initialized", {});
      const response = await request("tools/list", {});
      finish(undefined, normalizeToolList(response.result));
    }

    function request(method: string, params: unknown): Promise<JsonRpcMessage> {
      const id = nextId++;
      const message: JsonRpcMessage = {
        id,
        jsonrpc: "2.0",
        method,
        params
      };
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(String(id), {
          reject: rejectRequest,
          resolve: resolveRequest
        });
        writeStdioMessage(child, server.stdioMessageMode, message);
      });
    }

    function notify(method: string, params: unknown) {
      writeStdioMessage(child, server.stdioMessageMode, {
        jsonrpc: "2.0",
        method,
        params
      });
    }

    function routeMessage(message: JsonRpcMessage) {
      const key = message.id === undefined || message.id === null ? "" : String(message.id);
      const request = key ? pending.get(key) : undefined;
      if (!request) {
        return;
      }
      pending.delete(key);
      if (message.error) {
        request.reject(new Error(jsonRpcErrorMessage(message.error)));
        return;
      }
      request.resolve(message);
    }

    function finish(error?: unknown, tools: GatewayMcpToolInfo[] = []) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      for (const request of pending.values()) {
        request.reject(toError(error ?? "MCP tools discovery stopped."));
      }
      pending.clear();
      if (!child.killed) {
        child.kill();
      }
      if (error) {
        reject(toError(error));
        return;
      }
      resolve(tools);
    }
  });
}

async function listStreamableHttpMcpServerTools(server: GatewayMcpRemoteServerConfig): Promise<GatewayMcpToolInfo[]> {
  let nextId = 1;
  let sessionId = "";

  async function send(message: JsonRpcMessage): Promise<JsonRpcMessage | undefined> {
    const response = await postJsonRpc(server, server.url, message, sessionId);
    sessionId = response.sessionId || sessionId;
    return response.message;
  }

  await send({
    id: nextId++,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: mcpClientInfo,
      protocolVersion: server.protocolVersion || "2024-11-05"
    }
  });
  await send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  const response = await send({
    id: nextId++,
    jsonrpc: "2.0",
    method: "tools/list",
    params: {}
  });

  return normalizeToolList(response?.result);
}

async function listLegacySseMcpServerTools(
  server: GatewayMcpRemoteServerConfig,
  originalError: unknown
): Promise<GatewayMcpToolInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mcpTimeoutMs(server));
  const pending = new Map<string, PendingRequest>();
  let endpointResolve: (endpoint: string) => void = () => {};
  let endpointReject: (error: Error) => void = () => {};
  const endpointPromise = new Promise<string>((resolve, reject) => {
    endpointResolve = resolve;
    endpointReject = reject;
  });
  let streamBuffer = "";
  let nextId = 1;

  try {
    const response = await fetch(server.url, {
      headers: mcpHttpHeaders(server, "", false),
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`SSE MCP discovery failed with HTTP ${response.status}.`);
    }

    const reader = response.body.getReader();
    const readLoop = (async () => {
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        streamBuffer += decoder.decode(value, { stream: true });
        streamBuffer = consumeSseEvents(streamBuffer, routeSseEvent);
      }
    })();
    readLoop.catch((error: unknown) => rejectPending(error));

    const endpoint = await endpointPromise;
    const messageUrl = new URL(endpoint, server.url).toString();

    await request(messageUrl, "initialize", {
      capabilities: {},
      clientInfo: mcpClientInfo,
      protocolVersion: server.protocolVersion || "2024-11-05"
    });
    await postJsonRpc(server, messageUrl, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    });
    const responseMessage = await request(messageUrl, "tools/list", {});
    return normalizeToolList(responseMessage.result);
  } catch (error) {
    if (originalError instanceof Error && !(error instanceof DOMException && error.name === "AbortError")) {
      throw new Error(`${toError(error).message} Streamable HTTP fallback failed first: ${originalError.message}`);
    }
    throw toError(error);
  } finally {
    clearTimeout(timeout);
    rejectPending(new Error("MCP SSE discovery closed."));
    controller.abort();
  }

  function routeSseEvent(event: SseEvent) {
    if (event.event === "endpoint") {
      endpointResolve(event.data.trim());
      return;
    }
    const message = parseJsonRpcMessage(event.data);
    if (!message) {
      return;
    }
    const key = message.id === undefined || message.id === null ? "" : String(message.id);
    const request = key ? pending.get(key) : undefined;
    if (!request) {
      return;
    }
    pending.delete(key);
    if (message.error) {
      request.reject(new Error(jsonRpcErrorMessage(message.error)));
      return;
    }
    request.resolve(message);
  }

  function request(messageUrl: string, method: string, params: unknown): Promise<JsonRpcMessage> {
    const id = nextId++;
    const message: JsonRpcMessage = {
      id,
      jsonrpc: "2.0",
      method,
      params
    };
    return new Promise((resolve, reject) => {
      pending.set(String(id), { reject, resolve });
      postJsonRpc(server, messageUrl, message).catch((error: unknown) => {
        pending.delete(String(id));
        reject(toError(error));
      });
    });
  }

  function rejectPending(error: unknown) {
    endpointReject(toError(error));
    for (const request of pending.values()) {
      request.reject(toError(error));
    }
    pending.clear();
  }
}

async function postJsonRpc(
  server: GatewayMcpRemoteServerConfig,
  url: string,
  message: JsonRpcMessage,
  sessionId = ""
): Promise<{ message?: JsonRpcMessage; sessionId?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mcpTimeoutMs(server));
  try {
    const response = await fetch(url, {
      body: JSON.stringify(message),
      headers: mcpHttpHeaders(server, sessionId, true),
      method: "POST",
      signal: controller.signal
    });
    const nextSessionId = response.headers.get("mcp-session-id") ?? undefined;
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MCP discovery request failed with HTTP ${response.status}${text.trim() ? `: ${text.trim().slice(0, 300)}` : ""}`);
    }
    const parsed = parseJsonRpcMessageFromResponse(text, message.id);
    if (parsed?.error) {
      throw new Error(jsonRpcErrorMessage(parsed.error));
    }
    return {
      message: parsed,
      sessionId: nextSessionId
    };
  } finally {
    clearTimeout(timeout);
  }
}

function writeStdioMessage(
  child: ChildProcessWithoutNullStreams,
  mode: GatewayMcpStdioServerConfig["stdioMessageMode"],
  message: JsonRpcMessage
) {
  const body = JSON.stringify(message);
  if (mode === "newline-json") {
    child.stdin.write(`${body}\n`);
    return;
  }
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function createStdioMessageReader(
  mode: GatewayMcpStdioServerConfig["stdioMessageMode"],
  onMessage: (message: JsonRpcMessage) => void
): (chunk: Buffer) => void {
  if (mode === "newline-json") {
    let textBuffer = "";
    return (chunk: Buffer) => {
      textBuffer += chunk.toString("utf8");
      for (;;) {
        const newlineIndex = textBuffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }
        const line = textBuffer.slice(0, newlineIndex).trim();
        textBuffer = textBuffer.slice(newlineIndex + 1);
        const message = parseJsonRpcMessage(line);
        if (message) {
          onMessage(message);
        }
      }
    };
  }

  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const delimiter = contentLengthHeaderDelimiter(buffer);
      if (!delimiter) {
        return;
      }
      const header = buffer.subarray(0, delimiter.index).toString("utf8");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.subarray(delimiter.index + delimiter.length);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = delimiter.index + delimiter.length;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) {
        return;
      }
      const message = parseJsonRpcMessage(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
      buffer = buffer.subarray(bodyEnd);
      if (message) {
        onMessage(message);
      }
    }
  };
}

function contentLengthHeaderDelimiter(buffer: Buffer): { index: number; length: number } | undefined {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  if (crlfIndex >= 0) {
    return { index: crlfIndex, length: 4 };
  }
  const lfIndex = buffer.indexOf("\n\n");
  return lfIndex >= 0 ? { index: lfIndex, length: 2 } : undefined;
}

function parseJsonRpcMessageFromResponse(text: string, expectedId: JsonRpcMessage["id"]): JsonRpcMessage | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const messages: JsonRpcMessage[] = [];
    consumeSseEvents(trimmed, (event) => {
      const message = parseJsonRpcMessage(event.data);
      if (message) {
        messages.push(message);
      }
    });
    return findExpectedMessage(messages, expectedId);
  }
  const parsed = parseJsonValue(trimmed);
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  return findExpectedMessage(messages.filter(isJsonRpcMessage), expectedId);
}

function findExpectedMessage(messages: JsonRpcMessage[], expectedId: JsonRpcMessage["id"]): JsonRpcMessage | undefined {
  if (expectedId === undefined || expectedId === null) {
    return messages[0];
  }
  return messages.find((message) => message.id === expectedId) ?? messages[0];
}

function consumeSseEvents(buffer: string, onEvent: (event: SseEvent) => void): string {
  for (;;) {
    const delimiter = sseDelimiter(buffer);
    if (!delimiter) {
      return buffer;
    }
    const block = buffer.slice(0, delimiter.index);
    buffer = buffer.slice(delimiter.index + delimiter.length);
    const event = parseSseEvent(block);
    if (event.data) {
      onEvent(event);
    }
  }
}

function sseDelimiter(buffer: string): { index: number; length: number } | undefined {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  if (crlfIndex >= 0) {
    return { index: crlfIndex, length: 4 };
  }
  const lfIndex = buffer.indexOf("\n\n");
  return lfIndex >= 0 ? { index: lfIndex, length: 2 } : undefined;
}

function parseSseEvent(block: string): SseEvent {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }
  return {
    data: data.join("\n"),
    event
  };
}

function mcpHttpHeaders(server: GatewayMcpRemoteServerConfig, sessionId = "", includeBodyHeaders = true): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    ...server.headers
  };
  if (includeBodyHeaders) {
    headers["Content-Type"] = "application/json";
  }
  if (server.protocolVersion) {
    headers["MCP-Protocol-Version"] = server.protocolVersion;
  }
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }
  const apiKey = server.apiKey || (server.apiKeyEnv ? process.env[server.apiKeyEnv] : "");
  if (apiKey && !hasHeader(headers, "authorization")) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function mcpTimeoutMs(server: GatewayMcpServerConfig): number {
  return Math.max(1000, Math.min(600000, server.startupTimeoutMs || server.requestTimeoutMs || 30000));
}

function normalizeToolList(value: unknown): GatewayMcpToolInfo[] {
  const tools = isRecord(value) && Array.isArray(value.tools) ? value.tools : [];
  return tools
    .filter(isRecord)
    .map((tool): GatewayMcpToolInfo | undefined => {
      const name = stringValue(tool.name);
      if (!name) {
        return undefined;
      }
      const inputSchema = normalizeToolInputSchema(tool);
      return {
        ...(stringValue(tool.description) ? { description: stringValue(tool.description) } : {}),
        inputSchema,
        name
      };
    })
    .filter((tool): tool is GatewayMcpToolInfo => Boolean(tool));
}

function normalizeToolInputSchema(tool: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    tool.inputSchema,
    tool.input_schema,
    tool.parameters,
    tool.schema
  ];
  for (const candidate of candidates) {
    const parsed = normalizeSchemaCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return { properties: {}, type: "object" };
}

function normalizeSchemaCandidate(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return { ...value };
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? { ...parsed } : undefined;
}

function parseJsonRpcMessage(value: string): JsonRpcMessage | undefined {
  return isJsonRpcMessage(parseJsonValue(value)) ? parseJsonValue(value) as JsonRpcMessage : undefined;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return isRecord(value);
}

function jsonRpcErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const message = stringValue(error.message);
    if (message) {
      return message;
    }
  }
  return typeof error === "string" ? error : "MCP JSON-RPC request failed.";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
