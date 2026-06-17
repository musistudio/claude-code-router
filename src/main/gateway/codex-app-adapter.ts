import type { AppConfig, GatewayProviderConfig } from "../../shared/app";
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
  diagnostic: "model-remembered" | "model-rewritten";
  routedModel?: string;
};

type RememberedCodexModel = {
  expiresAt: number;
  model: string;
  providerName?: string;
};

const codexModelRewriteSessionTtlMs = 6 * 60 * 60 * 1000;
const rememberedCodexModels = new Map<string, RememberedCodexModel>();

export function prepareCodexAppRequest(input: CodexAppRequestPreparationInput): CodexAppRequestPreparation | undefined {
  if (!isOpenAIResponsesPath(input.path) || !isCodexClient(input.client, input.headers)) {
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

  const sessionKeys = codexSessionKeys(input.headers, body);
  const provider = providerForModelSelector(input.config, requestedModel);
  if (provider && isRememberableGatewayModel(requestedModel)) {
    rememberCodexModel(sessionKeys, {
      expiresAt: Date.now() + codexModelRewriteSessionTtlMs,
      model: requestedModel,
      providerName: provider.name
    });
    return {
      diagnostic: "model-remembered"
    };
  }

  if (!isCodexInternalModel(requestedModel)) {
    return undefined;
  }

  const remembered = findRememberedCodexModel(sessionKeys);
  if (!remembered || remembered.model === requestedModel) {
    return undefined;
  }

  const nextBody = {
    ...body,
    model: remembered.model
  };
  if (headerModel) {
    input.headers["x-target-model"] = remembered.model;
  }

  return {
    body: Buffer.from(`${JSON.stringify(nextBody)}\n`, "utf8"),
    diagnostic: "model-rewritten",
    routedModel: remembered.model
  };
}

function rememberCodexModel(keys: string[], value: RememberedCodexModel): void {
  pruneRememberedCodexModels();
  for (const key of keys) {
    rememberedCodexModels.set(key, value);
  }
}

function findRememberedCodexModel(keys: string[]): RememberedCodexModel | undefined {
  pruneRememberedCodexModels();
  for (const key of keys) {
    const value = rememberedCodexModels.get(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function pruneRememberedCodexModels(): void {
  const now = Date.now();
  for (const [key, value] of rememberedCodexModels) {
    if (value.expiresAt <= now) {
      rememberedCodexModels.delete(key);
    }
  }
}

function codexSessionKeys(headers: Record<string, string>, body: Record<string, unknown>): string[] {
  const accountId =
    readHeader(headers, "x-codex-account-id") ||
    stringValue(body.account_id) ||
    stringValue(body.accountId);
  const sessionId =
    readHeader(headers, "x-codex-session-id") ||
    readHeader(headers, "x-codex-conversation-id") ||
    readHeader(headers, "x-codex-thread-id") ||
    readHeader(headers, "x-agent-session-id") ||
    stringValue(body.session_id) ||
    stringValue(body.sessionId) ||
    stringValue(body.conversation_id) ||
    stringValue(body.conversationId);
  const keys: string[] = [];
  if (accountId && sessionId) {
    keys.push(`codex:${accountId}:${sessionId}`);
  }
  if (sessionId) {
    keys.push(`codex:session:${sessionId}`);
  }
  if (accountId) {
    keys.push(`codex:account:${accountId}`);
  }
  keys.push("codex");
  return [...new Set(keys)];
}

function providerForModelSelector(config: AppConfig, selector: string): GatewayProviderConfig | undefined {
  const providerName = selector.split("/", 1)[0]?.trim().toLowerCase();
  if (!providerName || providerName === selector.toLowerCase()) {
    return undefined;
  }
  return config.Providers.find((provider) =>
    provider.name.trim().toLowerCase() === providerName ||
    provider.provider?.trim().toLowerCase() === providerName
  );
}

function isRememberableGatewayModel(model: string): boolean {
  const slashIndex = model.indexOf("/");
  return slashIndex > 0 && slashIndex < model.length - 1;
}

function isCodexInternalModel(model: string): boolean {
  if (model.includes("/")) {
    return false;
  }
  const normalized = model.trim().toLowerCase();
  return /^gpt(?:[-_]|$)/.test(normalized) || /^o\d(?:[-_]|$)/.test(normalized);
}

function isOpenAIResponsesPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === "/v1/responses" || normalized === "/responses" || normalized.endsWith("/responses");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
