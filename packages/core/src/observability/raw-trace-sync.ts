/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { readFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve as pathResolve, sep as pathSep } from "node:path";
import type { AppConfig } from "@ccr/core/contracts/app";
import { RAW_TRACE_SPOOL_DIR } from "@ccr/core/config/constants";
import {
  updateGatewayRequestLogFromRawTrace,
  type RequestLogRawTraceFiles,
  type RequestLogRawTraceUpdateInput
} from "@ccr/core/observability/request-log-store";
import { resolveRawTraceBodyLimit } from "@ccr/core/observability/request-log-limits";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { formatError, parseJsonObject, readHeader, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { endpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { maxUsageCaptureBytes, rawTraceSyncHeader, rawTraceSyncPath } from "@ccr/core/gateway/internal/shared";
import type { RawTracePartText } from "@ccr/core/gateway/internal/shared";

type RawTraceSynchronizerDependencies = {
  enqueueUpdate?: typeof updateGatewayRequestLogFromRawTrace;
  getConfig: () => AppConfig | undefined;
  spoolDirectory?: string;
};

type RawTraceRequestLogBundle = {
  files: RequestLogRawTraceFiles;
  update: RequestLogRawTraceUpdateInput;
};

export class RawTraceSynchronizer {
  readonly token = randomUUID();

  constructor(private readonly dependencies: RawTraceSynchronizerDependencies) {}

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
    const spoolDirectory = this.dependencies.spoolDirectory ?? RAW_TRACE_SPOOL_DIR;
    const bundle = await readRawTraceRequestLogBundle(manifest, spoolDirectory);
    if (!bundle) {
      await cleanupRawTraceBundle(manifest, spoolDirectory);
      sendJson(response, 202, { applied: false, ok: true });
      return;
    }

    const config = this.dependencies.getConfig();
    if (!config || !shouldRecordRequestLogs(config)) {
      await cleanupRawTraceBundle(manifest, spoolDirectory);
      sendJson(response, 202, { accepted: true, ok: true, reason: "disabled" });
      return;
    }
    const policy = applyRawTraceRequestLogPolicy(config, bundle.update);
    if (policy.action === "discard") {
      await cleanupRawTraceBundle(manifest, spoolDirectory);
      sendJson(response, 202, { accepted: true, ok: true, reason: policy.reason });
      return;
    }

    const maxBodyBytes = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes);
    const files = policy.captureBodies
      ? { ...bundle.files, maxBodyBytes }
      : { cleanupDirectory: bundle.files.cleanupDirectory, maxBodyBytes };
    const enqueueUpdate = this.dependencies.enqueueUpdate ?? updateGatewayRequestLogFromRawTrace;
    const accepted = await enqueueUpdate(policy.update, files);
    sendJson(response, accepted ? 200 : 503, { accepted, ok: accepted });
  }
}


export function buildRawTraceConfig(config: AppConfig, rawTraceSyncToken: string): Record<string, unknown> {
  const bodyCapture = config.observability.requestLogBodyCapture ?? "all";
  const maxBodyBytes = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes);
  const bodyCaptureEnabled = bodyCapture !== "none" && maxBodyBytes >= 1024;
  const enabled = rawTraceEnabledFromEnv() && shouldRecordRequestLogs(config) && bodyCaptureEnabled;
  return {
    deleteLocalAfterUpload: false,
    enabled,
    maxPartBytes: maxBodyBytes,
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


export type RawTraceRequestLogPolicy = {
  action: "discard";
  reason: "sampled";
} | {
  action: "enqueue";
  captureBodies: boolean;
  update: RequestLogRawTraceUpdateInput;
};


export function applyRawTraceRequestLogPolicy(
  config: AppConfig,
  input: RequestLogRawTraceUpdateInput
): RawTraceRequestLogPolicy {
  const successful = input.statusCode === undefined || (input.statusCode >= 200 && input.statusCode < 400);
  if (successful && !requestLogSampled(
    input.requestId,
    config.observability.requestLogSuccessSampleRate ?? 1
  )) {
    return { action: "discard", reason: "sampled" };
  }

  const bodyCapture = config.observability.requestLogBodyCapture ?? "all";
  const captureBodies = resolveRawTraceBodyLimit(config.observability.requestLogMaxBodyBytes) > 0 &&
    (bodyCapture === "all" || (bodyCapture === "errors" && !successful));
  return {
    action: "enqueue",
    captureBodies,
    update: captureBodies ? input : suppressRawTraceBodies(input)
  };
}


export function requestLogSampled(requestId: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let hash = 2166136261;
  for (let index = 0; index < requestId.length; index += 1) {
    hash ^= requestId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000 < rate;
}


function suppressRawTraceBodies(input: RequestLogRawTraceUpdateInput): RequestLogRawTraceUpdateInput {
  const requestSize = input.requestBodySizeBytes ??
    (input.requestBodyText === undefined ? undefined : Buffer.byteLength(input.requestBodyText));
  const responseSize = input.responseBodySizeBytes ??
    (input.responseBodyText === undefined ? undefined : Buffer.byteLength(input.responseBodyText));
  return {
    ...input,
    ...(requestSize === undefined ? {} : {
      requestBodySizeBytes: requestSize,
      requestBodyText: "",
      requestBodyTruncated: Boolean(input.requestBodyTruncated) || requestSize > 0
    }),
    ...(responseSize === undefined ? {} : {
      responseBodySizeBytes: responseSize,
      responseBodyText: "",
      responseBodyTruncated: Boolean(input.responseBodyTruncated) || responseSize > 0
    })
  };
}


function rawTraceEnabledFromEnv(): boolean {
  const value = (process.env.CCR_RAW_TRACE_ENABLED ?? process.env.CCR_RAW_TRACE ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}


export async function readRawTraceRequestLogBundle(
  manifest: Record<string, unknown>,
  spoolDirectory = RAW_TRACE_SPOOL_DIR
): Promise<RawTraceRequestLogBundle | undefined> {
  const requestId = stringValue(manifest.turnKey);
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  if (!requestId || parts.length === 0) {
    return undefined;
  }

  const [
    upstreamRequestMetadata,
    upstreamResponseMetadata,
    upstreamRequestBody,
    upstreamResponseStream,
    fallbackResponseBody
  ] = await Promise.all([
    readRawTraceJsonPart(parts, "upstream_request_metadata", spoolDirectory),
    readRawTraceJsonPart(parts, "upstream_response_metadata", spoolDirectory),
    readRawTracePart(parts, "upstream_request", spoolDirectory),
    readRawTracePart(parts, "response_stream", spoolDirectory),
    readRawTracePart(parts, "upstream_response", spoolDirectory)
  ]);
  const upstreamResponseBody = upstreamResponseStream ?? fallbackResponseBody;
  const target = isRecord(manifest.target) ? manifest.target : {};
  const rawUrl = stringValue(upstreamRequestMetadata?.url);
  const url = sanitizeUrlForLog(rawUrl);

  return {
    files: {
      cleanupDirectory: rawTraceBundleDirectory(parts, spoolDirectory),
      requestBody: upstreamRequestBody,
      responseBody: upstreamResponseBody
    },
    update: {
      method: stringValue(upstreamRequestMetadata?.method) || "POST",
      model: stringValue(target.model),
      path: pathFromUrl(url),
      provider: stringValue(target.providerName) || stringValue(target.provider),
      requestBodyContentType: upstreamRequestBody?.contentType,
      requestBodySizeBytes: upstreamRequestBody?.sizeBytes,
      requestBodyTruncated: upstreamRequestBody?.truncated,
      requestHeaders: headerRecordFromUnknown(upstreamRequestMetadata?.headers),
      requestId,
      isStream: upstreamResponseStream !== undefined,
      responseBodyContentType: upstreamResponseBody?.contentType,
      responseBodySizeBytes: upstreamResponseBody?.sizeBytes,
      responseBodyTruncated: upstreamResponseBody?.truncated,
      responseHeaders: headerRecordFromUnknown(upstreamResponseMetadata?.headers),
      statusCode: numberValue(upstreamResponseMetadata?.statusCode),
      url
    }
  };
}


async function readRawTraceJsonPart(
  parts: Record<string, unknown>[],
  partType: string,
  spoolDirectory: string
): Promise<Record<string, unknown> | undefined> {
  const part = await readRawTracePart(parts, partType, spoolDirectory);
  if (!part) {
    return undefined;
  }
  try {
    const text = await readFile(part.filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}


async function readRawTracePart(
  parts: Record<string, unknown>[],
  partType: string,
  spoolDirectory: string
): Promise<RawTracePartText | undefined> {
  const part = parts.find((candidate) => stringValue(candidate.partType) === partType);
  const filePath = stringValue(part?.filePath);
  if (!filePath || !isRawTraceSpoolFile(filePath, spoolDirectory)) {
    return undefined;
  }
  try {
    const storedBytes = (await stat(filePath)).size;
    return {
      contentType: stringValue(part?.contentType),
      filePath,
      sizeBytes: Math.max(storedBytes, numberValue(part?.originalBytes) ?? 0),
      truncated: storedBytes < (numberValue(part?.originalBytes) ?? storedBytes)
    };
  } catch (error) {
    console.warn(`[gateway] Failed to read raw trace part ${partType}: ${formatError(error)}`);
    return undefined;
  }
}


function rawTraceBundleDirectory(parts: Record<string, unknown>[], spoolDirectory: string): string | undefined {
  const filePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  return filePath && isRawTraceSpoolFile(filePath, spoolDirectory) ? dirname(filePath) : undefined;
}


export async function cleanupRawTraceBundle(
  manifest: Record<string, unknown>,
  spoolDirectory = RAW_TRACE_SPOOL_DIR
): Promise<void> {
  const parts = Array.isArray(manifest.parts)
    ? manifest.parts.filter((part): part is Record<string, unknown> => isRecord(part))
    : [];
  const firstFilePath = parts.map((part) => stringValue(part.filePath)).find((value): value is string => Boolean(value));
  if (!firstFilePath || !isRawTraceSpoolFile(firstFilePath, spoolDirectory)) {
    return;
  }
  try {
    await rm(dirname(firstFilePath), { force: true, recursive: true });
  } catch (error) {
    console.warn(`[gateway] Failed to clean raw trace bundle: ${formatError(error)}`);
  }
}


function isRawTraceSpoolFile(filePath: string, spoolDirectory: string): boolean {
  const spoolDir = pathResolve(spoolDirectory);
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
  let capturedBytes = 0;
  let totalBytes = 0;
  let truncated = false;

  return {
    append(chunk: Buffer | string) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (truncated) return;
      if (capturedBytes + buffer.byteLength > maxUsageCaptureBytes) {
        const remaining = Math.max(0, maxUsageCaptureBytes - capturedBytes);
        if (remaining > 0) {
          chunks.push(buffer.subarray(0, remaining));
          capturedBytes += remaining;
        }
        truncated = true;
        return;
      }
      chunks.push(buffer);
      capturedBytes += buffer.byteLength;
    },
    isTruncated() {
      return truncated;
    },
    read() {
      return Buffer.concat(chunks, capturedBytes).toString("utf8");
    },
    sizeBytes() {
      return totalBytes;
    }
  };
}
