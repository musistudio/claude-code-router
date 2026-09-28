type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRpcId = null | number | string;
type JsonRpcRequest = { id?: JsonRpcId; jsonrpc?: string; method?: string; params?: unknown };
type JsonRpcResponse =
  | { id: JsonRpcId; jsonrpc: "2.0"; result: JsonValue }
  | { error: { code: number; message: string }; id: JsonRpcId; jsonrpc: "2.0" };
type McpTool = { description: string; inputSchema: Record<string, unknown>; name: string };

const protocolVersion = "2024-11-05";
const targetUrl = env("CCR_MEDIA_MCP_URL");
const targetApiKey = env("CCR_MEDIA_MCP_API_KEY");
const requestTimeoutMs = clampInteger(Number(env("CCR_MEDIA_MCP_REQUEST_TIMEOUT_MS")), 1_000, 3_600_000, 630_000);
const tools = readTools();

let inputBuffer = Buffer.alloc(0);

if (!targetUrl) {
  process.stderr.write("CCR_MEDIA_MCP_URL is required.\n");
  process.exit(1);
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  void drainInputBuffer().catch((error) => {
    writeJsonRpc(jsonRpcError(null, -32603, formatError(error)));
  });
});
process.stdin.resume();

async function drainInputBuffer(): Promise<void> {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const contentLength = readContentLength(inputBuffer.subarray(0, headerEnd).toString("utf8"));
    if (contentLength === undefined) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      writeJsonRpc(jsonRpcError(null, -32600, "Missing or invalid Content-Length header."));
      continue;
    }
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) return;
    const message = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);

    let payload: unknown;
    try {
      payload = JSON.parse(message) as unknown;
    } catch (error) {
      writeJsonRpc(jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      continue;
    }
    const response = await handleJsonRpcRequest(payload);
    if (response) writeJsonRpc(response);
  }
}

async function handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) return undefined;
  if (request.jsonrpc !== "2.0" || !request.method) return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");

  switch (request.method) {
    case "initialize":
      return jsonRpcResult(id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: { name: "ccr-media-tools", title: "CCR Media Tools", version: "1.0.0" }
      });
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: tools as unknown as JsonValue });
    case "tools/call":
      return forwardToolCall(request, id);
    default:
      return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
  }
}

async function forwardToolCall(request: JsonRpcRequest, id: JsonRpcId): Promise<JsonRpcResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion
    };
    if (targetApiKey) headers.authorization = `Bearer ${targetApiKey}`;
    const response = await fetch(targetUrl!, {
      body: JSON.stringify(request),
      headers,
      method: "POST",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      return jsonRpcError(id, -32603, mediaEndpointError(response.status, text));
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return jsonRpcError(id, -32603, "CCR media endpoint returned an invalid JSON-RPC response.");
    }
    return isJsonRpcResponse(payload)
      ? payload
      : jsonRpcError(id, -32603, "CCR media endpoint returned an invalid JSON-RPC response.");
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  } finally {
    clearTimeout(timeout);
  }
}

function readTools(): McpTool[] {
  const raw = env("CCR_MEDIA_MCP_TOOLS_JSON");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const result: McpTool[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const name = readString(item.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({
      description: readString(item.description) ?? "CCR media generation tool.",
      inputSchema: isRecord(item.inputSchema) ? item.inputSchema : { type: "object", properties: {} },
      name
    });
  }
  return result;
}

function readContentLength(headerText: string): number | undefined {
  const match = /(?:^|\r?\n)content-length\s*:\s*(\d+)\s*(?:\r?\n|$)/i.exec(headerText);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function mediaEndpointError(status: number, body: string): string {
  try {
    const payload = JSON.parse(body) as unknown;
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return `CCR media endpoint returned HTTP ${status}: ${payload.error.message}`;
    }
  } catch {
    // Fall through to a bounded plain-text diagnostic.
  }
  return `CCR media endpoint returned HTTP ${status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : "."}`;
}

function jsonRpcResult(id: JsonRpcId, result: JsonValue): JsonRpcResponse {
  return { id, jsonrpc: "2.0", result };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

function writeJsonRpc(payload: JsonRpcResponse): void {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !("id" in value)) return false;
  return "result" in value || (isRecord(value.error) && typeof value.error.message === "string" && typeof value.error.code === "number");
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? `CCR media tool call timed out after ${requestTimeoutMs}ms.` : error.message;
  }
  return String(error);
}
