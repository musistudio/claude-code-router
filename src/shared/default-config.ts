import {
  CLAUDE_CODE_DEFAULT_ENV,
  DEFAULT_OVERVIEW_WIDGETS,
  DEFAULT_TRAY_COMPONENT_VARIANTS,
  DEFAULT_TRAY_WIDGETS,
  DEFAULT_TRAY_WINDOW_MODULES,
  type AppConfig,
  type ProxyRouteTarget
} from "./app";

export const DEFAULT_PROXY_TARGETS: ProxyRouteTarget[] = [
  { host: "api.anthropic.com", paths: ["/v1/messages", "/v1/messages/count_tokens"] },
  { host: "api.openai.com", paths: ["/v1/chat/completions", "/v1/responses", "/v1/models"] },
  { host: "generativelanguage.googleapis.com", paths: ["/v1beta/models", "/v1/models"] },
  { host: "openrouter.ai", paths: ["/api/v1/chat/completions", "/api/v1/responses", "/api/v1/models"] },
  { host: "api.deepseek.com", paths: ["/chat/completions", "/v1/chat/completions", "/models", "/v1/models"] },
  { host: "api.mistral.ai", paths: ["/v1/chat/completions", "/v1/models"] }
];

export type DefaultAppConfigOptions = {
  coreHost?: string;
  corePort?: number;
  generatedConfigFile: string;
  port?: number;
};

export function createDefaultAppConfig(options: DefaultAppConfigOptions): AppConfig {
  const coreHost = options.coreHost ?? "127.0.0.1";
  const port = options.port ?? 3456;
  const corePort = options.corePort ?? 3457;
  return {
    APIKEY: "",
    APIKEYS: [],
    API_TIMEOUT_MS: 600000,
    CUSTOM_ROUTER_PATH: "",
    HOST: "127.0.0.1",
    PORT: port,
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
      coreHost,
      corePort,
      enabled: true,
      generatedConfigFile: options.generatedConfigFile,
      host: "127.0.0.1",
      port
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
      targets: DEFAULT_PROXY_TARGETS
    },
    providerPlugins: [],
    overviewWidgets: DEFAULT_OVERVIEW_WIDGETS,
    routerEndpoint: `http://127.0.0.1:${port}`,
    theme: "system",
    trayComponentVariants: DEFAULT_TRAY_COMPONENT_VARIANTS,
    trayIcon: "random",
    trayProgressTargetTokens: 100000,
    trayWidgets: DEFAULT_TRAY_WIDGETS,
    trayWindowModules: DEFAULT_TRAY_WINDOW_MODULES,
    virtualModelProfiles: []
  };
}
