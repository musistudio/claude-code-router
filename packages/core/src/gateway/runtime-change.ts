import type { AppConfig } from "@ccr/core/contracts/app";

export function shouldRestartGatewayForRuntimeConfigChange(previousConfig: AppConfig, nextConfig: AppConfig): boolean {
  return (
    previousConfig.gateway.enabled !== nextConfig.gateway.enabled ||
    previousConfig.gateway.host !== nextConfig.gateway.host ||
    previousConfig.gateway.port !== nextConfig.gateway.port ||
    previousConfig.gateway.coreHost !== nextConfig.gateway.coreHost ||
    previousConfig.gateway.corePort !== nextConfig.gateway.corePort ||
    previousConfig.proxy.enabled !== nextConfig.proxy.enabled ||
    previousConfig.proxy.host !== nextConfig.proxy.host ||
    previousConfig.proxy.mode !== nextConfig.proxy.mode ||
    previousConfig.proxy.port !== nextConfig.proxy.port ||
    previousConfig.proxy.systemProxy !== nextConfig.proxy.systemProxy ||
    JSON.stringify(previousConfig.proxy.targets) !== JSON.stringify(nextConfig.proxy.targets) ||
    JSON.stringify(previousConfig.proxy.upstream) !== JSON.stringify(nextConfig.proxy.upstream) ||
    JSON.stringify(previousConfig.agent) !== JSON.stringify(nextConfig.agent) ||
    JSON.stringify(previousConfig.Providers) !== JSON.stringify(nextConfig.Providers) ||
    JSON.stringify(previousConfig.plugins) !== JSON.stringify(nextConfig.plugins) ||
    JSON.stringify(previousConfig.providerPlugins) !== JSON.stringify(nextConfig.providerPlugins) ||
    JSON.stringify(previousConfig.toolHub) !== JSON.stringify(nextConfig.toolHub) ||
    JSON.stringify(previousConfig.virtualModelProfiles) !== JSON.stringify(nextConfig.virtualModelProfiles)
  );
}
