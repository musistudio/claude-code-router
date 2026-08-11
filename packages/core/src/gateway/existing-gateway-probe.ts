import type { ApiKeyConfig, AppConfig } from "@ccr/core/contracts/app";

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
  return `http://${formatEndpointHost(host)}:${config.gateway.port}/`;
}

export function isAddressInUseMessage(message: string | undefined): boolean {
  return /\bEADDRINUSE\b/i.test(message || "");
}

async function fetchExistingGateway(
  endpoint: string,
  pathname: string,
  init: RequestInit = {}
): Promise<ExistingGatewayHttpProbe> {
  let reason: string | undefined;
  for (let attempt = 0; attempt < existingGatewayFetchAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
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

function formatEndpointHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
