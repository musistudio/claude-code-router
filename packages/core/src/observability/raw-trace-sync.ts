/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve as pathResolve, sep as pathSep } from "node:path";
import type { AppConfig } from "@ccr/core/contracts/app";
import { RAW_TRACE_SPOOL_DIR } from "@ccr/core/config/constants";
import { updateGatewayRequestLogFromRawTrace, type RequestLogRawTraceUpdateInput } from "@ccr/core/observability/request-log-store";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError, parseJsonObject, readHeader, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { maxUsageCaptureBytes, rawTraceSyncHeader, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared";
import type { RawTracePartText } from "@ccr/core/gateway/internal/shared";

type PendingRawTraceUpdate = RequestLogRawTraceUpdateInput & { receivedAt: number };
const maxPendingRawTraceUpdates = 200;
const pendingRawTraceMaxAgeMs = 5 * 60 * 1000;

export class RawTraceSynchronizer {
  readonly token = randomUUID();
  private readonly pendingUpdates = new Map<string, PendingRawTraceUpdate>();

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    if (readHeader(request.headers[rawTraceSyncHeader]) !== this.token) {
      sendJson(response, 401, { error: { message: "Unauthorized raw trace sync." } });
      return;
    }

    const manifest = parseJsonObject(await readRequestBody(request));
    const update = readRawTraceRequestLogUpdate(manifest);
    cleanupRawTraceBundle(manifest);
    if (!update) {
      sendJson(response, 202, { applied: false, ok: true });
      return;
    }

    const applied = await updateGatewayRequestLogFromRawTrace(update);
    if (!applied) this.store(update);
    sendJson(response, 200, { applied, ok: true });
  }

  take(requestId: string): RequestLogRawTraceUpdateInput | undefined {
    const update = this.pendingUpdates.get(requestId);
    if (!update) return undefined;
    this.pendingUpdates.delete(requestId);
    const { receivedAt: _receivedAt, ...input } = update;
    return input;
  }

  private store(update: RequestLogRawTraceUpdateInput): void {
    this.prune();
    this.pendingUpdates.set(update.requestId, { ...update, receivedAt: Date.now() });
    while (this.pendingUpdates.size > maxPendingRawTraceUpdates) {
      const oldestKey = this.pendingUpdates.keys().next().value;
      if (!oldestKey) break;
      this.pendingUpdates.delete(oldestKey);
    }
  }

  private prune(): void {
    const cutoff = Date.now() - pendingRawTraceMaxAgeMs;
    for (const [requestId, update] of this.pendingUpdates) {
      if (update.receivedAt < cutoff) this.pendingUpdates.delete(requestId);
    }
  }
}


export function buildRawTraceConfig(config: AppConfig, rawTraceSyncToken: string): Record<string, unknown> {
  const enabled = rawTraceEnabledFromEnv() && shouldRecordRequestLogs(config);
  return {
    deleteLocalAfterUpload: false,
    enabled,
    maxPartBytes: maxUsageCaptureBytes,
    mode: "wire_raw",
    spoolDir: RAW_TRACE_SPOOL_DIR,
    sync: {
      enabled,
      endpoint: `${endpoint(config.gateway.host, config.gateway.port)}${rawTraceSyncPath}`,
      headers: {
        [rawTraceSyncHeader]: rawTraceSyncToken
      },
      timeoutMs: 5000
    }
  };
}


export function shouldRecordRequestLogs(config: AppConfig): boolean {
  return Boolean(config.observability?.requestLogs || config.observability?.agentAnalysis);
}


function rawTraceEnabledFromEnv(): boolean {
  const value = (process.env.CCR_RAW_TRACE_ENABLED ?? process.env.CCR_RAW_TRACE ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}


export function readRawTraceRequestLogUpdate(manifest: Record<string, unknown>): RequestLogRawTraceUpdateInput | undefined {
  const requestId = stringValue(manifest.turnKey);
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  if (!requestId || parts.length === 0) {
    return undefined;
  }

  const upstreamRequestMetadata = readRawTraceJsonPart(parts, "upstream_request_metadata");
  const upstreamResponseMetadata = readRawTraceJsonPart(parts, "upstream_response_metadata");
  const upstreamRequestBody = readRawTraceTextPart(parts, "upstream_request");
  const upstreamResponseStream = readRawTraceTextPart(parts, "response_stream");
  const upstreamResponseBody = upstreamResponseStream ?? readRawTraceTextPart(parts, "upstream_response");
  const target = isRecord(manifest.target) ? manifest.target : {};
  const rawUrl = stringValue(upstreamRequestMetadata?.url);
  const url = sanitizeUrlForLog(rawUrl);

  return {
    method: stringValue(upstreamRequestMetadata?.method) || "POST",
    model: stringValue(target.model),
    path: pathFromUrl(url),
    provider: stringValue(target.providerName) || stringValue(target.provider),
    requestBodyContentType: upstreamRequestBody?.contentType,
    requestBodyText: upstreamRequestBody?.text,
    requestHeaders: headerRecordFromUnknown(upstreamRequestMetadata?.headers),
    requestId,
    isStream: upstreamResponseStream !== undefined,
    responseBodyContentType: upstreamResponseBody?.contentType,
    responseBodyText: upstreamResponseBody?.text,
    responseHeaders: headerRecordFromUnknown(upstreamResponseMetadata?.headers),
    statusCode: numberValue(upstreamResponseMetadata?.statusCode),
    url
  };
}


function readRawTraceJsonPart(parts: Record<string, unknown>[], partType: string): Record<string, unknown> | undefined {
  const text = readRawTraceTextPart(parts, partType)?.text;
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}


function readRawTraceTextPart(parts: Record<string, unknown>[], partType: string): RawTracePartText | undefined {
  const part = parts.find((candidate) => stringValue(candidate.partType) === partType);
  const filePath = stringValue(part?.filePath);
  if (!filePath || !isRawTraceSpoolFile(filePath)) {
    return undefined;
  }
  try {
    return {
      contentType: stringValue(part?.contentType),
      text: readFileSync(filePath, "utf8")
    };
  } catch (error) {
    console.warn(`[gateway] Failed to read raw trace part ${partType}: ${formatError(error)}`);
    return undefined;
  }
}


export function cleanupRawTraceBundle(manifest: Record<string, unknown>): void {
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  const firstFilePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  if (!firstFilePath || !isRawTraceSpoolFile(firstFilePath)) {
    return;
  }
  try {
    rmSync(dirname(firstFilePath), { force: true, recursive: true });
  } catch (error) {
    console.warn(`[gateway] Failed to clean raw trace bundle: ${formatError(error)}`);
  }
}


function isRawTraceSpoolFile(filePath: string): boolean {
  const spoolDir = pathResolve(RAW_TRACE_SPOOL_DIR);
  const resolvedFile = pathResolve(filePath);
  return dirname(resolvedFile) !== spoolDir && resolvedFile.startsWith(`${spoolDir}${pathSep}`);
}


function headerRecordFromUnknown(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined || headerValue === null) {
      continue;
    }
    headers[key] = Array.isArray(headerValue)
      ? headerValue.map((item) => String(item)).join(", ")
      : String(headerValue);
  }
  return headers;
}


function sanitizeUrlForLog(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveQueryParam(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}


function isSensitiveQueryParam(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "key" || normalized === "api_key" || normalized === "apikey" || normalized === "access_token";
}


function pathFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).pathname || undefined;
  } catch {
    return undefined;
  }
}


export function createBodySampler() {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let truncated = false;

  return {
    append(chunk: Buffer | string) {
      if (truncated) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (totalBytes + buffer.byteLength > maxUsageCaptureBytes) {
        const remaining = Math.max(0, maxUsageCaptureBytes - totalBytes);
        if (remaining > 0) {
          chunks.push(buffer.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        return;
      }
      chunks.push(buffer);
      totalBytes += buffer.byteLength;
    },
    isTruncated() {
      return truncated;
    },
    read() {
      return Buffer.concat(chunks, totalBytes).toString("utf8");
    }
  };
}
