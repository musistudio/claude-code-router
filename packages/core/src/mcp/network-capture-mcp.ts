import packageJson from "../../package.json";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyNetworkExchange } from "@ccr/core/contracts/app";
import { proxyService } from "@ccr/core/proxy/service";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      id: null | number | string;
      jsonrpc: "2.0";
      result: JsonValue;
    }
  | {
      error: {
        code: number;
        data?: JsonValue;
        message: string;
      };
      id: null | number | string;
      jsonrpc: "2.0";
    };

type McpTool = {
  description: string;
  inputSchema: JsonValue;
  name: string;
};

type ToolCallResult = {
  content: Array<{ text: string; type: "text" }>;
  isError?: boolean;
};

const protocolVersion = "2024-11-05";
const maxMcpRequestBytes = 2 * 1024 * 1024;

const networkCaptureTools: McpTool[] = [
  {
    description: "Return CCR proxy capture status, proxy status, capture limits, and current capture count.",
    inputSchema: objectSchema({}),
    name: "network_capture_status"
  },
  {
    description: "List captured network exchanges. Bodies are omitted by default to keep responses compact.",
    inputSchema: objectSchema({
      includeBodies: { description: "Include captured request and response bodies.", type: "boolean" },
      limit: { description: "Maximum number of exchanges to return.", maximum: 200, minimum: 1, type: "number" },
      query: { description: "Filter by URL, host, client, method, state, status code, or error text.", type: "string" }
    }),
    name: "network_capture_list"
  },
  {
    description: "Get one captured network exchange by id, including captured request and response bodies.",
    inputSchema: objectSchema({
      id: { description: "Capture id returned by network_capture_list.", type: "string" }
    }, ["id"]),
    name: "network_capture_get"
  },
  {
    description: "Clear all captured network exchanges.",
    inputSchema: objectSchema({}),
    name: "network_capture_clear"
  },
  {
    description: "Enable or pause future network capture recording. Traffic continues to proxy while recording is paused.",
    inputSchema: objectSchema({
      enabled: { description: "true to record future captures, false to pause recording.", type: "boolean" }
    }, ["enabled"]),
    name: "network_capture_set_enabled"
  }
];

export function isNetworkCaptureMcpPath(path: string): boolean {
  return path === "/mcp" || path === "/mcp/";
}

export async function handleNetworkCaptureMcpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader("MCP-Protocol-Version", protocolVersion);

  if (!proxyService.isNetworkCaptureEnabled()) {
    sendJson(response, 404, { error: { message: "Network capture MCP is disabled." } });
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, {
      name: "ccr-network-capture",
      protocol: "mcp",
      transport: "streamable-http",
      endpoint: "/mcp"
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: { message: "MCP endpoint only supports GET and POST." } });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse((await readRequestBody(request, maxMcpRequestBytes)).toString("utf8")) as unknown;
  } catch (error) {
    sendJson(response, 400, jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
    return;
  }

  const requests = Array.isArray(payload) ? payload : [payload];
  const responses = await Promise.all(requests.map((item) => handleJsonRpcRequest(item)));
  const filtered = responses.filter((item): item is JsonRpcResponse => Boolean(item));
  if (filtered.length === 0) {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 200, Array.isArray(payload) ? filtered : filtered[0]);
}

async function handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) {
    return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  }

  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) {
    return undefined;
  }
  if (request.jsonrpc !== "2.0" || !request.method) {
    return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          capabilities: {
            tools: {}
          },
          protocolVersion,
          serverInfo: {
            name: "ccr-network-capture",
            title: "CCR Network Capture",
            version: appVersion()
          }
        });
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, { tools: proxyService.isNetworkCaptureEnabled() ? networkCaptureTools : [] });
      case "tools/call":
        return jsonRpcResult(id, await callTool(request.params));
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  }
}

function appVersion(): string {
  return packageJson.version;
}

async function callTool(params: unknown): Promise<JsonValue> {
  if (!proxyService.isNetworkCaptureEnabled()) {
    throw new Error("Network capture MCP is disabled.");
  }

  if (!isRecord(params) || typeof params.name !== "string") {
    throw new Error("tools/call params must include a tool name.");
  }

  const args = isRecord(params.arguments) ? params.arguments : {};
  switch (params.name) {
    case "network_capture_status":
      return toolResult(captureStatus());
    case "network_capture_list":
      return toolResult(listCaptures(args));
    case "network_capture_get":
      return toolResult(getCapture(args));
    case "network_capture_clear":
      return toolResult(clearCaptures());
    case "network_capture_set_enabled":
      return toolResult(setCaptureEnabled(args));
    default:
      throw new Error(`Unknown network capture tool: ${params.name}`);
  }
}

function captureStatus(): JsonValue {
  const snapshot = proxyService.getNetworkCaptures();
  const status = proxyService.getStatus();
  return {
    captureEnabled: snapshot.captureEnabled,
    capturedAt: snapshot.capturedAt,
    count: snapshot.items.length,
    maxBodyBytes: snapshot.maxBodyBytes,
    maxEntries: snapshot.maxEntries,
    proxy: {
      endpoint: status.endpoint,
      mode: status.mode,
      state: status.state,
      systemProxy: status.systemProxy
    }
  } as JsonValue;
}

function listCaptures(args: Record<string, unknown>): JsonValue {
  const snapshot = proxyService.getNetworkCaptures();
  const query = readString(args.query)?.trim().toLowerCase();
  const limit = clampInteger(readNumber(args.limit) ?? 50, 1, Math.min(snapshot.maxEntries, 200));
  const includeBodies = args.includeBodies === true;
  const items = snapshot.items
    .filter((item) => !query || captureMatchesQuery(item, query))
    .slice(0, limit)
    .map((item) => includeBodies ? item : summarizeCapture(item));
  return {
    captureEnabled: snapshot.captureEnabled,
    capturedAt: snapshot.capturedAt,
    count: items.length,
    items,
    total: snapshot.items.length
  } as JsonValue;
}

function getCapture(args: Record<string, unknown>): JsonValue {
  const id = readString(args.id);
  if (!id) {
    throw new Error("network_capture_get requires id.");
  }

  const item = proxyService.getNetworkCaptures().items.find((capture) => capture.id === id);
  if (!item) {
    throw new Error(`Network capture not found: ${id}`);
  }
  return item as unknown as JsonValue;
}

function clearCaptures(): JsonValue {
  const snapshot = proxyService.clearNetworkCaptures();
  return {
    captureEnabled: snapshot.captureEnabled,
    cleared: true,
    count: snapshot.items.length
  };
}

function setCaptureEnabled(args: Record<string, unknown>): JsonValue {
  if (typeof args.enabled !== "boolean") {
    throw new Error("network_capture_set_enabled requires boolean enabled.");
  }
  const snapshot = proxyService.setNetworkCaptureEnabled(args.enabled);
  return {
    captureEnabled: snapshot.captureEnabled,
    count: snapshot.items.length
  };
}

function summarizeCapture(item: ProxyNetworkExchange): JsonValue {
  return {
    client: item.client,
    completedAt: item.completedAt,
    durationMs: item.durationMs,
    error: item.error,
    host: item.host,
    id: item.id,
    method: item.method,
    mode: item.mode,
    path: item.path,
    protocol: item.protocol,
    requestBody: summarizeBody(item.requestBody),
    requestHeaders: item.requestHeaders,
    responseBody: item.responseBody ? summarizeBody(item.responseBody) : undefined,
    responseHeaders: item.responseHeaders,
    routedToGateway: item.routedToGateway,
    startedAt: item.startedAt,
    state: item.state,
    statusCode: item.statusCode,
    upstreamUrl: item.upstreamUrl,
    url: item.url
  } as JsonValue;
}

function summarizeBody(body: ProxyNetworkExchange["requestBody"]): JsonValue {
  const summary: Record<string, JsonValue> = {
    encoding: body.encoding,
    sizeBytes: body.sizeBytes,
    truncated: body.truncated
  };
  if (body.contentType) {
    summary.contentType = body.contentType;
  }
  if (body.decodedFrom) {
    summary.decodedFrom = body.decodedFrom;
  }
  if (body.error) {
    summary.error = body.error;
  }
  return summary;
}

function captureMatchesQuery(item: ProxyNetworkExchange, query: string): boolean {
  return [
    item.client,
    item.error,
    item.host,
    item.method,
    item.mode,
    item.path,
    item.protocol,
    item.state,
    item.statusCode === undefined ? undefined : String(item.statusCode),
    item.upstreamUrl,
    item.url
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

function toolResult(value: JsonValue): ToolCallResult {
  return {
    content: [
      {
        text: JSON.stringify(value, null, 2),
        type: "text"
      }
    ]
  };
}

function objectSchema(properties: Record<string, JsonValue>, required: string[] = []): JsonValue {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object"
  };
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result
  };
}

function jsonRpcError(id: null | number | string, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return {
    error: {
      code,
      ...(data === undefined ? {} : { data }),
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => resolve(Buffer.concat(chunks, totalBytes)));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
