import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppConfig, BotGatewayRuntimeConfig, ProfileConfig } from "../shared/app";
import { CONFIGDIR } from "./constants";

const requireFromHere = createRequire(__filename);

export function botGatewayProfileEnv(config: AppConfig, profile: ProfileConfig): Record<string, string> {
  const bot = normalizeBotGatewayForWebSocket(resolveBotGatewayConfig(config, profile));
  if (!bot?.enabled || !bot.platform || bot.platform === "none") {
    return disabledBotGatewayEnv();
  }

  const handoff = bot.handoff ?? {
    enabled: false,
    idleSeconds: 30,
    phoneBluetoothTargets: [],
    phoneWifiTargets: [],
    screenLock: true,
    userIdle: true
  };
  const stateDir = resolveBotGatewayStateDir(bot, profile);
  const env: Record<string, string> = {
    BOT_GATEWAY_STATE_DIR: stateDir,
    CCR_BOT_GATEWAY_ACK_EVENTS: boolEnv(bot.acknowledgeEvents),
    CCR_BOT_GATEWAY_ARGS_JSON: JSON.stringify(bot.args ?? []),
    CCR_BOT_GATEWAY_AUTH_TYPE: bot.authType ?? "",
    CCR_BOT_GATEWAY_AUTO_START_INTEGRATION: boolEnv(bot.autoStartIntegration),
    CCR_BOT_GATEWAY_COMMAND: bot.command ?? "",
    CCR_BOT_GATEWAY_CONFIG_JSON: JSON.stringify(bot.integrationConfig ?? {}),
    CCR_BOT_GATEWAY_CREATE_INTEGRATION: boolEnv(bot.createIntegration),
    CCR_BOT_GATEWAY_CREDENTIALS_JSON: JSON.stringify(bot.credentials ?? {}),
    CCR_BOT_GATEWAY_CWD: bot.cwd ?? "",
    CCR_BOT_GATEWAY_ENABLED: "true",
    CCR_BOT_GATEWAY_FORWARD_ALL_AGENT_MESSAGES: boolEnv(bot.forwardAllAgentMessages),
    CCR_BOT_GATEWAY_INTEGRATION_ID: bot.integrationId ?? "",
    CCR_BOT_GATEWAY_PLATFORM: bot.platform,
    CCR_BOT_GATEWAY_POLL_INTERVAL_MS: String(bot.pollIntervalMs ?? 2000),
    CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: String(bot.requestTimeoutMs ?? 600000),
    CCR_BOT_GATEWAY_SOURCE_DIR: bot.sourceDir ?? "",
    ...botGatewaySdkEnv(),
    CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: String(bot.startupTimeoutMs ?? 10000),
    CCR_BOT_GATEWAY_STATE_DIR: stateDir,
    CCR_BOT_GATEWAY_TENANT_ID: bot.tenantId ?? "ccr",
    CCR_BOT_HANDOFF_ENABLED: boolEnv(handoff.enabled),
    CCR_BOT_HANDOFF_IDLE_SECONDS: String(handoff.idleSeconds ?? 30),
    CCR_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS: (handoff.phoneBluetoothTargets ?? []).join("\n"),
    CCR_BOT_HANDOFF_PHONE_WIFI_TARGETS: (handoff.phoneWifiTargets ?? []).join("\n"),
    CCR_BOT_HANDOFF_SCREEN_LOCK: boolEnv(handoff.screenLock),
    CCR_BOT_HANDOFF_USER_IDLE: boolEnv(handoff.userIdle),
    CCR_BOT_PROFILE_ID: profile.id,
    CCR_BOT_PROFILE_NAME: profile.name,

    CODEXL_BOT_GATEWAY_ENABLED: "true",
    CODEXL_BOT_GATEWAY_FORWARD_ALL_CODEX_MESSAGES: boolEnv(bot.forwardAllAgentMessages),
    CODEXL_BOT_GATEWAY_INTEGRATION_ID: bot.integrationId ?? "",
    CODEXL_BOT_GATEWAY_PLATFORM: bot.platform,
    CODEXL_BOT_GATEWAY_STATE_DIR: stateDir,
    CODEXL_BOT_GATEWAY_TENANT_ID: bot.tenantId ?? "ccr",
    CODEXL_BOT_HANDOFF_ENABLED: boolEnv(handoff.enabled),
    CODEXL_BOT_HANDOFF_IDLE_SECONDS: String(handoff.idleSeconds ?? 30),
    CODEXL_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS: (handoff.phoneBluetoothTargets ?? []).join("\n"),
    CODEXL_BOT_HANDOFF_PHONE_WIFI_TARGETS: (handoff.phoneWifiTargets ?? []).join("\n"),
    CODEXL_BOT_HANDOFF_SCREEN_LOCK: boolEnv(handoff.screenLock),
    CODEXL_BOT_HANDOFF_USER_IDLE: boolEnv(handoff.userIdle)
  };

  if (bot.conversationRef) {
    env.CCR_BOT_GATEWAY_CONVERSATION_REF_JSON = JSON.stringify(bot.conversationRef);
  }

  return env;
}

function resolveBotGatewayConfig(config: AppConfig, profile: ProfileConfig): BotGatewayRuntimeConfig {
  const savedBot = profile.botConfigId
    ? (config.botConfigs ?? []).find((item) => item.id === profile.botConfigId)
    : undefined;
  return savedBot?.botGateway ?? profile.botGateway ?? config.botGateway;
}

function botGatewaySdkEnv(): Record<string, string> {
  const sdkModule = resolveBotGatewaySdkModule();
  return sdkModule ? { CCR_BOT_GATEWAY_SDK_MODULE: sdkModule } : {};
}

function resolveBotGatewaySdkModule(): string {
  try {
    return path.join(path.dirname(requireFromHere.resolve("@the-next-ai/bot-gateway-sdk/package.json")), "dist", "index.js");
  } catch {
    return "";
  }
}

function normalizeBotGatewayForWebSocket(bot: BotGatewayRuntimeConfig): BotGatewayRuntimeConfig {
  const platform = normalizeBotGatewayPlatform(bot.platform);
  return {
    ...bot,
    authType: normalizeBotGatewayAuthType(platform, bot.authType),
    credentials: sanitizeBotGatewayRecord(bot.credentials),
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, bot.integrationConfig),
    platform
  };
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
  if (["wechat", "weixin", "wx", "weixin-ilink", "weixin_ilink", "ilink"].includes(normalized)) {
    return "weixin-ilink";
  }
  if (["wecom", "wework", "wechat-work", "work-weixin", "enterprise-wechat"].includes(normalized)) {
    return "wecom";
  }
  return normalized || "none";
}

function normalizeBotGatewayAuthType(platform: string, value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!platform || platform === "none") {
    return "";
  }
  if (!normalized || normalized === "default" || normalized === "auto" || normalized === "webhook" || normalized === "webhook_secret" || normalized === "outgoing_webhook") {
    return defaultBotGatewayAuthType(platform);
  }
  if (normalized === "appsecret") {
    return "app_secret";
  }
  if (normalized === "bottoken" || normalized === "token") {
    return "bot_token";
  }
  if (normalized === "oauth" || normalized === "oauth_2") {
    return "oauth2";
  }
  if (["qr", "qr_login", "qrcode", "qr_code"].includes(normalized)) {
    return "qr_login";
  }
  return normalized;
}

function defaultBotGatewayAuthType(platform: string): string {
  if (platform === "weixin-ilink") {
    return "qr_login";
  }
  if (platform === "feishu" || platform === "dingtalk" || platform === "wecom") {
    return "app_secret";
  }
  if (platform === "slack" || platform === "discord" || platform === "telegram" || platform === "line") {
    return "bot_token";
  }
  return "";
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

function disabledBotGatewayEnv(): Record<string, string> {
  return {
    CCR_BOT_GATEWAY_ENABLED: "false",
    CODEXL_BOT_GATEWAY_ENABLED: "false"
  };
}

function resolveBotGatewayStateDir(bot: BotGatewayRuntimeConfig, profile: ProfileConfig): string {
  const configured = (bot.stateDir ?? "").trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const slug = sanitizePathSegment(profile.id || profile.name || profile.agent) || "default";
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
  return path.resolve(trimmed || ".");
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function boolEnv(value: boolean): string {
  return value ? "true" : "false";
}
