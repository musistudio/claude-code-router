"use strict";

// packages/core/src/mcp/media-tools-proxy-mcp.ts
var protocolVersion = "2024-11-05";
var targetUrl = env("CCR_MEDIA_MCP_URL");
var targetApiKey = env("CCR_MEDIA_MCP_API_KEY");
var requestTimeoutMs = clampInteger(Number(env("CCR_MEDIA_MCP_REQUEST_TIMEOUT_MS")), 1e3, 36e5, 63e4);
var tools = readTools();
var inputBuffer = Buffer.alloc(0);
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
async function drainInputBuffer() {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const contentLength = readContentLength(inputBuffer.subarray(0, headerEnd).toString("utf8"));
    if (contentLength === void 0) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      writeJsonRpc(jsonRpcError(null, -32600, "Missing or invalid Content-Length header."));
      continue;
    }
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) return;
    const message = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (error) {
      writeJsonRpc(jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
      continue;
    }
    const response = await handleJsonRpcRequest(payload);
    if (response) writeJsonRpc(response);
  }
}
async function handleJsonRpcRequest(payload) {
  if (!isRecord(payload)) return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  const request = payload;
  const id = request.id ?? null;
  if (request.id === void 0 && request.method?.startsWith("notifications/")) return void 0;
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
      return jsonRpcResult(id, { tools });
    case "tools/call":
      return forwardToolCall(request, id);
    default:
      return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
  }
}
async function forwardToolCall(request, id) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const headers = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion
    };
    if (targetApiKey) headers.authorization = `Bearer ${targetApiKey}`;
    const response = await fetch(targetUrl, {
      body: JSON.stringify(request),
      headers,
      method: "POST",
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      return jsonRpcError(id, -32603, mediaEndpointError(response.status, text));
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return jsonRpcError(id, -32603, "CCR media endpoint returned an invalid JSON-RPC response.");
    }
    return isJsonRpcResponse(payload) ? payload : jsonRpcError(id, -32603, "CCR media endpoint returned an invalid JSON-RPC response.");
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  } finally {
    clearTimeout(timeout);
  }
}
function readTools() {
  const raw = env("CCR_MEDIA_MCP_TOOLS_JSON");
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
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
function readContentLength(headerText) {
  const match = /(?:^|\r?\n)content-length\s*:\s*(\d+)\s*(?:\r?\n|$)/i.exec(headerText);
  if (!match) return void 0;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function mediaEndpointError(status, body) {
  try {
    const payload = JSON.parse(body);
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return `CCR media endpoint returned HTTP ${status}: ${payload.error.message}`;
    }
  } catch {
  }
  return `CCR media endpoint returned HTTP ${status}${body.trim() ? `: ${body.trim().slice(0, 500)}` : "."}`;
}
function jsonRpcResult(id, result) {
  return { id, jsonrpc: "2.0", result };
}
function jsonRpcError(id, code, message) {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}
function writeJsonRpc(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r
\r
${body}`);
}
function isJsonRpcResponse(value) {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !("id" in value)) return false;
  return "result" in value || isRecord(value.error) && typeof value.error.message === "string" && typeof value.error.code === "number";
}
function env(name) {
  const value = process.env[name]?.trim();
  return value || void 0;
}
function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function clampInteger(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatError(error) {
  if (error instanceof Error) {
    return error.name === "AbortError" ? `CCR media tool call timed out after ${requestTimeoutMs}ms.` : error.message;
  }
  return String(error);
}
