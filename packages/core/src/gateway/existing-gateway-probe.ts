import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";
import { endpoint as gatewayEndpoint } from "@ccr/core/gateway/core-runtime/supervisor";
import { gatewayRuntimeConfigControlPath, gatewayRuntimeConfigRevision } from "@ccr/core/gateway/runtime-config-control";

export type ExistingCcrGatewayProbe =
  | { endpoint: string; reason?: string; state: "unavailable" }
  | { endpoint: string; status?: number; state: "not-ccr" }
  | { endpoint: string; message?: string; status: number; state: "unauthorized" }
  | { endpoint: string; status: number; state: "unusable" }
  | { apiKey?: string; endpoint: string; state: "usable" };

type ExistingGatewayHttpProbe = {
  payload?: unknown;
  reason?: string;
  status?: number;
};

const existingGatewayFetchAttempts = 3;
const runtimeConfigReloadTimeoutMs = 20_000;

export async function probeExistingCcrGateway(
  config: Pick<AppConfig, "APIKEY" | "APIKEYS" | "gateway">
): Promise<ExistingCcrGatewayProbe> {
  const endpoint = publicGatewayEndpoint(config);
  const health = await fetchExistingGateway(endpoint, "/health");
  let ccrGateway = isCcrGatewayHealth(health.payload);
  let root: ExistingGatewayHttpProbe | undefined;

  if (!ccrGateway) {
    root = await fetchExistingGateway(endpoint, "/");
    ccrGateway = isCcrGatewayRoot(root.payload);
  }
  if (!ccrGateway) {
    if (health.status === undefined && root?.status === undefined) {
      return { endpoint, reason: health.reason || root?.reason, state: "unavailable" };
    }
    return { endpoint, status: health.status ?? root?.status, state: "not-ccr" };
  }

  const candidates = existingGatewayApiKeyCandidates(config);
  if (candidates.length === 0) {
    return { endpoint, message: "No configured CCR API key is available.", status: 401, state: "unauthorized" };
  }

  let lastUnauthorized: ExistingGatewayHttpProbe | undefined;
  for (const apiKey of candidates) {
    const models = await fetchExistingGateway(endpoint, "/v1/models", {
      headers: {
        authorization: `Bearer ${apiKey.key}`,
        "user-agent": "Claude Code"
      }
    });
    if (models.status === 200) {
      return { apiKey: apiKey.key, endpoint, state: "usable" };
    }
    if (models.status === 401 || models.status === 403) {
      lastUnauthorized = models;
      continue;
    }
    return { endpoint, status: models.status ?? 0, state: "unusable" };
  }

  if (lastUnauthorized?.status === 401 || lastUnauthorized?.status === 403) {
    return {
      endpoint,
      message: readGatewayErrorMessage(lastUnauthorized.payload),
      status: lastUnauthorized.status,
      state: "unauthorized"
    };
  }

  return { endpoint, status: 0, state: "unusable" };
}

export function publicGatewayEndpoint(config: Pick<AppConfig, "gateway">): string {
  const host = probeGatewayHost(config.gateway.host);
  return gatewayEndpoint(host, config.gateway.port);
}

export async function reloadExistingCcrGatewayConfig(
  currentEndpoint: string,
  config: AppConfig,
  currentApiKey: string | undefined,
  options: { forceRestart?: boolean } = {}
): Promise<{ apiKey: string; endpoint: string }> {
  const configRevision = gatewayRuntimeConfigRevision(config);
  if (!configRevision) {
    throw new Error("Cannot determine the saved CCR configuration revision.");
  }
  const currentKey = currentApiKey?.trim();
  if (!currentKey) {
    throw new Error("The API key accepted by the externally managed CCR gateway is unavailable.");
  }

  if (options.forceRestart !== true) {
    const currentStatus = await fetchExistingGateway(currentEndpoint, gatewayRuntimeConfigControlPath, {
      headers: { authorization: `Bearer ${currentKey}` }
    }, 1, 700);
    if (currentStatus.status === 200 && isRecord(currentStatus.payload) &&
        currentStatus.payload.revision === configRevision) {
      return { apiKey: currentKey, endpoint: publicGatewayEndpoint(config) };
    }
  }

  const submission = await fetchExistingGateway(currentEndpoint, gatewayRuntimeConfigControlPath, {
    body: JSON.stringify({
      configRevision,
      forceRestart: options.forceRestart === true
    }),
    headers: {
      authorization: `Bearer ${currentKey}`,
      "content-type": "application/json"
    },
    method: "POST"
  });
  if (submission.status === 404) {
    throw new Error("The running CCR gateway does not support runtime configuration reloads. Restart that gateway process once, then try again.");
  }
  if (submission.status !== 200 && submission.status !== 202) {
    const detail = readGatewayErrorMessage(submission.payload) || submission.reason ||
      `HTTP ${submission.status ?? 0}`;
    throw new Error(`The running CCR gateway rejected the configuration reload request: ${detail}`);
  }

  const expectedEndpoint = publicGatewayEndpoint(config);
  const apiKeys = externalGatewayReloadApiKeys(config, currentKey);
  const deadline = Date.now() + runtimeConfigReloadTimeoutMs;
  let lastReason: string | undefined;
  while (Date.now() < deadline) {
    for (const apiKey of apiKeys) {
      const status = await fetchExistingGateway(expectedEndpoint, gatewayRuntimeConfigControlPath, {
        headers: { authorization: `Bearer ${apiKey}` }
      }, 1, 700);
      if (status.status === 200 && isRecord(status.payload)) {
        if (status.payload.revision === configRevision) {
          return { apiKey, endpoint: expectedEndpoint };
        }
        if (typeof status.payload.lastError === "string" && status.payload.lastError.trim()) {
          throw new Error(`The running CCR gateway could not apply the saved configuration: ${status.payload.lastError}`);
        }
      }
      if (status.status !== 401 && status.status !== 403) {
        lastReason = status.reason || (status.status ? `HTTP ${status.status}` : lastReason);
      }
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for the running CCR gateway to load configuration revision ${configRevision}${lastReason ? ` (${lastReason})` : ""}.`);
}

export function isAddressInUseMessage(message: string | undefined): boolean {
  return /\bEADDRINUSE\b/i.test(message || "");
}

async function fetchExistingGateway(
  endpoint: string,
  pathname: string,
  init: RequestInit = {},
  attempts = existingGatewayFetchAttempts,
  timeoutMs = 1200
): Promise<ExistingGatewayHttpProbe> {
  let reason: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(pathname, endpoint).toString(), {
        ...init,
        signal: controller.signal
      });
      return {
        payload: await readResponseJson(response),
        status: response.status
      };
    } catch (error) {
      reason = formatError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return { reason };
}

function externalGatewayReloadApiKeys(
  config: Pick<AppConfig, "APIKEY" | "APIKEYS">,
  currentApiKey: string
): string[] {
  const apiKeys = existingGatewayApiKeyCandidates(config).map((candidate) => candidate.key);
  if (!apiKeys.includes(currentApiKey)) {
    apiKeys.push(currentApiKey);
  }
  return apiKeys;
}

function existingGatewayApiKeyCandidates(config: Pick<AppConfig, "APIKEY" | "APIKEYS">): ApiKeyConfig[] {
  const candidates = [
    ...(Array.isArray(config.APIKEYS) ? config.APIKEYS : []),
    ...(config.APIKEY ? [{ createdAt: "", id: "legacy", key: config.APIKEY, name: "Legacy API Key" }] : [])
  ];
  const seen = new Set<string>();
  const result: ApiKeyConfig[] = [];
  for (const candidate of candidates) {
    const key = candidate.key?.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...candidate, key });
  }
  return result;
}

function isCcrGatewayHealth(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.status === "string" &&
    typeof value.core === "string";
}

function isCcrGatewayRoot(value: unknown): boolean {
  return isRecord(value) &&
    (value.name === "claude-code-router" ||
      value.plugin === "claude-code-router" ||
      (value.core === "next-ai-gateway" && Array.isArray(value.endpoints)));
}

function readGatewayErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const error = value.error;
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  if (typeof value.message === "string") {
    return value.message;
  }
  return undefined;
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function probeGatewayHost(host: string): string {
  if (!host || host === "0.0.0.0") {
    return "127.0.0.1";
  }
  if (host === "::") {
    return "::1";
  }
  return host;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
