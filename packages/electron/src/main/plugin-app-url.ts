import { CLAUDE_DESIGN_PLUGIN_ID, knownGatewayPluginDefaultApps, type AppConfig, type GatewayPluginAppConfig } from "@ccr/core/contracts/app";

const DEFAULT_CLAUDE_DESIGN_FRONTEND_URL = "https://claude-design-assets.pages.dev/design";

export function pluginAppUrlForOpen(_config: AppConfig, pluginId: string, appUrl: string): string {
  if (pluginId !== CLAUDE_DESIGN_PLUGIN_ID) {
    return appUrl;
  }
  if (!isLegacyClaudeDesignUrl(appUrl)) {
    return appUrl;
  }
  return knownGatewayPluginDefaultApps(CLAUDE_DESIGN_PLUGIN_ID)?.find((app) => app.id === "claude-design")?.url ||
    DEFAULT_CLAUDE_DESIGN_FRONTEND_URL;
}

export function builtInPluginAppForOpen(pluginId: string, appId?: string): GatewayPluginAppConfig | undefined {
  if (pluginId !== CLAUDE_DESIGN_PLUGIN_ID) {
    return undefined;
  }
  const apps = knownGatewayPluginDefaultApps(pluginId) || [];
  if (appId) {
    return apps.find((app) => (app.id || app.name) === appId);
  }
  return apps[0];
}

export function isLegacyClaudeDesignUrl(value: string): boolean {
  try {
    const url = new URL(value, "https://claude.ai");
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/$/, "");
    if (host === "claude.ai") {
      return pathname === "/discover/design" || pathname === "/design";
    }
    if (host === "claude-design-assets.pages.dev") {
      return pathname === "/discover/design";
    }
    return false;
  } catch {
    return false;
  }
}
