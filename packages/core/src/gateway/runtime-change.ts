import type { AppConfig } from "@ccr/core/contracts/app";

export function shouldRestartGatewayForRuntimeConfigChange(previousConfig: AppConfig, nextConfig: AppConfig): boolean {
  return runtimeGatewayConfigSignature(previousConfig) !== runtimeGatewayConfigSignature(nextConfig);
}

function runtimeGatewayConfigSignature(config: AppConfig): string {
  return JSON.stringify({
    APIKEY: config.APIKEY,
    APIKEYS: config.APIKEYS,
    API_TIMEOUT_MS: config.API_TIMEOUT_MS,
    CUSTOM_ROUTER_PATH: config.CUSTOM_ROUTER_PATH,
    HOST: config.HOST,
    PORT: config.PORT,
    Providers: config.Providers,
    Router: config.Router,
    agent: config.agent,
    contextArchive: config.contextArchive,
    gateway: config.gateway,
    mediaTools: config.mediaTools,
    observability: {
      agentAnalysis: config.observability.agentAnalysis,
      requestLogBodyCapture: config.observability.requestLogBodyCapture,
      requestLogMaxBodyBytes: config.observability.requestLogMaxBodyBytes,
      requestLogs: config.observability.requestLogs
    },
    plugins: config.plugins,
    preferredProvider: config.preferredProvider,
    profile: config.profile,
    providerPlugins: config.providerPlugins,
    proxy: config.proxy,
    toolHub: config.toolHub,
    virtualModelProfiles: config.virtualModelProfiles
  });
}
