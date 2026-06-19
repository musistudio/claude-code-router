import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIGDIR } from "./constants";
import type {
  BotGatewayQrLoginCancelRequest,
  BotGatewayQrLoginCancelResult,
  BotGatewayQrLoginStartRequest,
  BotGatewayQrLoginStartResult,
  BotGatewayQrLoginWaitRequest,
  BotGatewayQrLoginWaitResult,
  BotGatewayRuntimeConfig
} from "../shared/app";

type BotGatewayClientWithRequest = {
  close?: () => Promise<void> | void;
  health: () => Promise<unknown>;
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type BotGatewaySdkModule = {
  bundledStdioPath?: () => string;
  createBotGatewayClient: (options?: unknown) => unknown;
};

type QrSession = {
  botConfigId: string;
  client: BotGatewayClientWithRequest;
  credentials: Record<string, unknown>;
  integrationConfig: Record<string, unknown>;
  integrationId: string;
  platform: string;
  stateDir: string;
  tenantId: string;
  timeoutMs: number;
};

const qrSessions = new Map<string, QrSession>();
let sdkPromise: Promise<BotGatewaySdkModule> | undefined;

export async function startBotGatewayQrLogin(
  request: BotGatewayQrLoginStartRequest
): Promise<BotGatewayQrLoginStartResult> {
  const savedConfig = request.config;
  const bot = normalizeBotGatewayForQr(savedConfig.botGateway);
  if (!bot.enabled || bot.platform !== "weixin-ilink" || bot.authType !== "qr_login") {
    throw new Error("微信扫码登录只支持微信平台的扫码认证方式。");
  }

  const stateDir = resolveBotGatewayStateDir(bot, savedConfig.id);
  mkdirSync(stateDir, { recursive: true });
  const client = await createQrClient(bot, stateDir);
  const timeoutMs = Math.max(1000, bot.requestTimeoutMs || 600000);
  let registered = false;
  try {
    await withTimeout(client.health(), Math.max(1000, bot.startupTimeoutMs || 10000), "Bot Gateway health check timed out.");

    const integrationId = await resolveWeixinQrIntegrationId(client, bot, timeoutMs);
    const rawStart = await botGatewayClientRequest(client, "auth.qr.start", {
      config: bot.integrationConfig,
      credentials: bot.credentials,
      force: request.force !== false,
      integrationId,
      platform: bot.platform,
      tenantId: bot.tenantId
    }, timeoutMs);
    const auth = unwrapGatewayResult(rawStart);
    const sessionId = stringValue(auth.sessionId);
    if (!sessionId) {
      throw new Error("Bot Gateway QR start response missing sessionId.");
    }

    const previous = qrSessions.get(sessionId);
    if (previous) {
      closeQrClient(previous.client);
    }
    qrSessions.set(sessionId, {
      botConfigId: savedConfig.id,
      client,
      credentials: bot.credentials,
      integrationConfig: bot.integrationConfig,
      integrationId,
      platform: bot.platform,
      stateDir,
      tenantId: bot.tenantId,
      timeoutMs
    });
    registered = true;

    const qrCodeUrl = qrCodeUrlFromAuth(auth);
    if (!qrCodeUrl) {
      throw new Error("Bot Gateway QR start response missing qrCodeUrl.");
    }

    return {
      botConfigId: savedConfig.id,
      expiresAt: stringValue(auth.expiresAt),
      integrationId,
      message: stringValue(auth.message),
      platform: bot.platform,
      qrCodeUrl,
      sessionId,
      stateDir,
      tenantId: bot.tenantId
    };
  } catch (error) {
    if (!registered) {
      closeQrClient(client);
    }
    throw error;
  }
}

export async function waitBotGatewayQrLogin(
  request: BotGatewayQrLoginWaitRequest
): Promise<BotGatewayQrLoginWaitResult> {
  const sessionId = request.sessionId.trim();
  const session = qrSessions.get(sessionId);
  if (!session) {
    throw new Error("微信扫码登录会话不存在，请重新生成二维码。");
  }

  const rawWait = await botGatewayClientRequest(session.client, "auth.qr.wait", {
    autoStart: true,
    config: session.integrationConfig,
    configOverride: {
      ...session.integrationConfig,
      transport: botGatewayWebSocketTransport(session.platform)
    },
    credentials: session.credentials,
    integrationId: session.integrationId,
    platform: session.platform,
    sessionId,
    tenantId: session.tenantId,
    timeoutMs: Math.max(1000, request.timeoutMs || 5000),
    verifyCode: request.verifyCode?.trim() || undefined
  }, session.timeoutMs);
  const auth = unwrapGatewayResult(rawWait);
  const status = stringValue(auth.status) || "pending";
  const confirmed = status === "confirmed";
  const result = {
    confirmed,
    integrationId: session.integrationId,
    message: stringValue(auth.message),
    sessionId,
    stateDir: session.stateDir,
    status,
    tenantId: session.tenantId
  };

  if (isTerminalQrLoginStatus(status)) {
    qrSessions.delete(sessionId);
    closeQrClient(session.client);
  }

  return result;
}

export function cancelBotGatewayQrLogin(
  request: BotGatewayQrLoginCancelRequest
): BotGatewayQrLoginCancelResult {
  const sessionId = request.sessionId.trim();
  const session = qrSessions.get(sessionId);
  if (session) {
    qrSessions.delete(sessionId);
    closeQrClient(session.client);
  }
  return { canceled: Boolean(session) };
}

async function createQrClient(bot: BotGatewayRuntimeConfig, stateDir: string): Promise<BotGatewayClientWithRequest> {
  const sdk = await loadBotGatewaySdk();
  const command = resolveBotGatewayCommand(sdk, bot);
  const client = sdk.createBotGatewayClient({
    transport: "stdio",
    env: {
      ...process.env,
      BOT_GATEWAY_STATE_DIR: stateDir,
      CODEXL_HOME: CONFIGDIR
    },
    ...command
  }) as BotGatewayClientWithRequest;
  if (!client || typeof client.request !== "function" || typeof client.health !== "function") {
    throw new Error("Bot Gateway SDK client does not expose request().");
  }
  return client;
}

function resolveBotGatewayCommand(sdk: BotGatewaySdkModule, bot: BotGatewayRuntimeConfig): { args?: string[]; command: string; cwd?: string } | undefined {
  if (bot.command) {
    return {
      args: bot.args,
      command: resolveUserPath(bot.command),
      cwd: bot.cwd ? resolveUserPath(bot.cwd) : process.cwd()
    };
  }
  if (typeof sdk.bundledStdioPath !== "function") {
    return undefined;
  }
  const bundledPath = sdk.bundledStdioPath();
  return {
    args: [sanitizedBotGatewayStdioRunnerPath(bundledPath)],
    command: process.execPath,
    cwd: path.dirname(bundledPath)
  };
}

function sanitizedBotGatewayStdioRunnerPath(sourcePath: string): string {
  const source = readFileSync(sourcePath, "utf8");
  const normalized = normalizeDuplicateShebangs(source);
  if (normalized === source) {
    return sourcePath;
  }

  const targetDir = path.join(CONFIGDIR, "bot-gateway", "runners");
  const targetPath = path.join(targetDir, "bot-gateway-stdio.mjs");
  mkdirSync(targetDir, { recursive: true });
  if (!existsSync(targetPath) || readFileSync(targetPath, "utf8") !== normalized) {
    writeFileSync(targetPath, normalized);
  }
  return targetPath;
}

function normalizeDuplicateShebangs(source: string): string {
  const lines = source.split("\n");
  if (!lines[0]?.startsWith("#!")) {
    return source;
  }
  let index = 1;
  while (lines[index]?.startsWith("#!")) {
    index += 1;
  }
  return [lines[0], ...lines.slice(index)].join("\n");
}

async function loadBotGatewaySdk(): Promise<BotGatewaySdkModule> {
  if (!sdkPromise) {
    sdkPromise = importBotGatewaySdk();
  }
  return sdkPromise;
}

async function importBotGatewaySdk(): Promise<BotGatewaySdkModule> {
  const candidates = [
    process.env.CCR_BOT_GATEWAY_SDK_MODULE,
    "@the-next-ai/bot-gateway-sdk"
  ].filter((value): value is string => Boolean(value?.trim()));
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const sdk = await import(botGatewaySdkImportSpecifier(candidate));
      if (sdk && typeof sdk.createBotGatewayClient === "function") {
        return sdk as BotGatewaySdkModule;
      }
      errors.push(`${candidate}: missing createBotGatewayClient export`);
    } catch (error) {
      errors.push(`${candidate}: ${formatError(error)}`);
    }
  }
  throw new Error(`Unable to load @the-next-ai/bot-gateway-sdk. ${errors.join("; ")}`);
}

function botGatewaySdkImportSpecifier(value: string): string {
  const trimmed = value.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  if (path.isAbsolute(trimmed)) {
    return pathToFileURL(trimmed).href;
  }
  return trimmed;
}

async function resolveWeixinQrIntegrationId(
  client: BotGatewayClientWithRequest,
  bot: BotGatewayRuntimeConfig,
  timeoutMs: number
): Promise<string> {
  const requested = bot.integrationId.trim();
  const raw = await botGatewayClientRequest(client, "integrations.list", {}, timeoutMs).catch(() => ({}));
  const result = unwrapGatewayResult(raw);
  const integrations = Array.isArray(result.integrations) ? result.integrations.filter(isRecord) : [];
  const requestedIntegration = integrations.find((integration) => stringValue(integration.id) === requested);
  if (requestedIntegration) {
    if (stringValue(requestedIntegration.platform) === "weixin-ilink") {
      return requested;
    }
  } else if (requested) {
    return requested;
  }

  const tenant = bot.tenantId.trim();
  const tenantIntegration = integrations.find((integration) =>
    stringValue(integration.platform) === "weixin-ilink" &&
    stringValue(integration.tenantId).toLowerCase() === tenant.toLowerCase()
  );
  if (tenantIntegration) {
    const id = stringValue(tenantIntegration.id);
    if (id) return id;
  }

  const platformIntegration = integrations.find((integration) => stringValue(integration.platform) === "weixin-ilink");
  if (platformIntegration) {
    const id = stringValue(platformIntegration.id);
    if (id) return id;
  }

  return requested || safePathSegment(`weixin-ilink-${tenant || "ccr"}`);
}

function normalizeBotGatewayForQr(bot: BotGatewayRuntimeConfig): BotGatewayRuntimeConfig {
  const platform = normalizeBotGatewayPlatform(bot.platform);
  const authType = normalizeBotGatewayAuthType(platform, bot.authType);
  return {
    ...bot,
    authType,
    credentials: sanitizeBotGatewayRecord(bot.credentials),
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, bot.integrationConfig),
    platform,
    tenantId: bot.tenantId.trim() || "ccr"
  };
}

function websocketBotGatewayIntegrationConfig(platform: string, value: Record<string, unknown>): Record<string, unknown> {
  const config = sanitizeBotGatewayRecord(value);
  delete config.transport;
  delete config.sendMode;
  const transport = botGatewayWebSocketTransport(platform);
  return transport ? { ...config, transport } : config;
}

function botGatewayWebSocketTransport(platform: string): string {
  if (!platform || platform === "none") {
    return "";
  }
  return platform === "slack" ? "socket" : "websocket";
}

function normalizeBotGatewayPlatform(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "disabled") {
    return "none";
  }
  if (normalized === "lark") {
    return "feishu";
  }
  if (normalized === "dingding") {
    return "dingtalk";
  }
  if (normalized === "wechat" || normalized === "weixin-work" || normalized === "wework") {
    return "wecom";
  }
  return normalized;
}

function normalizeBotGatewayAuthType(platform: string, value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
  const aliases: Record<string, string> = {
    qr: "qr_login",
    qr_code: "qr_login",
    qr_login: "qr_login",
    qrcode: "qr_login",
    token: "bot_token"
  };
  const authType = aliases[normalized] ?? normalized;
  if (platform === "weixin-ilink") {
    return authType || "qr_login";
  }
  return authType;
}

function sanitizeBotGatewayRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim() || isWebhookRelatedBotGatewayKey(key)) {
      continue;
    }
    result[key] = rawValue;
  }
  return result;
}

function isWebhookRelatedBotGatewayKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, "");
  return normalized.includes("webhook") || normalized === "sendmode";
}

function unwrapGatewayResult(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const result = value.result;
  return isRecord(result) ? result : value;
}

function qrCodeUrlFromAuth(auth: Record<string, unknown>): string {
  const direct = stringValue(auth.qrCodeUrl) ||
    stringValue(auth.qrCodeURL) ||
    stringValue(auth.qrcodeUrl) ||
    stringValue(auth.qrcodeURL) ||
    stringValue(auth.qrcode_img_content) ||
    stringValue(auth.url);
  if (direct) {
    return direct;
  }
  const raw = auth.raw;
  if (isRecord(raw)) {
    return stringValue(raw.qrCodeUrl) ||
      stringValue(raw.qrCodeURL) ||
      stringValue(raw.qrcodeUrl) ||
      stringValue(raw.qrcodeURL) ||
      stringValue(raw.qrcode_img_content) ||
      stringValue(raw.url);
  }
  return "";
}

function botGatewayClientRequest(
  client: BotGatewayClientWithRequest,
  method: string,
  params: unknown,
  timeoutMs: number
): Promise<unknown> {
  return withTimeout(client.request(method, params), timeoutMs, `Bot Gateway request timed out: ${method}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  const timeout = Math.max(1000, timeoutMs || 30000);
  let timer: NodeJS.Timeout | undefined;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function closeQrClient(client: BotGatewayClientWithRequest): void {
  try {
    const result = client.close?.();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Best-effort cleanup for a short-lived QR login helper process.
  }
}

function resolveBotGatewayStateDir(bot: BotGatewayRuntimeConfig, configId: string): string {
  const configured = bot.stateDir.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const slug = safePathSegment(configId || bot.integrationId || bot.tenantId) || "default";
  return path.join(CONFIGDIR, "bot-gateway", slug);
}

function resolveUserPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function isTerminalQrLoginStatus(status: string): boolean {
  return ["already_bound", "confirmed", "expired", "failed"].includes(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
