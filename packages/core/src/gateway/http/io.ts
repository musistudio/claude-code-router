/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";
import type { ApiKeyConfig } from "@ccr/core/contracts/app";
import { ccrRemoteControlPathPrefix } from "@ccr/core/gateway/remote-control-service";
import { coreGatewayAuthHeader, localObservabilityHeaderNames, proxyHeaderDenyList, responseHeaderDenyList } from "@ccr/core/gateway/internal/shared";


export function inferGatewayClient(apiKey: ApiKeyConfig | undefined, headers: IncomingHttpHeaders): string | undefined {
  const explicit =
    readHeader(headers["x-ccr-client"]) ??
    readHeader(headers["x-client-name"]) ??
    readHeader(headers["x-forwarded-client-cert"]);
  if (explicit) {
    return explicit;
  }

  const apiKeyClient = apiKey?.name?.trim() || apiKey?.id?.trim();
  const userAgentClient = inferClientFromUserAgent(headers);
  if (readHeader(headers["x-ccr-proxy-mode"]) === "gateway") {
    return userAgentClient ?? apiKeyClient;
  }
  return apiKeyClient ?? userAgentClient;
}


function inferClientFromUserAgent(headers: IncomingHttpHeaders): string | undefined {
  const userAgent = readHeader(headers["user-agent"]);
  if (!userAgent) {
    return undefined;
  }

  const normalized = userAgent.toLowerCase();
  if (normalized.includes("codex")) {
    return "Codex";
  }
  if (normalized.includes("@anthropic-ai/claude-code") || normalized.includes("claude-code") || normalized.includes("claude code")) {
    return "Claude Code";
  }
  if (normalized.includes("claude")) {
    return "Claude";
  }
  if (normalized.includes("curl")) {
    return "curl";
  }
  if (normalized.includes("python")) {
    return "Python";
  }
  if (normalized.includes("node")) {
    return "Node.js";
  }
  if (normalized.includes("chrome")) {
    return "Google Chrome";
  }
  if (normalized.includes("safari") && !normalized.includes("chrome")) {
    return "Safari";
  }
  return userAgent.split(/[ /]/)[0]?.trim() || undefined;
}


export function readAuthToken(headers: IncomingHttpHeaders): string | undefined {
  const raw = readHeader(headers.authorization) || readHeader(headers["x-api-key"]);
  if (!raw) {
    return undefined;
  }
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}


export function readRemoteControlQueryAuthToken(request: IncomingMessage): string | undefined {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname !== ccrRemoteControlPathPrefix && !url.pathname.startsWith(`${ccrRemoteControlPathPrefix}/`)) {
    return undefined;
  }
  return url.searchParams.get("api_key")?.trim() || url.searchParams.get("key")?.trim() || undefined;
}


export function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (proxyHeaderDenyList.has(normalized) || value === undefined) {
      continue;
    }
    forwarded[normalized] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return forwarded;
}


export function stripLocalGatewayAuthHeaders(headers: Record<string, string>): void {
  delete headers.authorization;
  delete headers["x-api-key"];
  delete headers["api-key"];
}


export function omitLocalObservabilityHeaders(headers: Record<string, string>): Record<string, string> {
  const forwarded = { ...headers };
  for (const name of localObservabilityHeaderNames) {
    delete forwarded[name];
  }
  return forwarded;
}


export function withCoreGatewayAuthHeader(headers: Record<string, string>, token: string): Record<string, string> {
  if (!token) {
    throw new Error("Core gateway auth token is not initialized.");
  }
  return {
    ...headers,
    [coreGatewayAuthHeader]: token
  };
}


export function filteredResponseHeaders(headers: Headers): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  headers.forEach((value, key) => {
    if (!responseHeaderDenyList.has(key.toLowerCase())) {
      entries.push([key, value]);
    }
  });
  return entries;
}


export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


export function abortSignalMessage(signal: AbortSignal): string {
  const reason = signal.reason as unknown;
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }
  return "Upstream request was aborted.";
}


export function parseJsonObject(buffer: Buffer): Record<string, unknown> {
  if (buffer.length === 0) {
    return {};
  }
  const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("Request body must be a JSON object.");
}


export function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


export function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}


export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}


export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    };

    try {
      server.closeIdleConnections?.();
      timeout = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, 800);
      server.close(() => finish());
    } catch {
      finish();
    }
  });
}


export function shouldSendBody(method: string | undefined): boolean {
  const normalized = method?.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}


export function shouldCaptureGatewayUsage(method: string, _path: string): boolean {
  return shouldSendBody(method);
}

