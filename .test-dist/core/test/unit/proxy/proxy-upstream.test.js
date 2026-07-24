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

// packages/core/test/unit/proxy/proxy-upstream.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);
var import_node_buffer2 = require("node:buffer");

// packages/core/src/contracts/app.ts
var ROUTER_SCRIPT_MAX_SOURCE_BYTES = 64 * 1024;
var CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV = "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY";
var CLAUDE_CODE_DEFAULT_ENV = {
  [CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY_ENV]: "1"
};
var DEFAULT_TRAY_COMPONENT_VARIANTS = {
  account: "bar",
  modelShare: "bars",
  rings: "rings",
  stats: "cards",
  tokenFlow: "line",
  tokenMix: "bars"
};
var DEFAULT_OVERVIEW_WIDGETS = [
  { enabled: true, id: "system-status", size: "4:1", type: "system-status", variant: "timeline" },
  { enabled: true, id: "account-balance", size: "4:2", type: "account-balance", variant: "cards" },
  { enabled: true, id: "metric-requests", metric: "requests", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-input-tokens", metric: "input-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-output-tokens", metric: "output-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-cache-tokens", metric: "cache-tokens", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-cache-ratio", metric: "cache-ratio", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "metric-estimated-cost", metric: "estimated-cost", size: "1:1", type: "metric", variant: "card" },
  { enabled: true, id: "usage-trend", size: "3:2", type: "usage-trend", variant: "composed" },
  { enabled: true, id: "token-activity", size: "4:2", type: "token-activity", variant: "heatmap" },
  { enabled: true, id: "token-mix", size: "1:2", type: "token-mix", variant: "bars" },
  { enabled: true, id: "client-analysis", size: "2:2", type: "client-analysis", variant: "table" },
  { enabled: true, id: "provider-analysis", size: "2:2", type: "provider-analysis", variant: "table" }
];
var TRAY_WINDOW_MODULE_IDS = [
  "source-tabs",
  "header",
  "account",
  "token-flow",
  "activity",
  "stats",
  "token-mix",
  "rings",
  "model-share",
  "footer"
];
var DEFAULT_TRAY_WINDOW_MODULES = [...TRAY_WINDOW_MODULE_IDS];
var DEFAULT_TRAY_WIDGETS = [
  { id: "source-tabs", type: "source-tabs" },
  { id: "header", type: "header" },
  { id: "account", type: "account", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.account },
  { id: "token-flow", type: "token-flow", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenFlow },
  { id: "activity", type: "activity" },
  { id: "stats", type: "stats", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.stats },
  { id: "token-mix", type: "token-mix", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.tokenMix },
  { id: "rings", type: "rings", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.rings },
  { id: "model-share", type: "model-share", variant: DEFAULT_TRAY_COMPONENT_VARIANTS.modelShare }
];

// packages/core/src/observability/request-log-limits.ts
var rawTraceHardMaxBodyBytes = 50 * 1024 * 1024;
var defaultRequestLogBodyBytes = rawTraceHardMaxBodyBytes;

// packages/core/src/config/default-config.ts
var DEFAULT_PROXY_TARGETS = [
  { host: "api.anthropic.com", paths: ["/v1/messages", "/v1/messages/count_tokens"] },
  { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/responses", "/v1/models"] },
  { host: "generativelanguage.googleapis.com", paths: ["/v1beta/models", "/v1/models"] },
  { host: "openrouter.ai", paths: ["/api/v1/chat/completions", "/api/v1/responses", "/api/v1/models"] },
  { host: "api.deepseek.com", paths: ["/chat/completions", "/v1/chat/completions", "/models", "/v1/models"] },
  { host: "api.mistral.ai", paths: ["/v1/chat/completions", "/v1/models"] }
];
function createDefaultAppConfig(options) {
  const coreHost = options.coreHost ?? "127.0.0.1";
  return {
    APIKEY: "",
    APIKEYS: [],
    API_TIMEOUT_MS: 6e5,
    CUSTOM_ROUTER_PATH: "",
    HOST: "127.0.0.1",
    PORT: 3456,
    Providers: [],
    Router: {
      builtInRules: {
        "claude-code": {
          enabled: true
        },
        codex: {
          enabled: true
        }
      },
      fallback: {
        mode: "off",
        models: [],
        retryCount: 1
      },
      rules: []
    },
    agent: {
      mcpServers: []
    },
    autoStart: false,
    botConfigs: [],
    botGateway: {
      acknowledgeEvents: false,
      args: [],
      authType: "",
      autoStartIntegration: true,
      command: "",
      createIntegration: false,
      credentials: {},
      cwd: "",
      enabled: false,
      forwardAllAgentMessages: true,
      handoff: {
        enabled: false,
        idleSeconds: 30,
        phoneBluetoothTargets: [],
        phoneWifiTargets: [],
        screenLock: true,
        userIdle: true
      },
      integrationConfig: {},
      integrationId: "",
      language: "auto",
      maxAttachmentBytes: 20 * 1024 * 1024,
      maxTurnTimeMs: 10 * 60 * 1e3,
      mediaEnabled: true,
      messageChunkChars: 3500,
      platform: "none",
      pollIntervalMs: 2e3,
      requestTimeoutMs: 6e5,
      sessionIdleMinutes: 0,
      shellEnabled: false,
      sourceDir: "",
      startupTimeoutMs: 1e4,
      stateDir: "",
      streamReplies: true,
      tenantId: "ccr"
    },
    gateway: {
      coreHost,
      corePort: 3457,
      enabled: true,
      generatedConfigFile: options.generatedConfigFile,
      host: "127.0.0.1",
      port: 3456
    },
    mediaTools: {
      allowedInputRoots: [],
      artifactTtlHours: 24,
      enabled: false,
      jobTimeoutMs: 6e5,
      maxImageConcurrency: 2,
      maxVideoConcurrency: 1
    },
    launchAtLogin: false,
    observability: {
      agentAnalysis: false,
      requestLogBodyCapture: "all",
      requestLogMaxBodyBytes: defaultRequestLogBodyBytes,
      requestLogSuccessSampleRate: 1,
      requestLogs: false
    },
    preferredProvider: "",
    plugins: [],
    profile: {
      claudeCode: {
        enabled: true,
        model: "",
        settingsFile: "~/.claude/settings.json",
        smallFastModel: ""
      },
      codex: {
        cliMiddleware: true,
        codexCliPath: "",
        codexHome: "",
        configFormat: "separate_profile_files",
        configFile: "~/.codex/config.toml",
        enabled: true,
        model: "",
        providerId: "claude-code-router",
        providerName: "Claude Code Router",
        showAllSessions: false
      },
      enabled: true,
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          env: { ...CLAUDE_CODE_DEFAULT_ENV },
          id: "default-claude-code",
          model: "",
          name: "Claude Code",
          scope: "global",
          settingsFile: "~/.claude/settings.json",
          smallFastModel: "",
          surface: "auto"
        },
        {
          agent: "codex",
          cliMiddleware: true,
          codexCliPath: "",
          codexHome: "",
          configFormat: "separate_profile_files",
          configFile: "~/.codex/config.toml",
          enabled: true,
          env: {},
          id: "default-codex",
          model: "",
          name: "Codex",
          providerId: "claude-code-router",
          providerName: "Claude Code Router",
          showAllSessions: false,
          scope: "global",
          surface: "auto"
        }
      ]
    },
    proxy: {
      browserMode: true,
      captureNetwork: false,
      enabled: false,
      host: "127.0.0.1",
      mode: "gateway",
      port: 7890,
      systemProxy: false,
      targets: DEFAULT_PROXY_TARGETS,
      upstream: {
        custom: {
          password: "",
          port: 7890,
          server: "",
          username: ""
        },
        mode: "system"
      }
    },
    providerPlugins: [],
    overviewWidgets: DEFAULT_OVERVIEW_WIDGETS,
    routerEndpoint: "http://127.0.0.1:3456",
    theme: "system",
    trayComponentVariants: DEFAULT_TRAY_COMPONENT_VARIANTS,
    trayIcon: "random",
    trayProgressTargetTokens: 1e5,
    trayWidgets: DEFAULT_TRAY_WIDGETS,
    trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
    toolHub: {
      browserAutomation: false,
      enabled: false,
      llm: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: ""
      },
      mcpServers: [],
      maxTools: 10,
      requestTimeoutMs: 6e4
    },
    virtualModelProfiles: []
  };
}

// packages/core/src/proxy/system-proxy.ts
var import_node_child_process = require("node:child_process");
var import_node_buffer = require("node:buffer");
var import_node_fs3 = require("node:fs");
var import_node_path5 = __toESM(require("node:path"));

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

// packages/core/src/platform/windows-system.ts
var import_node_fs2 = require("node:fs");
var import_node_path4 = __toESM(require("node:path"));
function windowsSystemCommand(command) {
  if (process.platform !== "win32" || import_node_path4.default.isAbsolute(command)) {
    return command;
  }
  const roots = [process.env.SystemRoot, process.env.windir].map((value) => value?.trim()).filter((value) => Boolean(value));
  const normalized = command.toLowerCase();
  const candidates = roots.flatMap((root) => {
    if (normalized === "powershell.exe") {
      return [
        import_node_path4.default.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        import_node_path4.default.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe")
      ];
    }
    return [
      import_node_path4.default.join(root, "System32", command),
      import_node_path4.default.join(root, "Sysnative", command)
    ];
  });
  return candidates.find((candidate) => (0, import_node_fs2.existsSync)(candidate)) ?? command;
}

// packages/core/src/proxy/system-proxy.ts
var networkSetup = "/usr/sbin/networksetup";
var windowsInternetSettingsKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
var systemProxySnapshotFile = import_node_path5.default.join(DATADIR, "system-proxy-snapshot.json");
var SystemProxyManager = class {
  snapshot;
  status = {
    state: process.platform === "darwin" || process.platform === "win32" ? "inactive" : "unsupported"
  };
  upstreamProxy;
  async enable(endpoint) {
    this.upstreamProxy = void 0;
    if (process.platform !== "darwin" && process.platform !== "win32") {
      this.status = {
        lastError: "Automatic system proxy switching is only implemented for macOS and Windows.",
        state: "unsupported"
      };
      return this.current();
    }
    try {
      const managedEndpoint = parseManagedEndpoint(endpoint);
      await this.restorePersistedSnapshotIfCurrentProxyIsManaged();
      const snapshot = process.platform === "win32" ? await captureWindowsSystemProxySnapshot(managedEndpoint) : await captureMacSystemProxySnapshot(managedEndpoint);
      const upstreamProxy = readSnapshotUpstreamProxy(snapshot, managedEndpoint);
      this.snapshot = snapshot;
      this.upstreamProxy = upstreamProxy;
      persistSnapshot(snapshot);
      await applySystemProxy(snapshot, managedEndpoint);
      this.status = {
        state: "active",
        upstream: formatUpstreamProxy(upstreamProxy)
      };
      return this.current();
    } catch (error) {
      const restoreError = await this.restoreSnapshotAfterEnableFailure();
      this.status = {
        lastError: [formatError2(error), restoreError].filter(Boolean).join(" "),
        state: "error"
      };
      return this.current();
    }
  }
  async restore() {
    this.upstreamProxy = void 0;
    if (process.platform !== "darwin" && process.platform !== "win32") {
      this.snapshot = void 0;
      this.status = {
        lastError: "Automatic system proxy switching is only implemented for macOS and Windows.",
        state: "unsupported"
      };
      return this.getStatus();
    }
    const activeSnapshot = this.snapshot;
    const snapshot = activeSnapshot ?? readPersistedSnapshot();
    this.snapshot = void 0;
    if (!snapshot) {
      this.status = { state: "inactive" };
      return this.getStatus();
    }
    if (!activeSnapshot && snapshot.platform !== process.platform) {
      removePersistedSnapshot();
      this.status = { state: "inactive" };
      return this.getStatus();
    }
    try {
      const shouldRestore = Boolean(activeSnapshot) || await currentProxyUsesManagedEndpoint(snapshot);
      if (shouldRestore) {
        await restoreSystemProxy(snapshot);
      }
      removePersistedSnapshot();
      this.status = {
        state: shouldRestore ? "restored" : "inactive",
        upstream: formatUpstreamProxy(readSnapshotUpstreamProxy(snapshot, parseManagedEndpoint(snapshot.managedEndpoint)))
      };
      return this.getStatus();
    } catch (error) {
      this.status = {
        lastError: formatError2(error),
        state: "error"
      };
      return this.getStatus();
    }
  }
  getStatus() {
    return { ...this.status };
  }
  getManagedEndpointUrl() {
    return this.status.state === "active" ? this.snapshot?.managedEndpoint : void 0;
  }
  getUpstreamProxy() {
    if (!this.upstreamProxy) {
      return void 0;
    }
    return {
      http: this.upstreamProxy.http ? { ...this.upstreamProxy.http } : void 0,
      https: this.upstreamProxy.https ? { ...this.upstreamProxy.https } : void 0
    };
  }
  current() {
    return {
      status: this.getStatus(),
      upstreamProxy: this.getUpstreamProxy()
    };
  }
  async restorePersistedSnapshotIfCurrentProxyIsManaged() {
    const snapshot = readPersistedSnapshot();
    if (!snapshot) {
      return;
    }
    if (snapshot.platform !== process.platform) {
      removePersistedSnapshot();
      return;
    }
    if (await currentProxyUsesManagedEndpoint(snapshot)) {
      await restoreSystemProxy(snapshot);
    }
    removePersistedSnapshot();
  }
  async restoreSnapshotAfterEnableFailure() {
    const snapshot = this.snapshot;
    this.snapshot = void 0;
    this.upstreamProxy = void 0;
    if (!snapshot) {
      return void 0;
    }
    try {
      await restoreSystemProxy(snapshot);
      removePersistedSnapshot();
      return void 0;
    } catch (error) {
      return `Failed to restore the previous system proxy: ${formatError2(error)}`;
    }
  }
};
var systemProxyManager = new SystemProxyManager();
function formatUpstreamProxy(upstreamProxy) {
  if (!upstreamProxy?.http && !upstreamProxy?.https) {
    return void 0;
  }
  if (upstreamProxy.http && sameProxyServer(upstreamProxy.http, upstreamProxy.https)) {
    return `HTTP/HTTPS ${formatProxyServer(upstreamProxy.http)}`;
  }
  const values = [];
  if (upstreamProxy.http) {
    values.push(`HTTP ${formatProxyServer(upstreamProxy.http)}`);
  }
  if (upstreamProxy.https && !sameProxyServer(upstreamProxy.http, upstreamProxy.https)) {
    values.push(`HTTPS ${formatProxyServer(upstreamProxy.https)}`);
  }
  return values.join(", ");
}
function customUpstreamProxyFromConfig(upstream) {
  if (upstream?.mode !== "custom") {
    return void 0;
  }
  const host = normalizeCustomProxyServer(upstream.custom.server);
  const port = upstream.custom.port;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return void 0;
  }
  const server = {
    host,
    password: upstream.custom.password,
    port,
    protocol: "http",
    username: upstream.custom.username.trim()
  };
  return {
    http: server,
    https: server
  };
}
function upstreamProxyAuthorizationHeader(server) {
  if (!server.username && !server.password) {
    return void 0;
  }
  return `Basic ${import_node_buffer.Buffer.from(`${server.username ?? ""}:${server.password ?? ""}`).toString("base64")}`;
}
function upstreamProxyUrl(server) {
  const username = server.username ?? "";
  const password = server.password ?? "";
  const auth = username || password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
  return `${server.protocol}://${auth}${formatProxyHost(server.host)}:${server.port}`;
}
function parseManagedEndpoint(endpoint) {
  const parsed = new URL(endpoint);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (!parsed.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proxy endpoint: ${endpoint}`);
  }
  return {
    host: parsed.hostname,
    port,
    url: `http://${formatProxyHost(parsed.hostname)}:${port}`
  };
}
function normalizeCustomProxyServer(server) {
  const trimmed = server.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return parsed.hostname;
  } catch {
    return trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "").replace(/^\[(.*)]$/, "$1");
  }
}
async function captureMacSystemProxySnapshot(managedEndpoint) {
  const services = await listNetworkServices();
  const snapshots = [];
  for (const service of services) {
    if (service.disabled) {
      continue;
    }
    snapshots.push({
      name: service.name,
      secureWeb: await readMacProxySettings("-getsecurewebproxy", service.name),
      socks: await readMacProxySettings("-getsocksfirewallproxy", service.name),
      web: await readMacProxySettings("-getwebproxy", service.name)
    });
  }
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    managedEndpoint: managedEndpoint.url,
    platform: "darwin",
    services: snapshots,
    version: 1
  };
}
async function captureWindowsSystemProxySnapshot(managedEndpoint) {
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    managedEndpoint: managedEndpoint.url,
    platform: "win32",
    settings: await readWindowsProxySettings(),
    version: 1
  };
}
async function listNetworkServices() {
  const output = await runNetworkSetup(["-listallnetworkservices"]);
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.toLowerCase().startsWith("an asterisk")).map((line) => ({
    disabled: line.startsWith("*"),
    name: line.startsWith("*") ? line.slice(1).trim() : line
  })).filter((service) => service.name.length > 0);
}
async function readMacProxySettings(command, serviceName) {
  const output = await runNetworkSetup([command, serviceName]);
  const enabled = readSetting(output, "Enabled").toLowerCase();
  const server = readSetting(output, "Server");
  const port = Number(readSetting(output, "Port"));
  const authenticated = readSetting(output, "Authenticated Proxy Enabled").toLowerCase();
  return {
    authenticated: authenticated === "1" || authenticated === "yes" || authenticated === "true",
    enabled: enabled === "yes" || enabled === "1" || enabled === "true",
    port: Number.isInteger(port) && port > 0 ? port : 0,
    server
  };
}
async function applyMacSystemProxy(snapshot, managedEndpoint) {
  for (const service of snapshot.services) {
    await setMacProxySettings("-setwebproxy", "-setwebproxystate", service.name, {
      authenticated: false,
      enabled: true,
      port: managedEndpoint.port,
      server: managedEndpoint.host
    });
    await setMacProxySettings("-setsecurewebproxy", "-setsecurewebproxystate", service.name, {
      authenticated: false,
      enabled: true,
      port: managedEndpoint.port,
      server: managedEndpoint.host
    });
    if (service.socks?.enabled) {
      await setMacProxySettings("-setsocksfirewallproxy", "-setsocksfirewallproxystate", service.name, {
        ...service.socks,
        enabled: false
      });
    }
  }
}
async function restoreMacSystemProxy(snapshot) {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  for (const service of snapshot.services) {
    await setMacProxySettings("-setwebproxy", "-setwebproxystate", service.name, sanitizeMacProxySettingsForRestore(service.web, managedEndpoint));
    await setMacProxySettings(
      "-setsecurewebproxy",
      "-setsecurewebproxystate",
      service.name,
      sanitizeMacProxySettingsForRestore(service.secureWeb, managedEndpoint)
    );
    if (service.socks) {
      await setMacProxySettings("-setsocksfirewallproxy", "-setsocksfirewallproxystate", service.name, service.socks);
    }
  }
}
async function applySystemProxy(snapshot, managedEndpoint) {
  if (snapshot.platform === "win32") {
    await applyWindowsSystemProxy(snapshot, managedEndpoint);
    return;
  }
  await applyMacSystemProxy(snapshot, managedEndpoint);
}
async function restoreSystemProxy(snapshot) {
  if (snapshot.platform === "win32") {
    await restoreWindowsSystemProxy(snapshot);
    return;
  }
  await restoreMacSystemProxy(snapshot);
}
async function setMacProxySettings(setCommand, stateCommand, serviceName, settings) {
  if (settings.server && settings.port > 0) {
    await runNetworkSetup([
      setCommand,
      serviceName,
      settings.server,
      String(settings.port),
      settings.authenticated ? "on" : "off",
      "",
      ""
    ]);
  }
  await runNetworkSetup([stateCommand, serviceName, settings.enabled ? "on" : "off"]);
}
async function readWindowsProxySettings() {
  const autoConfigUrl = await queryWindowsRegistryValue("AutoConfigURL");
  const autoDetect = await queryWindowsRegistryValue("AutoDetect");
  const proxyEnable = await queryWindowsRegistryValue("ProxyEnable");
  const proxyServer = await queryWindowsRegistryValue("ProxyServer");
  const proxyOverride = await queryWindowsRegistryValue("ProxyOverride");
  const winHttp = await readWindowsWinHttpProxySettings();
  return {
    autoConfigUrl: autoConfigUrl?.value,
    autoDetect: autoDetect ? parseWindowsRegistryDword(autoDetect.value) : void 0,
    hadAutoConfigUrl: Boolean(autoConfigUrl),
    hadAutoDetect: Boolean(autoDetect),
    hadProxyEnable: Boolean(proxyEnable),
    hadProxyOverride: Boolean(proxyOverride),
    hadProxyServer: Boolean(proxyServer),
    proxyEnable: proxyEnable ? parseWindowsRegistryDword(proxyEnable.value) : void 0,
    proxyOverride: proxyOverride?.value,
    proxyServer: proxyServer?.value,
    winHttp
  };
}
async function applyWindowsSystemProxy(snapshot, managedEndpoint) {
  const proxyServer = `http=${formatProxyServer(managedEndpoint)};https=${formatProxyServer(managedEndpoint)}`;
  await deleteWindowsRegistryValue("AutoConfigURL");
  await setWindowsRegistryDword("AutoDetect", 0);
  await setWindowsRegistryDword("ProxyEnable", 1);
  await setWindowsRegistryString("ProxyServer", proxyServer);
  await setWindowsRegistryString("ProxyOverride", "<local>");
  if (snapshot.settings.winHttp) {
    await applyWindowsWinHttpProxy(managedEndpoint).catch((error) => {
      console.warn(`[proxy] Failed to set Windows WinHTTP proxy: ${formatError2(error)}`);
    });
  }
  await notifyWindowsSystemProxyChanged();
}
async function restoreWindowsSystemProxy(snapshot) {
  const settings = snapshot.settings;
  if (settings.hadProxyEnable && settings.proxyEnable !== void 0) {
    await setWindowsRegistryDword("ProxyEnable", settings.proxyEnable);
  } else {
    await deleteWindowsRegistryValue("ProxyEnable");
  }
  if (settings.hadProxyServer && settings.proxyServer !== void 0) {
    await setWindowsRegistryString("ProxyServer", settings.proxyServer);
  } else {
    await deleteWindowsRegistryValue("ProxyServer");
  }
  if (settings.hadProxyOverride && settings.proxyOverride !== void 0) {
    await setWindowsRegistryString("ProxyOverride", settings.proxyOverride);
  } else {
    await deleteWindowsRegistryValue("ProxyOverride");
  }
  if (settings.hadAutoConfigUrl && settings.autoConfigUrl !== void 0) {
    await setWindowsRegistryString("AutoConfigURL", settings.autoConfigUrl);
  } else {
    await deleteWindowsRegistryValue("AutoConfigURL");
  }
  if (settings.hadAutoDetect && settings.autoDetect !== void 0) {
    await setWindowsRegistryDword("AutoDetect", settings.autoDetect);
  } else {
    await deleteWindowsRegistryValue("AutoDetect");
  }
  await restoreWindowsWinHttpProxy(settings.winHttp).catch((error) => {
    console.warn(`[proxy] Failed to restore Windows WinHTTP proxy: ${formatError2(error)}`);
  });
  await notifyWindowsSystemProxyChanged();
}
function readSnapshotUpstreamProxy(snapshot, managedEndpoint) {
  if (snapshot.platform === "win32") {
    return readWindowsUpstreamProxy(snapshot, managedEndpoint);
  }
  return readMacUpstreamProxy(snapshot, managedEndpoint);
}
function readMacUpstreamProxy(snapshot, managedEndpoint) {
  const upstreamProxy = {};
  for (const service of snapshot.services) {
    if (!upstreamProxy.http && isUsableUpstreamProxy(service.web, managedEndpoint)) {
      upstreamProxy.http = {
        host: service.web.server,
        port: service.web.port,
        protocol: "http"
      };
    }
    if (!upstreamProxy.https && isUsableUpstreamProxy(service.secureWeb, managedEndpoint)) {
      upstreamProxy.https = {
        host: service.secureWeb.server,
        port: service.secureWeb.port,
        protocol: "http"
      };
    }
    if (upstreamProxy.http && upstreamProxy.https) {
      break;
    }
  }
  if (!upstreamProxy.https && upstreamProxy.http) {
    upstreamProxy.https = upstreamProxy.http;
  }
  if (!upstreamProxy.http && upstreamProxy.https) {
    upstreamProxy.http = upstreamProxy.https;
  }
  return upstreamProxy.http || upstreamProxy.https ? upstreamProxy : void 0;
}
function readWindowsUpstreamProxy(snapshot, managedEndpoint) {
  if (snapshot.settings.proxyEnable === 1 && snapshot.settings.proxyServer) {
    const winInetProxy = parseWindowsProxyServer(snapshot.settings.proxyServer, managedEndpoint);
    if (winInetProxy) {
      return winInetProxy;
    }
  }
  return readWindowsWinHttpUpstreamProxy(snapshot.settings.winHttp, managedEndpoint);
}
async function currentProxyUsesManagedEndpoint(snapshot) {
  if (snapshot.platform === "win32") {
    return currentWindowsProxyUsesManagedEndpoint(snapshot);
  }
  return currentMacProxyUsesManagedEndpoint(snapshot);
}
async function currentMacProxyUsesManagedEndpoint(snapshot) {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  for (const service of snapshot.services) {
    const currentWeb = await readMacProxySettings("-getwebproxy", service.name).catch(() => void 0);
    if (currentWeb && matchesManagedEndpoint(currentWeb, managedEndpoint)) {
      return true;
    }
    const currentSecureWeb = await readMacProxySettings("-getsecurewebproxy", service.name).catch(() => void 0);
    if (currentSecureWeb && matchesManagedEndpoint(currentSecureWeb, managedEndpoint)) {
      return true;
    }
  }
  return false;
}
async function currentWindowsProxyUsesManagedEndpoint(snapshot) {
  const managedEndpoint = parseManagedEndpoint(snapshot.managedEndpoint);
  const current = await readWindowsProxySettings();
  if (current.proxyEnable === 1 && current.proxyServer && windowsProxyServerUsesManagedEndpoint(current.proxyServer, managedEndpoint)) {
    return true;
  }
  return windowsWinHttpProxyUsesManagedEndpoint(current.winHttp, managedEndpoint);
}
function parseWindowsProxyServer(proxyServer, managedEndpoint) {
  const parsed = parseWindowsProxyServerEntries(proxyServer);
  const upstreamProxy = {};
  const httpProxy = parsed.http ?? parsed.default;
  const httpsProxy = parsed.https ?? parsed.default ?? httpProxy;
  if (httpProxy && !sameProxyServer(httpProxy, managedEndpoint)) {
    upstreamProxy.http = httpProxy;
  }
  if (httpsProxy && !sameProxyServer(httpsProxy, managedEndpoint)) {
    upstreamProxy.https = httpsProxy;
  }
  if (!upstreamProxy.https && upstreamProxy.http) {
    upstreamProxy.https = upstreamProxy.http;
  }
  if (!upstreamProxy.http && upstreamProxy.https) {
    upstreamProxy.http = upstreamProxy.https;
  }
  return upstreamProxy.http || upstreamProxy.https ? upstreamProxy : void 0;
}
function windowsProxyServerUsesManagedEndpoint(proxyServer, managedEndpoint) {
  const entries = parseWindowsProxyServerEntries(proxyServer);
  return [entries.default, entries.http, entries.https].some((entry) => sameProxyServer(entry, managedEndpoint));
}
function parseWindowsProxyServerEntries(proxyServer) {
  const trimmed = proxyServer.trim();
  if (!trimmed) {
    return {};
  }
  if (!trimmed.includes("=")) {
    return {
      default: parseProxyServerEndpoint(trimmed, "http")
    };
  }
  const parsed = {};
  for (const segment of trimmed.split(";")) {
    const [rawKey, ...rawValueParts] = segment.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join("=").trim();
    const endpoint = parseProxyServerEndpoint(value, "http");
    if (!endpoint) {
      continue;
    }
    if (key === "http") {
      parsed.http = endpoint;
    } else if (key === "https") {
      parsed.https = endpoint;
    }
  }
  return parsed;
}
function parseProxyServerEndpoint(value, defaultProtocol) {
  let normalized = value.trim();
  if (!normalized) {
    return void 0;
  }
  if (/^socks(?:4|5)?:\/\//i.test(normalized)) {
    return void 0;
  }
  const explicitProtocol = /^https?:\/\//i.test(normalized) ? "http" : void 0;
  normalized = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const parsed = safeParseProxyServerUrl(normalized);
  if (!parsed?.hostname) {
    return void 0;
  }
  const port = Number(parsed.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return void 0;
  }
  return {
    host: parsed.hostname,
    port,
    protocol: explicitProtocol ?? defaultProtocol
  };
}
function safeParseProxyServerUrl(value) {
  try {
    return new URL(`http://${value}`);
  } catch {
    try {
      return new URL(`http://${value.replace(/^\[?([^\]]+)\]?:(\d+)$/, "[$1]:$2")}`);
    } catch {
      return void 0;
    }
  }
}
async function readWindowsWinHttpProxySettings() {
  try {
    return parseWindowsWinHttpProxySettings(await runCommand(windowsSystemCommand("netsh.exe"), ["winhttp", "show", "proxy"]));
  } catch (error) {
    console.warn(`[proxy] Failed to read Windows WinHTTP proxy: ${formatError2(error)}`);
    return void 0;
  }
}
function parseWindowsWinHttpProxySettings(output) {
  const proxyServer = normalizeWindowsNetshValue(readWindowsNetshProxyLine(output, "Proxy Server"));
  const bypassList = normalizeWindowsNetshValue(readWindowsNetshProxyLine(output, "Bypass List"));
  const direct = /Direct access\s*\(no proxy server\)/i.test(output);
  if (!direct && !proxyServer) {
    throw new Error("Could not parse Windows WinHTTP proxy settings.");
  }
  return {
    bypassList,
    direct,
    proxyServer,
    raw: output
  };
}
function readWindowsNetshProxyLine(output, label) {
  const pattern = label === "Proxy Server" ? /^\s*Proxy Server(?:\(s\))?\s*:\s*(.+?)\s*$/im : /^\s*Bypass List\s*:\s*(.+?)\s*$/im;
  return pattern.exec(output)?.[1]?.trim();
}
function normalizeWindowsNetshValue(value) {
  if (!value) {
    return void 0;
  }
  const trimmed = value.trim();
  return !trimmed || /^\(none\)$/i.test(trimmed) ? void 0 : trimmed;
}
async function applyWindowsWinHttpProxy(managedEndpoint) {
  const proxyServer = `http=${formatProxyServer(managedEndpoint)};https=${formatProxyServer(managedEndpoint)}`;
  await runCommand(windowsSystemCommand("netsh.exe"), [
    "winhttp",
    "set",
    "proxy",
    `proxy-server=${proxyServer}`,
    "bypass-list=<local>"
  ]);
}
async function restoreWindowsWinHttpProxy(settings) {
  if (!settings) {
    return;
  }
  if (settings.direct || !settings.proxyServer) {
    await runCommand(windowsSystemCommand("netsh.exe"), ["winhttp", "reset", "proxy"]);
    return;
  }
  await runCommand(windowsSystemCommand("netsh.exe"), [
    "winhttp",
    "set",
    "proxy",
    `proxy-server=${settings.proxyServer}`,
    ...settings.bypassList ? [`bypass-list=${settings.bypassList}`] : []
  ]);
}
function readWindowsWinHttpUpstreamProxy(settings, managedEndpoint) {
  if (!settings || settings.direct || !settings.proxyServer) {
    return void 0;
  }
  return parseWindowsProxyServer(settings.proxyServer, managedEndpoint);
}
function windowsWinHttpProxyUsesManagedEndpoint(settings, managedEndpoint) {
  return Boolean(settings && !settings.direct && settings.proxyServer && windowsProxyServerUsesManagedEndpoint(settings.proxyServer, managedEndpoint));
}
function isUsableUpstreamProxy(settings, managedEndpoint) {
  return settings.enabled && settings.server.length > 0 && settings.port > 0 && !matchesManagedEndpoint(settings, managedEndpoint);
}
function sanitizeMacProxySettingsForRestore(settings, managedEndpoint) {
  if (!matchesManagedEndpoint(settings, managedEndpoint)) {
    return settings;
  }
  return {
    ...settings,
    enabled: false
  };
}
function matchesManagedEndpoint(settings, managedEndpoint) {
  return settings.enabled && normalizeHost(settings.server) === normalizeHost(managedEndpoint.host) && settings.port === managedEndpoint.port;
}
function normalizeHost(host) {
  const normalized = host.trim().toLowerCase();
  if (normalized === "::1" || normalized === "[::1]" || normalized === "localhost") {
    return "127.0.0.1";
  }
  return normalized;
}
function readSetting(output, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`, "im");
  return pattern.exec(output)?.[1]?.trim() ?? "";
}
function persistSnapshot(snapshot) {
  (0, import_node_fs3.mkdirSync)(import_node_path5.default.dirname(systemProxySnapshotFile), { recursive: true });
  (0, import_node_fs3.writeFileSync)(systemProxySnapshotFile, `${JSON.stringify(snapshot, null, 2)}
`, "utf8");
}
function readPersistedSnapshot() {
  if (!(0, import_node_fs3.existsSync)(systemProxySnapshotFile)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse((0, import_node_fs3.readFileSync)(systemProxySnapshotFile, "utf8"));
    if (isSystemProxySnapshot(parsed)) {
      return parsed;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function removePersistedSnapshot() {
  (0, import_node_fs3.rmSync)(systemProxySnapshotFile, { force: true });
}
function isSystemProxySnapshot(value) {
  if (!isObject(value) || value.version !== 1 || typeof value.managedEndpoint !== "string") {
    return false;
  }
  if (value.platform === "darwin") {
    return Array.isArray(value.services);
  }
  if (value.platform === "win32") {
    return isObject(value.settings);
  }
  return false;
}
function sameProxyServer(left, right) {
  return Boolean(
    left && right && normalizeHost(left.host) === normalizeHost(right.host) && left.port === right.port && (!("protocol" in right) || left.protocol === right.protocol)
  );
}
function formatProxyServer(server) {
  const endpoint = `${formatProxyHost(server.host)}:${server.port}`;
  return "protocol" in server ? `${server.protocol}://${endpoint}` : endpoint;
}
function formatProxyHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
async function queryWindowsRegistryValue(name) {
  try {
    const output = await runCommand(windowsSystemCommand("reg.exe"), ["query", windowsInternetSettingsKey, "/v", name]);
    return parseWindowsRegistryQueryOutput(output, name);
  } catch {
    return void 0;
  }
}
function parseWindowsRegistryQueryOutput(output, name) {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s+(REG_\S+)\s+(.+?)\s*$/.exec(line);
    if (match?.[1].toLowerCase() === name.toLowerCase()) {
      return {
        type: match[2],
        value: match[3]
      };
    }
  }
  return void 0;
}
function parseWindowsRegistryDword(value) {
  const trimmed = value.trim().toLowerCase();
  const parsed = trimmed.startsWith("0x") ? Number.parseInt(trimmed.slice(2), 16) : Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : void 0;
}
async function setWindowsRegistryDword(name, value) {
  await runCommand(windowsSystemCommand("reg.exe"), [
    "add",
    windowsInternetSettingsKey,
    "/v",
    name,
    "/t",
    "REG_DWORD",
    "/d",
    String(value),
    "/f"
  ]);
}
async function setWindowsRegistryString(name, value) {
  await runCommand(windowsSystemCommand("reg.exe"), [
    "add",
    windowsInternetSettingsKey,
    "/v",
    name,
    "/t",
    "REG_SZ",
    "/d",
    value,
    "/f"
  ]);
}
async function deleteWindowsRegistryValue(name) {
  await runCommand(windowsSystemCommand("reg.exe"), ["delete", windowsInternetSettingsKey, "/v", name, "/f"]).catch(() => void 0);
}
async function notifyWindowsSystemProxyChanged() {
  const script = [
    `$signature = '[DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);';`,
    "Add-Type -MemberDefinition $signature -Namespace WinInet -Name NativeMethods;",
    "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null;",
    "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null;"
  ].join(" ");
  await runCommand(windowsSystemCommand("powershell.exe"), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]).catch((error) => {
    console.warn(`[proxy] Failed to notify Windows system proxy change: ${formatError2(error)}`);
  });
}
function runNetworkSetup(args) {
  return runCommand(networkSetup, args).then((output) => {
    if (isNetworkSetupErrorOutput(output)) {
      throw new Error(output.trim());
    }
    return output;
  });
}
function runCommand(file, args) {
  return new Promise((resolve, reject) => {
    (0, import_node_child_process.execFile)(file, args, { windowsHide: process.platform === "win32" }, (error, stdout, stderr) => {
      const message = stderr?.trim() || stdout?.trim();
      if (error) {
        reject(new Error(message || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}
function isNetworkSetupErrorOutput(output) {
  return Boolean(output && (/AuthorizationCreate\(\) failed/i.test(output) || /^\*\* Error:/m.test(output)));
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function formatError2(error) {
  return error instanceof Error ? error.message : String(error);
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/core/test/unit/proxy/proxy-upstream.test.mjs
(0, import_node_test.default)("custom upstream proxy config creates authenticated proxy URLs", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.proxy.upstream = {
    custom: {
      password: "pa:ss",
      port: 8888,
      server: "http://proxy.example.com:8888",
      username: "alice@example.com"
    },
    mode: "custom"
  };
  const upstream = customUpstreamProxyFromConfig(config.proxy.upstream);
  import_strict.default.ok(upstream?.https);
  import_strict.default.equal(
    upstreamProxyUrl(upstream.https),
    "http://alice%40example.com:pa%3Ass@proxy.example.com:8888"
  );
  import_strict.default.equal(
    upstreamProxyAuthorizationHeader(upstream.https),
    `Basic ${import_node_buffer2.Buffer.from("alice@example.com:pa:ss").toString("base64")}`
  );
});
(0, import_node_test.default)("none and incomplete custom upstream proxy configs do not create proxy servers", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-gateway.config.json" });
  config.proxy.upstream = {
    ...config.proxy.upstream,
    mode: "none"
  };
  import_strict.default.equal(customUpstreamProxyFromConfig(config.proxy.upstream), void 0);
  config.proxy.upstream = {
    custom: {
      password: "",
      port: 8888,
      server: "",
      username: ""
    },
    mode: "custom"
  };
  import_strict.default.equal(customUpstreamProxyFromConfig(config.proxy.upstream), void 0);
});
