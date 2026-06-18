import type { AppConfig, VirtualModelProfileConfig } from "../../shared/app";
import { normalizeRouteSelector } from "./claude-code-router-plugin";

type CodexAppRequestPreparationInput = {
  body?: Buffer;
  client?: string;
  config: AppConfig;
  headers: Record<string, string>;
  path: string;
};

type CodexAppRequestPreparation = {
  body?: Buffer;
  diagnostic: "model-rewritten";
  routedModel?: string;
};

export function prepareCodexAppRequest(input: CodexAppRequestPreparationInput): CodexAppRequestPreparation | undefined {
  if (!isOpenAIModelRequestPath(input.path) || !isCodexClient(input.client, input.headers)) {
    return undefined;
  }

  const body = parseJsonObjectSafe(input.body);
  if (!body) {
    return undefined;
  }

  const headerModel = normalizeRouteSelector(readHeader(input.headers, "x-target-model"));
  const bodyModel = normalizeRouteSelector(stringValue(body.model));
  const requestedModel = headerModel || bodyModel;
  if (!requestedModel) {
    return undefined;
  }

  const canonicalFusionModel = visibleFusionModelSelector(input.config, requestedModel);
  if (!canonicalFusionModel || canonicalFusionModel === requestedModel) {
    return undefined;
  }

  if (headerModel) {
    input.headers["x-target-model"] = canonicalFusionModel;
  }

  return {
    body: encodeJsonBody({
      ...body,
      model: canonicalFusionModel
    }),
    diagnostic: "model-rewritten",
    routedModel: canonicalFusionModel
  };
}

function visibleFusionModelSelector(config: AppConfig, selector: string): string | undefined {
  const normalized = fusionModelNameFromSelector(selector).toLowerCase();
  if (!normalized) {
    return undefined;
  }
  for (const profile of config.virtualModelProfiles ?? []) {
    if (!isVisibleVirtualModelProfile(profile)) {
      continue;
    }
    const match = virtualModelRawCatalogNames(profile).find((name) =>
      fusionModelNameFromSelector(name).toLowerCase() === normalized
    );
    const canonical = match ? fusionModelNameFromSelector(match) : "";
    if (canonical) {
      return `Fusion/${canonical}`;
    }
  }
  return undefined;
}

function isVisibleVirtualModelProfile(profile: VirtualModelProfileConfig): boolean {
  return profile.enabled !== false &&
    profile.materialization?.enabled !== false &&
    profile.materialization?.includeInGatewayModels !== false;
}

function virtualModelRawCatalogNames(profile: VirtualModelProfileConfig): string[] {
  const exactAliases = uniqueStrings(profile.match?.exactAliases ?? []);
  return exactAliases.length > 0 ? exactAliases : [profile.key || profile.displayName].filter(Boolean);
}

function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = "Fusion/";
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}

function isOpenAIModelRequestPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === "/v1/responses" ||
    normalized === "/responses" ||
    normalized.endsWith("/responses") ||
    normalized === "/v1/chat/completions" ||
    normalized === "/chat/completions" ||
    normalized.endsWith("/chat/completions");
}

function isCodexClient(client: string | undefined, headers: Record<string, string>): boolean {
  if (client?.toLowerCase().includes("codex")) {
    return true;
  }
  return Boolean(
    readHeader(headers, "x-codex-session-id") ||
    readHeader(headers, "x-codex-conversation-id") ||
    readHeader(headers, "x-codex-thread-id") ||
    readHeader(headers, "x-codex-account-id")
  );
}

function parseJsonObjectSafe(buffer: Buffer | undefined): Record<string, unknown> | undefined {
  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function encodeJsonBody(value: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function uniqueStrings(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
