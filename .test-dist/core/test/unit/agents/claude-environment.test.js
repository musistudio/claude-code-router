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

// packages/core/test/unit/agents/claude-environment.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/core/src/agents/claude-code/environment.ts
var CLAUDE_CODE_MCP_CONFIG_ENV = "CCR_CLAUDE_CODE_MCP_CONFIG";
var CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV = "CODEXL_CLAUDE_CODE_MCP_CONFIG";
var chinaTimeZones = /* @__PURE__ */ new Set([
  "asia/chongqing",
  "asia/chungking",
  "asia/harbin",
  "asia/kashgar",
  "asia/shanghai",
  "asia/urumqi",
  "china standard time",
  "prc"
]);
function claudeCodeMcpConfigEnv(configFile) {
  return configFile ? {
    [CLAUDE_CODE_MCP_CONFIG_ENV]: configFile,
    [CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV]: configFile
  } : {};
}
function claudeCodeUtcTimezoneEnvOverride(timeZone = currentTimeZone()) {
  return isChinaTimeZone(timeZone) ? { TZ: "UTC" } : {};
}
function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return void 0;
  }
}
function isChinaTimeZone(timeZone) {
  const normalized = timeZone?.trim().toLowerCase();
  return Boolean(normalized && chinaTimeZones.has(normalized));
}

// packages/core/src/mcp/toolhub-config.ts
var import_node_path4 = require("node:path");

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

// packages/core/src/mcp/toolhub-config.ts
var TOOL_HUB_MCP_SERVER_NAME = "ccr-toolhub";
var TOOL_HUB_MCP_RUNTIME_FILE_NAME = "toolhub-mcp.js";
var BROWSER_AUTOMATION_MCP_SERVER_NAME = "ccr-browser-automation";
var BROWSER_AUTOMATION_MCP_PATH = "/__ccr/browser-automation/mcp";
var BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS = 6e5;
var TOOL_HUB_DEFAULT_REQUEST_TIMEOUT_MS = 6e4;
function toolHubBackendServers(config, extraServers = [], options = {}) {
  return [
    ...options.includeBuiltIns === false ? [] : toolHubBuiltInBackendServers(config, options),
    ...Array.isArray(config?.agent?.mcpServers) ? config.agent.mcpServers : [],
    ...Array.isArray(config?.toolHub?.mcpServers) ? config.toolHub.mcpServers : [],
    ...extraServers
  ].filter(isToolHubBackendServer);
}
function toolHubBuiltInBackendServers(config, options = {}) {
  if (!config || !browserAutomationMcpEnabled(config) || !hasGatewayEndpoint(config)) {
    return [];
  }
  return [
    {
      apiKey: options.apiKey || firstConfiguredApiKey(config),
      headers: {},
      name: BROWSER_AUTOMATION_MCP_SERVER_NAME,
      protocolVersion: "2024-11-05",
      requestTimeoutMs: BROWSER_AUTOMATION_HANDOFF_TIMEOUT_MS,
      startupTimeoutMs: 6e4,
      transport: "streamable-http",
      url: `${gatewayEndpoint(config)}${BROWSER_AUTOMATION_MCP_PATH}`
    }
  ];
}
function browserAutomationMcpEnabled(config) {
  return Boolean(config?.toolHub?.enabled && config.toolHub.browserAutomation);
}
function toolHubMcpRuntimeConfig(config, backendServers, options = {}) {
  const toolHub = config?.toolHub;
  if (!toolHub?.enabled) {
    return void 0;
  }
  const resolvedBackendServers = backendServers ?? toolHubBackendServers(config, [], {
    apiKey: options.resolver?.apiKey
  });
  const normalizedBackendServers = resolvedBackendServers.filter(isToolHubBackendServer);
  if (normalizedBackendServers.length === 0) {
    return void 0;
  }
  const requestTimeoutMs = toolHubRequestTimeoutMs(config, normalizedBackendServers);
  return {
    args: [options.entryPath ?? bundledToolHubMcpEntryPath()],
    command: options.command ?? process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      TOOLHUB_CACHE_FILE: (0, import_node_path4.join)(CONFIGDIR, "toolhub-cache.json"),
      TOOLHUB_MAX_TOOLS: String(toolHub.maxTools ?? 10),
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify(normalizedBackendServers),
      TOOLHUB_OPENAI_API_KEY: options.resolver?.apiKey ?? toolHub.llm?.apiKey ?? "",
      TOOLHUB_OPENAI_BASE_URL: options.resolver?.baseUrl ?? toolHub.llm?.baseUrl ?? "https://api.openai.com/v1",
      TOOLHUB_OPENAI_MODEL: options.resolver?.model ?? toolHub.llm?.model ?? "",
      TOOLHUB_REQUEST_TIMEOUT_MS: String(requestTimeoutMs)
    }
  };
}
function toolHubRequestTimeoutMs(config, backendServers) {
  const configuredTimeout = positiveInteger(config?.toolHub?.requestTimeoutMs, TOOL_HUB_DEFAULT_REQUEST_TIMEOUT_MS);
  const backendTimeouts = (backendServers ?? toolHubBackendServers(config)).map((server) => isRecord(server) ? positiveInteger(server.requestTimeoutMs, 0) : 0);
  return Math.max(configuredTimeout, ...backendTimeouts);
}
function toolHubClaudeCodeMcpConfig(config, options = {}) {
  const toolHub = config?.toolHub;
  if (!toolHub?.enabled) {
    return void 0;
  }
  const backendServers = toolHubBackendServers(config, [], {
    apiKey: options.resolver?.apiKey
  });
  if (backendServers.length === 0) {
    return void 0;
  }
  const runtimeConfig = toolHubMcpRuntimeConfig(config, backendServers, options);
  return runtimeConfig ? { mcpServers: { [TOOL_HUB_MCP_SERVER_NAME]: runtimeConfig } } : void 0;
}
function bundledToolHubMcpEntryPath() {
  return (0, import_node_path4.join)(__dirname, TOOL_HUB_MCP_RUNTIME_FILE_NAME);
}
function isToolHubBackendServer(value) {
  return isRecord(value) && stringValue(value.name)?.toLowerCase() !== TOOL_HUB_MCP_SERVER_NAME;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function firstConfiguredApiKey(config) {
  return (Array.isArray(config.APIKEYS) ? config.APIKEYS : []).find((apiKey) => apiKey.key.trim())?.key.trim() || stringValue(config.APIKEY);
}
function positiveInteger(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}
function gatewayEndpoint(config) {
  return `http://${formatHost(clientGatewayHost(config.gateway.host))}:${config.gateway.port}`;
}
function hasGatewayEndpoint(config) {
  const gateway = config.gateway;
  return Boolean(gateway && stringValue(gateway.host) && Number.isFinite(gateway.port));
}
function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
function clientGatewayHost(host) {
  const value = stringValue(host) ?? "127.0.0.1";
  if (value === "0.0.0.0") {
    return "127.0.0.1";
  }
  if (value === "::" || value === "[::]") {
    return "::1";
  }
  return value;
}

// packages/core/test/unit/agents/claude-environment.test.mjs
(0, import_node_test.default)("detects China time zones used by Claude Code", () => {
  import_strict.default.equal(isChinaTimeZone("Asia/Shanghai"), true);
  import_strict.default.equal(isChinaTimeZone("Asia/Urumqi"), true);
  import_strict.default.equal(isChinaTimeZone("PRC"), true);
  import_strict.default.equal(isChinaTimeZone("UTC"), false);
  import_strict.default.equal(isChinaTimeZone("Asia/Singapore"), false);
});
(0, import_node_test.default)("overrides Claude Code timezone only for China time zones", () => {
  import_strict.default.deepEqual(claudeCodeUtcTimezoneEnvOverride("Asia/Shanghai"), { TZ: "UTC" });
  import_strict.default.deepEqual(claudeCodeUtcTimezoneEnvOverride("UTC"), {});
  import_strict.default.deepEqual(claudeCodeUtcTimezoneEnvOverride("America/Los_Angeles"), {});
});
(0, import_node_test.default)("exports Claude Code MCP config path env for wrapper injection", () => {
  import_strict.default.deepEqual(claudeCodeMcpConfigEnv("/tmp/toolhub-mcp.json"), {
    [CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json",
    [CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json"
  });
  import_strict.default.deepEqual(claudeCodeMcpConfigEnv(void 0), {});
});
(0, import_node_test.default)("builds Claude Code ToolHub MCP config when ToolHub has backend MCP servers", () => {
  const config = toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://resolver.example/v1",
        model: "resolver-model"
      },
      maxTools: 10,
      mcpServers: [
        {
          headers: { Authorization: "Bearer token" },
          name: "mcd-mcp",
          transport: "streamable-http",
          url: "https://mcp.mcd.cn"
        }
      ],
      requestTimeoutMs: 6e4
    }
  }, {
    command: "/Applications/CCR.app/Contents/MacOS/CCR",
    entryPath: "/Applications/CCR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"
  });
  import_strict.default.equal(Object.keys(config.mcpServers).length, 1);
  const server = config.mcpServers["ccr-toolhub"];
  import_strict.default.equal(server.command, "/Applications/CCR.app/Contents/MacOS/CCR");
  import_strict.default.deepEqual(server.args, ["/Applications/CCR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"]);
  import_strict.default.equal(server.env.ELECTRON_RUN_AS_NODE, "1");
  import_strict.default.equal(server.env.TOOLHUB_OPENAI_MODEL, "resolver-model");
  import_strict.default.equal(server.env.TOOLHUB_MAX_TOOLS, "10");
  import_strict.default.equal(server.env.TOOLHUB_REQUEST_TIMEOUT_MS, "60000");
  import_strict.default.deepEqual(JSON.parse(server.env.TOOLHUB_MCP_SERVERS_JSON), [
    {
      headers: { Authorization: "Bearer token" },
      name: "mcd-mcp",
      transport: "streamable-http",
      url: "https://mcp.mcd.cn"
    }
  ]);
});
(0, import_node_test.default)("does not build Claude Code ToolHub MCP config without enabled backend servers", () => {
  import_strict.default.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      mcpServers: []
    }
  }), void 0);
  import_strict.default.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: false,
      mcpServers: [
        {
          command: "node",
          name: "server",
          transport: "stdio"
        }
      ]
    }
  }), void 0);
});
