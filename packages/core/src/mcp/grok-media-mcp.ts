import packageJson from "../../package.json";
import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  MEDIA_TOOLS_MCP_SERVER_NAME
} from "@ccr/core/contracts/app";
import { readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { mediaService } from "@ccr/core/media/service";
import type { MediaService } from "@ccr/core/media/service";
import { mediaMcpToolDefinition } from "@ccr/core/media/tools";
import {
  LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX,
  MEDIA_ARTIFACT_PATH_PREFIX,
  MEDIA_TOOLS_MCP_PATH
} from "@ccr/core/mcp/grok-media-config";

export { LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX, MEDIA_ARTIFACT_PATH_PREFIX } from "@ccr/core/mcp/grok-media-config";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRpcRequest = { id?: null | number | string; jsonrpc?: string; method?: string; params?: unknown };
type JsonRpcResponse =
  | { id: null | number | string; jsonrpc: "2.0"; result: JsonValue }
  | { error: { code: number; message: string }; id: null | number | string; jsonrpc: "2.0" };

const protocolVersion = "2024-11-05";

export async function handleMediaToolsMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: MediaService = mediaService
): Promise<void> {
  response.setHeader("MCP-Protocol-Version", protocolVersion);
  if (!service.enabled()) {
    sendJson(response, 404, { error: { message: "Media tools MCP is disabled." } });
    return;
  }
  if (request.method === "GET") {
    sendJson(response, 200, { endpoint: MEDIA_TOOLS_MCP_PATH, name: MEDIA_TOOLS_MCP_SERVER_NAME, protocol: "mcp", transport: "streamable-http" });
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { message: "MCP endpoint only supports GET and POST." } });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse((await readRequestBody(request)).toString("utf8"));
  } catch (error) {
    sendJson(response, 400, jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`));
    return;
  }
  const requests = Array.isArray(payload) ? payload : [payload];
  const responses = await Promise.all(requests.map((item) => handleJsonRpcRequest(item, service)));
  const filtered = responses.filter((item): item is JsonRpcResponse => Boolean(item));
  if (!filtered.length) {
    response.writeHead(204);
    response.end();
    return;
  }
  sendJson(response, 200, Array.isArray(payload) ? filtered : filtered[0]);
}

export function handleMediaArtifactRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  service: MediaService = mediaService
): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: { message: "Artifact endpoint only supports GET and HEAD." } });
    return;
  }
  const prefix = requestUrl.pathname.startsWith(MEDIA_ARTIFACT_PATH_PREFIX)
    ? MEDIA_ARTIFACT_PATH_PREFIX
    : LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX;
  const id = decodeURIComponent(requestUrl.pathname.slice(prefix.length));
  const token = requestUrl.searchParams.get("token") ?? "";
  const result = service.resolveArtifact(id, token);
  if (result.state === "missing") {
    sendJson(response, 404, { error: { message: "Media artifact not found." } });
    return;
  }
  if (result.state === "expired") {
    sendJson(response, 410, { error: { message: "Media artifact has expired." } });
    return;
  }
  const artifact = result.artifact;
  const stats = statSync(artifact.localPath);
  const range = parseRange(request.headers.range, stats.size);
  if (request.headers.range && !range) {
    response.setHeader("content-range", `bytes */${stats.size}`);
    response.writeHead(416);
    response.end();
    return;
  }
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("cache-control", "private, max-age=300");
  response.setHeader(
    "content-security-policy",
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'"
  );
  response.setHeader("content-disposition", `inline; filename="${path.basename(artifact.fileName).replace(/["\\]/g, "_")}"`);
  response.setHeader("content-type", artifact.mimeType);
  response.setHeader("etag", `"${artifact.sha256}"`);
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  if (range) {
    response.setHeader("content-length", String(range.end - range.start + 1));
    response.setHeader("content-range", `bytes ${range.start}-${range.end}/${stats.size}`);
    response.writeHead(206);
  } else {
    response.setHeader("content-length", String(stats.size));
    response.writeHead(200);
  }
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(artifact.localPath, range ?? undefined);
  stream.once("error", () => response.destroy());
  stream.pipe(response);
}

async function handleJsonRpcRequest(payload: unknown, service: MediaService): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) return undefined;
  if (request.jsonrpc !== "2.0" || !request.method) return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
  try {
    if (request.method === "initialize") {
      return jsonRpcResult(id, {
        capabilities: { tools: {} },
        protocolVersion,
        serverInfo: { name: "ccr-media-tools", title: "CCR Media Tools", version: packageJson.version }
      });
    }
    if (request.method === "ping") return jsonRpcResult(id, {});
    if (request.method === "tools/list") return jsonRpcResult(id, { tools: service.toolBindings().map(mediaMcpToolDefinition) as unknown as JsonValue });
    if (request.method === "tools/call") return jsonRpcResult(id, await callTool(request.params, service));
    return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  }
}

async function callTool(params: unknown, service: MediaService): Promise<JsonValue> {
  if (!isRecord(params) || typeof params.name !== "string") throw new Error("tools/call params must include a tool name.");
  const args = isRecord(params.arguments) ? params.arguments : {};
  const binding = service.bindingForTool(params.name);
  if (!binding) throw new Error(`Unknown media tool: ${params.name}`);
  let result: unknown;
  switch (binding.operation) {
    case "image-generate": result = await service.imageGenerate(args, binding.modelSelector); break;
    case "image-edit": result = await service.imageEdit(args, binding.modelSelector); break;
    case "video-generate": result = service.videoStart(args, binding.modelSelector); break;
    case "job-get": result = service.getJob(requiredJobId(args)); break;
    case "job-cancel": result = service.cancelJob(requiredJobId(args)); break;
    case "capabilities": result = service.capabilities(); break;
  }
  return {
    content: [{ text: JSON.stringify(result, null, 2), type: "text" }]
  } as unknown as JsonValue;
}

function requiredJobId(args: Record<string, unknown>): string {
  if (typeof args.job_id !== "string" || !args.job_id.trim()) throw new Error("job_id is required.");
  return args.job_id.trim();
}

function parseRange(value: string | undefined, size: number): { end: number; start: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? "");
  if (!match) return undefined;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) start = Math.max(0, size - Number(match[2]));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return undefined;
  return { end: Math.min(end, size - 1), start };
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return { id, jsonrpc: "2.0", result };
}

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
