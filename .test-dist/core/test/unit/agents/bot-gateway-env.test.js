"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/unit/agents/bot-gateway-env.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/agents/bot-gateway/env.ts
var import_node_os2 = __toESM(require("node:os"));
var import_node_module = require("node:module");
var import_node_fs2 = require("node:fs");
var import_node_path4 = __toESM(require("node:path"));

// packages/core/src/config/constants.ts
var import_node_path3 = __toESM(require("node:path"));

// packages/core/src/runtime/app-paths.ts
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var APP_NAME = "Claude Code Router";
var APP_STORAGE_NAME = "claude-code-router";
var LEGACY_CONFIGDIR = import_node_path.default.join(import_node_os.default.homedir(), ".claude-code-router");
var homeDirEnv = "CCR_INTERNAL_HOME_DIR";
var appDataDirEnv = "CCR_INTERNAL_APP_DATA_DIR";
var userDataDirEnv = "CCR_INTERNAL_USER_DATA_DIR";
function resolveRuntimeAppPath(name) {
  const configured = readConfiguredPath(name);
  if (configured) {
    return configured;
  }
  if (name === "home") {
    return import_node_os.default.homedir();
  }
  if (name === "appData") {
    return fallbackAppDataDir();
  }
  return fallbackUserDataDir();
}
function resolveRuntimeConfigDir() {
  if (process.platform === "win32") {
    return import_node_path.default.join(resolveRuntimeAppPath("appData"), APP_STORAGE_NAME);
  }
  return import_node_path.default.join(resolveRuntimeAppPath("home"), `.${APP_STORAGE_NAME}`);
}
function resolveRuntimeDataDir() {
  const configured = readConfiguredPath("userData");
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    return resolveRuntimeConfigDir();
  }
  return import_node_path.default.join(resolveRuntimeConfigDir(), "app-data");
}
function readConfiguredPath(name) {
  const key = name === "home" ? homeDirEnv : name === "appData" ? appDataDirEnv : userDataDirEnv;
  const value = process.env[key]?.trim();
  return value || void 0;
}
function fallbackAppDataDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || process.env.LOCALAPPDATA || (process.env.USERPROFILE ? import_node_path.default.join(process.env.USERPROFILE, "AppData", "Roaming") : import_node_path.default.join(import_node_os.default.homedir(), "AppData", "Roaming"));
  }
  return process.env.XDG_CONFIG_HOME || import_node_path.default.join(import_node_os.default.homedir(), ".config");
}
function fallbackUserDataDir() {
  return resolveRuntimeDataDir();
}

// packages/core/src/storage/migration.ts
var import_node_fs = require("node:fs");
var import_node_path2 = __toESM(require("node:path"));
function copyMissingDirectoryContents(source, target, label) {
  if (!source || !target || sameFilesystemPath(source, target) || !(0, import_node_fs.existsSync)(source)) {
    return;
  }
  try {
    (0, import_node_fs.mkdirSync)(target, { recursive: true });
    (0, import_node_fs.cpSync)(source, target, { errorOnExist: false, force: false, recursive: true });
  } catch (error) {
    console.warn(`Failed to migrate ${label} from ${source} to ${target}: ${formatError(error)}`);
  }
}
function sameFilesystemPath(left, right) {
  return import_node_path2.default.resolve(left).toLowerCase() === import_node_path2.default.resolve(right).toLowerCase();
}
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

// packages/core/src/config/constants.ts
var LEGACY_CONFIG_FILE = import_node_path3.default.join(LEGACY_CONFIGDIR, "config.json");
var CONFIGDIR = resolveRuntimeConfigDir();
var LEGACY_WINDOWS_CONFIGDIR = import_node_path3.default.join(resolveRuntimeAppPath("appData"), APP_NAME);
var LEGACY_WINDOWS_CONFIG_FILE = import_node_path3.default.join(LEGACY_WINDOWS_CONFIGDIR, "config.json");
var CONFIG_FILE = import_node_path3.default.join(CONFIGDIR, "config.json");
var ONBOARDING_FINISHED_FILE = import_node_path3.default.join(CONFIGDIR, ".onboard_finished");
var DATADIR = resolveRuntimeDataDir();
var APP_CONFIG_DB_FILE = import_node_path3.default.join(CONFIGDIR, "config.sqlite");
var API_KEYS_DB_FILE = import_node_path3.default.join(DATADIR, "api-keys.sqlite");
var LEGACY_APP_CONFIG_DB_FILES = process.platform === "win32" ? [import_node_path3.default.join(LEGACY_WINDOWS_CONFIGDIR, "config.sqlite")] : [];
var LEGACY_API_KEYS_DB_FILES = process.platform === "win32" ? [import_node_path3.default.join(LEGACY_WINDOWS_CONFIGDIR, "api-keys.sqlite")] : [];
var CERTDIR = import_node_path3.default.join(DATADIR, "certs");
var PROVIDER_ICON_CACHE_DIR = import_node_path3.default.join(DATADIR, "provider-icons");
var PROXY_CA_CERT_FILE = import_node_path3.default.join(CERTDIR, "ca.pem");
var PROXY_CA_CERT_DER_FILE = import_node_path3.default.join(CERTDIR, "ca.cer");
var PROXY_CA_KEY_FILE = import_node_path3.default.join(CERTDIR, "key.pem");
var GATEWAY_CONFIG_FILE = import_node_path3.default.join(CONFIGDIR, "gateway.config.json");
var REQUEST_LOGS_DB_FILE = import_node_path3.default.join(DATADIR, "request-logs.sqlite");
var RAW_TRACE_SPOOL_DIR = import_node_path3.default.join(DATADIR, "raw-trace-spool");
var USAGE_DB_FILE = import_node_path3.default.join(DATADIR, "usage.sqlite");
if (process.platform === "win32") {
  copyMissingDirectoryContents(LEGACY_WINDOWS_CONFIGDIR, CONFIGDIR, "Windows app data directory");
}

// packages/core/src/agents/bot-gateway/env.ts
var requireFromHere = (0, import_node_module.createRequire)(__filename);
function botGatewayProfileEnv(config, profile2, surface) {
  const bot = normalizeBotGatewayForWebSocket(resolveBotGatewayConfig(config, profile2, surface));
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
  const stateDir = resolveBotGatewayStateDir(bot, profile2);
  const env = {
    BOT_GATEWAY_STATE_DIR: stateDir,
    CCR_BOT_GATEWAY_ACK_EVENTS: boolEnv(bot.acknowledgeEvents),
    CCR_BOT_GATEWAY_ARGS_JSON: JSON.stringify(bot.args ?? []),
    CCR_BOT_GATEWAY_AUTH_TYPE: bot.authType ?? "",
    CCR_BOT_GATEWAY_AUTO_START_INTEGRATION: boolEnv(bot.autoStartIntegration),
    CCR_BOT_GATEWAY_COMMAND: bot.command ?? "",
    CCR_BOT_GATEWAY_CONFIG_JSON: JSON.stringify(bot.integrationConfig ?? {}),
    CCR_BOT_GATEWAY_CREATE_INTEGRATION: boolEnv(shouldCreateBotGatewayIntegration(bot)),
    CCR_BOT_GATEWAY_CREDENTIALS_JSON: JSON.stringify(bot.credentials ?? {}),
    CCR_BOT_GATEWAY_CWD: bot.cwd ?? "",
    CCR_BOT_GATEWAY_ENABLED: "true",
    CCR_BOT_GATEWAY_FORWARD_ALL_AGENT_MESSAGES: boolEnv(bot.forwardAllAgentMessages),
    CCR_BOT_GATEWAY_INTEGRATION_ID: bot.integrationId ?? "",
    CCR_BOT_GATEWAY_LANGUAGE: bot.language ?? "auto",
    CCR_BOT_GATEWAY_MAX_ATTACHMENT_BYTES: String(bot.maxAttachmentBytes ?? 20 * 1024 * 1024),
    CCR_BOT_GATEWAY_MAX_TURN_TIME_MS: String(bot.maxTurnTimeMs ?? 10 * 60 * 1e3),
    CCR_BOT_GATEWAY_MEDIA_ENABLED: boolEnv(bot.mediaEnabled),
    CCR_BOT_GATEWAY_MESSAGE_CHUNK_CHARS: String(bot.messageChunkChars ?? 3500),
    CCR_BOT_GATEWAY_PLATFORM: bot.platform,
    CCR_BOT_GATEWAY_POLL_INTERVAL_MS: String(bot.pollIntervalMs ?? 2e3),
    CCR_BOT_GATEWAY_REQUEST_TIMEOUT_MS: String(bot.requestTimeoutMs ?? 6e5),
    CCR_BOT_GATEWAY_SESSION_IDLE_MINUTES: String(bot.sessionIdleMinutes ?? 0),
    CCR_BOT_GATEWAY_SHELL_ENABLED: boolEnv(bot.shellEnabled),
    CCR_BOT_GATEWAY_SOURCE_DIR: "",
    ...botGatewaySdkEnv(),
    CCR_BOT_GATEWAY_STARTUP_TIMEOUT_MS: String(bot.startupTimeoutMs ?? 1e4),
    CCR_BOT_GATEWAY_STATE_DIR: stateDir,
    CCR_BOT_GATEWAY_STREAM_REPLIES: boolEnv(bot.streamReplies),
    CCR_BOT_GATEWAY_TENANT_ID: bot.tenantId ?? "ccr",
    CCR_BOT_HANDOFF_ENABLED: boolEnv(handoff.enabled),
    CCR_BOT_HANDOFF_IDLE_SECONDS: String(handoff.idleSeconds ?? 30),
    CCR_BOT_HANDOFF_PHONE_BLUETOOTH_TARGETS: (handoff.phoneBluetoothTargets ?? []).join("\n"),
    CCR_BOT_HANDOFF_PHONE_WIFI_TARGETS: (handoff.phoneWifiTargets ?? []).join("\n"),
    CCR_BOT_HANDOFF_SCREEN_LOCK: boolEnv(handoff.screenLock),
    CCR_BOT_HANDOFF_USER_IDLE: boolEnv(handoff.userIdle),
    CCR_BOT_PROFILE_ID: profile2.id,
    CCR_BOT_PROFILE_NAME: profile2.name,
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
function resolveBotGatewayConfig(config, profile2, surface) {
  const runtimeSurface = surface ?? normalizeProfileSurface(profile2.surface);
  if (runtimeSurface !== "app") {
    return {
      ...config.botGateway,
      enabled: false,
      platform: "none"
    };
  }
  const savedBot = profile2.botConfigId ? (config.botConfigs ?? []).find((item) => item.id === profile2.botConfigId) : void 0;
  return mergeBotGatewayRuntimeConfig(
    mergeBotGatewayRuntimeConfig(config.botGateway, savedBot?.botGateway),
    profile2.botGateway
  );
}
function mergeBotGatewayRuntimeConfig(base, override) {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...override,
    credentials: {
      ...base.credentials,
      ...override.credentials
    },
    handoff: {
      ...base.handoff,
      ...override.handoff
    },
    integrationConfig: {
      ...base.integrationConfig,
      ...override.integrationConfig
    }
  };
}
function normalizeProfileSurface(value) {
  return value === "cli" || value === "app" ? value : "auto";
}
function botGatewaySdkEnv() {
  const sdkModule = resolveBotGatewaySdkModule();
  return sdkModule ? { CCR_BOT_GATEWAY_SDK_MODULE: sdkModule } : {};
}
function resolveBotGatewaySdkModule() {
  const bundled = resolveBundledBotGatewaySdkModule();
  if (bundled) {
    return bundled;
  }
  try {
    return import_node_path4.default.join(import_node_path4.default.dirname(requireFromHere.resolve("@the-next-ai/bot-gateway-sdk/package.json")), "dist", "index.js");
  } catch {
    return "";
  }
}
function resolveBundledBotGatewaySdkModule() {
  const resourcesPath = process.resourcesPath;
  const candidates = [
    import_node_path4.default.join(__dirname, "bot-gateway-sdk", "dist", "index.js"),
    ...resourcesPath ? [
      import_node_path4.default.join(resourcesPath, "app.asar", "dist", "main", "bot-gateway-sdk", "dist", "index.js"),
      import_node_path4.default.join(resourcesPath, "app", "dist", "main", "bot-gateway-sdk", "dist", "index.js")
    ] : []
  ];
  return candidates.find((candidate) => (0, import_node_fs2.existsSync)(candidate)) ?? "";
}
function normalizeBotGatewayForWebSocket(bot) {
  const platform = normalizeBotGatewayPlatform(bot.platform);
  return {
    ...bot,
    authType: normalizeBotGatewayAuthType(platform, bot.authType),
    credentials: sanitizeBotGatewayRecord(bot.credentials),
    integrationConfig: websocketBotGatewayIntegrationConfig(platform, bot.integrationConfig),
    platform
  };
}
function normalizeBotGatewayPlatform(value) {
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
function normalizeBotGatewayAuthType(platform, value) {
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
function defaultBotGatewayAuthType(platform) {
  if (platform === "weixin-ilink") {
    return "qr_login";
  }
  if (platform === "feishu" || platform === "dingtalk" || platform === "wecom") {
    return "app_secret";
  }
  if (platform === "slack" || platform === "discord" || platform === "telegram" || platform === "line") {
    return "bot_token";
  }
  if (platform === "imessage") {
    return "local";
  }
  return "";
}
function websocketBotGatewayIntegrationConfig(platform, value) {
  const config = sanitizeBotGatewayRecord(value);
  delete config.transport;
  delete config.sendMode;
  const transport = botGatewayWebSocketTransport(platform);
  return transport ? { ...config, transport } : config;
}
function botGatewayWebSocketTransport(platform) {
  if (!platform || platform === "none") {
    return "";
  }
  return platform === "slack" ? "socket" : "websocket";
}
function sanitizeBotGatewayRecord(value) {
  const result = {};
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
function isWebhookRelatedBotGatewayKey(key) {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, "");
  return normalized.includes("webhook") || normalized === "sendmode";
}
function disabledBotGatewayEnv() {
  return {
    CCR_BOT_GATEWAY_ENABLED: "false",
    CODEXL_BOT_GATEWAY_ENABLED: "false"
  };
}
function resolveBotGatewayStateDir(bot, profile2) {
  const configured = (bot.stateDir ?? "").trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const slug = sanitizePathSegment(profile2.id || profile2.name || profile2.agent) || "default";
  return import_node_path4.default.join(CONFIGDIR, "bot-gateway", slug);
}
function resolveUserPath(value) {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return import_node_os2.default.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return import_node_path4.default.join(import_node_os2.default.homedir(), trimmed.slice(2));
  }
  return import_node_path4.default.resolve(trimmed || ".");
}
function sanitizePathSegment(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}
function boolEnv(value) {
  return value ? "true" : "false";
}
function shouldCreateBotGatewayIntegration(bot) {
  if (bot.authType === "qr_login") {
    return false;
  }
  return bot.createIntegration;
}

// packages/core/test/unit/agents/bot-gateway-env.test.mjs
function botGateway(overrides = {}) {
  return {
    acknowledgeEvents: true,
    args: ["--stdio"],
    authType: "token",
    autoStartIntegration: true,
    command: "bot-gateway",
    createIntegration: true,
    credentials: { sendMode: "legacy", token: "secret", webhookUrl: "https://old.example.com" },
    cwd: "/tmp",
    enabled: true,
    forwardAllAgentMessages: true,
    handoff: {
      enabled: true,
      idleSeconds: 45,
      phoneBluetoothTargets: ["bt-phone"],
      phoneWifiTargets: ["wifi-phone"],
      screenLock: false,
      userIdle: true
    },
    integrationConfig: { sendMode: "webhook", team: "T1", transport: "http" },
    integrationId: "integration-1",
    platform: "slack",
    pollIntervalMs: 2500,
    requestTimeoutMs: 6e5,
    sourceDir: "",
    startupTimeoutMs: 15e3,
    stateDir: "",
    tenantId: "tenant-1",
    ...overrides
  };
}
var profile = {
  agent: "codex",
  botConfigId: "saved-bot",
  enabled: true,
  id: "codex-main",
  model: "provider,model",
  name: "Codex Main",
  surface: "app"
};
(0, import_node_test.default)("botGatewayProfileEnv disables bot gateway outside app surface", () => {
  const env = botGatewayProfileEnv({ botConfigs: [], botGateway: botGateway() }, profile, "cli");
  import_strict.default.deepEqual(env, {
    CCR_BOT_GATEWAY_ENABLED: "false",
    CODEXL_BOT_GATEWAY_ENABLED: "false"
  });
});
(0, import_node_test.default)("botGatewayProfileEnv merges saved config and normalizes websocket integration", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [
        {
          botGateway: botGateway({
            authType: "appsecret",
            credentials: { appId: "app-1", webhookSecret: "drop-me" },
            integrationConfig: { appId: "app-1", transport: "http" },
            platform: "lark",
            stateDir: "~/bot-state"
          }),
          id: "saved-bot",
          name: "Saved Bot"
        }
      ],
      botGateway: botGateway({ enabled: false, platform: "none" })
    },
    profile,
    "app"
  );
  import_strict.default.equal(env.CCR_BOT_GATEWAY_ENABLED, "true");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_PLATFORM, "feishu");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "app_secret");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_CREATE_INTEGRATION, "true");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_STATE_DIR, `${process.env.HOME}/bot-state`);
  import_strict.default.equal(env.CCR_BOT_PROFILE_ID, "codex-main");
  import_strict.default.equal(env.CCR_BOT_PROFILE_NAME, "Codex Main");
  const credentials = JSON.parse(env.CCR_BOT_GATEWAY_CREDENTIALS_JSON);
  import_strict.default.deepEqual(credentials, { appId: "app-1", token: "secret" });
  const integrationConfig = JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON);
  import_strict.default.deepEqual(integrationConfig, { appId: "app-1", team: "T1", transport: "websocket" });
});
(0, import_node_test.default)("botGatewayProfileEnv disables create integration for QR login platforms", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [],
      botGateway: botGateway({
        authType: "qr",
        platform: "weixin"
      })
    },
    { ...profile, botConfigId: void 0 },
    "app"
  );
  import_strict.default.equal(env.CCR_BOT_GATEWAY_PLATFORM, "weixin-ilink");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "qr_login");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_CREATE_INTEGRATION, "false");
  import_strict.default.equal(JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON).transport, "websocket");
});
(0, import_node_test.default)("botGatewayProfileEnv defaults iMessage to local auth", () => {
  const env = botGatewayProfileEnv(
    {
      botConfigs: [],
      botGateway: botGateway({
        authType: "",
        credentials: {},
        integrationConfig: {},
        platform: "imessage"
      })
    },
    { ...profile, botConfigId: void 0 },
    "app"
  );
  import_strict.default.equal(env.CCR_BOT_GATEWAY_PLATFORM, "imessage");
  import_strict.default.equal(env.CCR_BOT_GATEWAY_AUTH_TYPE, "local");
  import_strict.default.equal(JSON.parse(env.CCR_BOT_GATEWAY_CONFIG_JSON).transport, "websocket");
});
