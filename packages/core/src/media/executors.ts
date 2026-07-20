import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { closeSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { GatewayMediaProtocol } from "@ccr/core/contracts/app";
import type { ImageEditRequest, ImageGenerateRequest, MediaExecutionContext, MediaExecutionResult, VideoGenerateRequest } from "@ccr/core/media/contracts";
import { detectMediaType } from "@ccr/core/media/storage";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";

const maxApiArtifactBytes = 250 * 1024 * 1024;
const maxArtifactRedirects = 5;

export type GatewayMediaTarget = {
  model: string;
  protocol: GatewayMediaProtocol;
  providerBaseUrl: string;
  providerName: string;
  providerSelector: string;
};

export type GatewayMediaTransport = {
  authHeader?: string;
  authToken?: string;
  baseUrl: string;
};

export class GatewayMediaExecutor {
  constructor(
    private readonly target: GatewayMediaTarget,
    private readonly transport: GatewayMediaTransport
  ) {}

  async imageGenerate(request: ImageGenerateRequest, context: MediaExecutionContext): Promise<MediaExecutionResult> {
    const payload = await this.requestJson("images/generations", {
      aspect_ratio: request.aspectRatio,
      model: this.target.model,
      prompt: request.prompt,
      response_format: "url"
    }, context.signal, context.job.id);
    return parseImageResponse(payload);
  }

  async imageEdit(request: ImageEditRequest, context: MediaExecutionContext): Promise<MediaExecutionResult> {
    const images = request.images.map((url) => ({ type: "image_url", url: localImageDataUrl(url) }));
    const payload = await this.requestJson("images/edits", {
      aspect_ratio: request.aspectRatio,
      ...(images.length === 1 ? { image: images[0] } : { images }),
      model: this.target.model,
      prompt: request.prompt,
      response_format: "url"
    }, context.signal, context.job.id);
    return parseImageResponse(payload);
  }

  async videoGenerate(request: VideoGenerateRequest, context: MediaExecutionContext): Promise<MediaExecutionResult> {
    const payload = await this.requestJson("videos/generations", {
      aspect_ratio: request.aspectRatio,
      duration: request.duration,
      image: request.images.length === 1 ? { url: localImageDataUrl(request.images[0]) } : undefined,
      model: this.target.model,
      prompt: request.prompt,
      reference_images: request.images.length > 1 ? request.images.map((image) => ({ url: localImageDataUrl(image) })) : undefined,
      resolution: request.resolution
    }, context.signal, context.job.id);
    const requestId = readString(payload, "request_id", "id");
    if (!requestId) throw mediaError("invalid_api_response", `${this.target.providerName} video API did not return a request id.`, false);
    context.onRemoteRequestId(requestId);
    return this.resumeVideo(requestId, context.signal);
  }

  async resumeVideo(requestId: string, signal: AbortSignal): Promise<MediaExecutionResult> {
    while (true) {
      let payload: Record<string, unknown>;
      try {
        payload = await this.getJson(`videos/${encodeURIComponent(requestId)}`, signal);
      } catch (error) {
        if (!isRetryableError(error) || signal.aborted) throw error;
        await delay(2000, undefined, { signal });
        continue;
      }
      const status = readString(payload, "status")?.toLowerCase();
      if (status === "done" || status === "completed" || status === "succeeded") {
        const url = readNestedString(payload, ["video", "url"]) ?? readString(payload, "url");
        if (!url) throw mediaError("invalid_api_response", `${this.target.providerName} video API completed without an artifact URL.`, false);
        return { fileName: `${requestId}.mp4`, remoteUrl: url, usage: readUsage(payload) };
      }
      if (status === "failed" || status === "expired" || status === "canceled" || status === "cancelled") {
        const message = readNestedString(payload, ["error", "message"]) ?? readString(payload, "message") ?? `Video generation ${status}.`;
        throw mediaError(`video_${status}`, message, status === "failed");
      }
      await delay(2000, undefined, { signal });
    }
  }

  async download(result: MediaExecutionResult, signal: AbortSignal): Promise<MediaExecutionResult> {
    if (!result.remoteUrl) throw new Error("Remote media result has no URL.");
    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const candidate = await fetchMediaArtifact(result.remoteUrl, this.target.providerBaseUrl, signal);
        if (candidate.ok || (candidate.status < 500 && candidate.status !== 408 && candidate.status !== 429)) {
          response = candidate;
          break;
        }
        lastError = mediaError("artifact_download_failed", `Failed to download generated artifact: HTTP ${candidate.status}.`, true);
        await candidate.body?.cancel();
      } catch (error) {
        if (isExplicitlyNonRetryableError(error)) throw error;
        lastError = error;
      }
      if (attempt < 3) await delay(attempt * 500, undefined, { signal });
    }
    if (!response) throw lastError ?? mediaError("artifact_download_failed", "Failed to download generated artifact.", true);
    if (!response.ok) throw mediaError("artifact_download_failed", `Failed to download generated artifact: HTTP ${response.status}.`, true);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxApiArtifactBytes) throw mediaError("artifact_too_large", "Generated artifact exceeds the 250 MB limit.", false);
    if (!response.body) throw mediaError("artifact_download_failed", "Generated artifact response has no body.", true);
    const temporary = path.join(os.tmpdir(), `ccr-media-${randomUUID()}.download`);
    const file = openSync(temporary, "wx", 0o600);
    let size = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const buffer = Buffer.from(chunk.value);
        size += buffer.byteLength;
        if (size > maxApiArtifactBytes) {
          await reader.cancel();
          throw mediaError("artifact_too_large", "Generated artifact exceeds the 250 MB limit.", false);
        }
        writeSync(file, buffer);
      }
    } catch (error) {
      closeSync(file);
      rmSync(temporary, { force: true });
      throw error;
    }
    closeSync(file);
    return {
      contentType: response.headers.get("content-type") ?? undefined,
      fileName: result.fileName,
      filePath: temporary,
      usage: result.usage
    };
  }

  private async requestJson(
    pathname: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    const response = await fetchWithSystemProxy(this.url(pathname), {
      body: JSON.stringify(stripUndefined(body)),
      headers: this.requestHeaders(true, idempotencyKey),
      method: "POST",
      signal
    });
    return readApiResponse(response);
  }

  private async getJson(pathname: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetchWithSystemProxy(this.url(pathname), {
      headers: this.requestHeaders(false),
      signal
    });
    return readApiResponse(response);
  }

  private url(pathname: string): string {
    const gatewayRoot = this.transport.baseUrl.replace(/\/+$/g, "").replace(/\/v1$/i, "");
    return `${gatewayRoot}/v1/${pathname.replace(/^\/+/, "")}`;
  }

  private requestHeaders(jsonBody: boolean, idempotencyKey?: string): Record<string, string> {
    return {
      accept: "application/json",
      ...(this.transport.authHeader && this.transport.authToken
        ? { [this.transport.authHeader]: this.transport.authToken }
        : {}),
      ...(jsonBody ? { "content-type": "application/json" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      "x-target-model": this.target.model,
      "x-target-provider": this.target.providerSelector
    };
  }
}

async function fetchMediaArtifact(value: string, providerBaseUrl: string, signal: AbortSignal): Promise<Response> {
  let current = parseArtifactUrl(value);
  for (let redirectCount = 0; redirectCount <= maxArtifactRedirects; redirectCount += 1) {
    await assertArtifactUrlAllowed(current, providerBaseUrl);
    const response = await fetchWithSystemProxy(current, { redirect: "manual", signal });
    if (!isRedirectStatus(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      throw mediaError("artifact_redirect_invalid", "Generated artifact redirect did not include a location.", false);
    }
    if (redirectCount === maxArtifactRedirects) {
      throw mediaError("artifact_redirect_limit", `Generated artifact exceeded ${maxArtifactRedirects} redirects.`, false);
    }
    try {
      current = new URL(location, current);
    } catch {
      throw mediaError("artifact_redirect_invalid", "Generated artifact redirect contained an invalid URL.", false);
    }
  }
  throw mediaError("artifact_redirect_limit", `Generated artifact exceeded ${maxArtifactRedirects} redirects.`, false);
}

function parseArtifactUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw mediaError("artifact_url_invalid", "Generated artifact URL is invalid.", false);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash) {
    throw mediaError("artifact_url_invalid", "Generated artifact URL must be an HTTP(S) URL without credentials or fragments.", false);
  }
  return url;
}

async function assertArtifactUrlAllowed(url: URL, providerBaseUrl: string): Promise<void> {
  const providerUrl = parseArtifactUrl(providerBaseUrl);
  const candidateHost = normalizeHostname(url.hostname);
  const providerHost = normalizeHostname(providerUrl.hostname);
  if (url.origin === providerUrl.origin) return;
  const candidateAddresses = await resolveHostAddresses(candidateHost);
  if (!candidateAddresses.some(isRestrictedIpAddress)) return;

  if (url.protocol !== providerUrl.protocol || effectivePort(url) !== effectivePort(providerUrl)) {
    throw artifactUrlNotAllowedError();
  }
  const providerAddresses = await resolveHostAddresses(providerHost);
  if (candidateAddresses.every(isLoopbackIpAddress) && providerAddresses.some(isLoopbackIpAddress)) return;
  const providerAddressSet = new Set(providerAddresses.map(normalizeIpAddress));
  if (candidateAddresses.every((address) => providerAddressSet.has(normalizeIpAddress(address)))) return;
  throw artifactUrlNotAllowedError();
}

function artifactUrlNotAllowedError(): Error & { code: string; retryable: boolean } {
  return mediaError(
    "artifact_url_not_allowed",
    "Generated artifact URL resolves to a private or non-public address outside the configured provider origin.",
    false
  );
}

function effectivePort(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [normalizeIpAddress(hostname)];
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    const unique = [...new Set(addresses.map((item) => normalizeIpAddress(item.address)).filter(Boolean))];
    if (unique.length) return unique;
  } catch {
    // Surface a bounded media error instead of letting an unchecked proxy-side
    // DNS resolution bypass the private-network policy.
  }
  throw mediaError("artifact_host_unresolvable", "Generated artifact host could not be resolved safely.", false);
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function normalizeIpAddress(value: string): string {
  return normalizeHostname(value).split("%", 1)[0];
}

function isRestrictedIpAddress(value: string): boolean {
  const address = normalizeIpAddress(value);
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0) ||
      first >= 224;
  }
  if (isIP(address) === 6) {
    return address === "::" ||
      address === "::1" ||
      address.startsWith("::ffff:") ||
      /^(?:fc|fd)/.test(address) ||
      /^fe[89ab]/.test(address) ||
      address.startsWith("ff") ||
      address.startsWith("2001:db8:");
  }
  return true;
}

function isLoopbackIpAddress(value: string): boolean {
  const address = normalizeIpAddress(value);
  return address === "::1" || (isIP(address) === 4 && address.startsWith("127."));
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export function mediaError(code: string, message: string, retryable: boolean): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), { code, retryable });
}

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const message = sanitizeRemoteError(coreGatewayErrorMessage(record) ?? `Media gateway request failed with HTTP ${response.status}.`);
    throw mediaError(`gateway_http_${response.status}`, message, response.status === 408 || response.status === 429 || response.status >= 500);
  }
  if (!isRecord(payload)) throw mediaError("invalid_api_response", "Media gateway returned a non-object response.", false);
  return payload;
}

function parseImageResponse(payload: Record<string, unknown>): MediaExecutionResult {
  const first = Array.isArray(payload.data) && isRecord(payload.data[0]) ? payload.data[0] : payload;
  const url = readString(first, "url");
  if (url) return { fileName: "generated-image", remoteUrl: url, usage: readUsage(payload) };
  const base64 = readString(first, "b64_json");
  if (base64) {
    const temporary = path.join(os.tmpdir(), `ccr-media-${randomUUID()}.image`);
    writeFileSync(temporary, Buffer.from(base64, "base64"), { mode: 0o600 });
    return { contentType: readString(first, "mime_type"), fileName: "generated-image", filePath: temporary, usage: readUsage(payload) };
  }
  throw mediaError("invalid_api_response", "Image API completed without an image URL or payload.", false);
}

function localImageDataUrl(file: string): string {
  const type = detectMediaType(file).mimeType;
  if (!type?.startsWith("image/")) throw mediaError("invalid_input_media", `Input is not a supported image: ${file}`, false);
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
}

function isRetryableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "retryable" in error && error.retryable === true);
}

function isExplicitlyNonRetryableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "retryable" in error && error.retryable === false);
}

function readUsage(payload: Record<string, unknown>): { costUsdTicks?: number } | undefined {
  const usage = isRecord(payload.usage) ? payload.usage : undefined;
  const costUsdTicks = usage?.cost_in_usd_ticks;
  return typeof costUsdTicks === "number" && Number.isFinite(costUsdTicks) ? { costUsdTicks } : undefined;
}

function sanitizeRemoteError(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]").trim().slice(0, 2000);
}

function coreGatewayErrorMessage(payload: Record<string, unknown>): string | undefined {
  const error = isRecord(payload.error) ? payload.error : undefined;
  const fallback = readString(error ?? payload, "message") ?? readString(payload, "message");
  const attempts = Array.isArray(error?.attempts) ? error.attempts.filter(isRecord) : [];
  const failures = attempts
    .map(formatGatewayAttempt)
    .filter((value): value is string => Boolean(value));
  if (!failures.length) return fallback;
  return [...new Set(failures)].slice(0, 3).join("; ");
}

function formatGatewayAttempt(attempt: Record<string, unknown>): string | undefined {
  const message = readString(attempt, "message");
  const details = isRecord(attempt.details) ? attempt.details : undefined;
  const detail = details ? readString(details, "message", "error", "raw", "code") : undefined;
  const core = message && detail && !message.includes(detail)
    ? `${message}: ${detail}`
    : message ?? detail;
  if (!core) return undefined;
  const provider = readString(attempt, "provider_name", "provider");
  const stage = readString(attempt, "stage");
  const status = typeof attempt.status === "number" && Number.isFinite(attempt.status) ? `HTTP ${attempt.status}` : undefined;
  const context = [provider, stage, status].filter(Boolean).join(", ");
  return context ? `${core} (${context})` : core;
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  return undefined;
}

function readNestedString(record: Record<string, unknown>, keys: string[]): string | undefined {
  let value: unknown = record;
  for (const key of keys) value = isRecord(value) ? value[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
