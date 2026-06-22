import {
  CLAUDE_CODE_DEFAULT_ENV,
  DEFAULT_OVERVIEW_WIDGETS,
  DEFAULT_TRAY_COMPONENT_VARIANTS,
  DEFAULT_TRAY_WIDGETS,
  DEFAULT_TRAY_WINDOW_MODULES
} from "../../../../shared/app";
import type {
  AppConfig,
  AppInfo,
  AppUpdateStatus,
  GatewayStatus,
  ProxyCertificateStatus,
  ProxyNetworkSnapshot,
  ProxyStatus
} from "../../../../shared/app";

export const fallbackInfo: AppInfo = {
  apiKeysDbFile: "Browser preview",
  configDir: "Browser preview",
  configFile: "Browser preview",
  dataDir: "Browser preview",
  gatewayConfigFile: "Browser preview",
  name: "Claude Code Router",
  platform: navigator.platform,
  requestLogsDbFile: "Browser preview",
  usageDbFile: "Browser preview",
  version: "0.1.0"
};

export const fallbackUpdateStatus: AppUpdateStatus = {
  canCheck: false,
  canDownload: false,
  canInstall: false,
  currentVersion: fallbackInfo.version,
  state: "idle",
  supported: false
};

export const fallbackConfig: AppConfig = {
  APIKEY: "",
  APIKEYS: [],
  API_TIMEOUT_MS: 600000,
  CUSTOM_ROUTER_PATH: "",
  HOST: "127.0.0.1",
  PORT: 3456,
  Providers: [],
  Router: {
    fallback: {
      mode: "off",
      models: [],
      retryCount: 1
    },
    longContextThreshold: 200000,
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
    platform: "none",
    pollIntervalMs: 2000,
    requestTimeoutMs: 600000,
    sourceDir: "",
    startupTimeoutMs: 10000,
    stateDir: "",
    tenantId: "ccr"
  },
  gateway: {
    coreHost: "127.0.0.1",
    corePort: 3457,
    enabled: true,
    generatedConfigFile: "Browser preview",
    host: "127.0.0.1",
    port: 3456
  },
  observability: {
    agentAnalysis: false,
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
    targets: [
      { host: "api.anthropic.com", paths: ["/v1/messages", "/v1/messages/count_tokens"] },
      { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/responses", "/v1/models"] },
      { host: "generativelanguage.googleapis.com", paths: ["/v1beta/models", "/v1/models"] },
      { host: "openrouter.ai", paths: ["/api/v1/chat/completions", "/api/v1/responses", "/api/v1/models"] },
      { host: "api.deepseek.com", paths: ["/chat/completions", "/v1/chat/completions", "/models", "/v1/models"] },
      { host: "api.mistral.ai", paths: ["/v1/chat/completions", "/v1/models"] }
    ]
  },
  providerPlugins: [],
  overviewWidgets: DEFAULT_OVERVIEW_WIDGETS,
  routerEndpoint: "http://127.0.0.1:3456",
  theme: "system",
  trayComponentVariants: DEFAULT_TRAY_COMPONENT_VARIANTS,
  trayIcon: "random",
  trayProgressTargetTokens: 100000,
  trayWidgets: DEFAULT_TRAY_WIDGETS,
  trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
  virtualModelProfiles: []
};

export const fallbackGatewayStatus: GatewayStatus = {
  coreEndpoint: "http://127.0.0.1:3457",
  endpoint: "http://127.0.0.1:3456",
  generatedConfigFile: "Browser preview",
  state: "stopped"
};

export const fallbackProxyStatus: ProxyStatus = {
  caCertFile: "Browser preview",
  endpoint: "http://127.0.0.1:3456",
  mode: "gateway",
  port: 3456,
  state: "stopped",
  systemProxy: {
    state: "unsupported"
  },
  targetHosts: []
};

export const fallbackProxyCertificateStatus: ProxyCertificateStatus = {
  caCertFile: "Browser preview",
  canInstall: false,
  message: "Certificate detection is available in the Electron app.",
  platform: navigator.platform,
  state: "unknown",
  trusted: false
};

export const fallbackProxyNetworkSnapshot: ProxyNetworkSnapshot = {
  capturedAt: new Date().toISOString(),
  captureEnabled: false,
  items: [],
  maxBodyBytes: 256 * 1024,
  maxEntries: 200
};
