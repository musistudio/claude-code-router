import { withClaudeDesignRuntimePluginConfig, withClaudeShipRuntimePluginConfig } from "@ccr/core/config/config";
import { CLAUDE_DESIGN_PLUGIN_ID, CLAUDE_SHIP_PLUGIN_ID, knownGatewayPluginDefaultApps, type AppConfig, type GatewayPluginAppConfig, type GatewayPluginConfig } from "@ccr/core/contracts/app";

const DEFAULT_CLAUDE_DESIGN_FRONTEND_URL = "https://claude-design.ccrdesk.top/design";
const DESIGN_FRONTEND_URL_ENV_KEYS = ["CCR_CLAUDE_DESIGN_FRONTEND_URL", "CCR_CLAUDE_DESIGN_WEB_URL"];
const DESIGN_FRONTEND_ASSETS_ORIGIN_ENV_KEYS = ["CCR_CLAUDE_DESIGN_FRONTEND_ORIGIN", "CCR_CLAUDE_DESIGN_ASSETS_ORIGIN"];
const SHIP_FRONTEND_URL_ENV_KEYS = ["CCR_CLAUDE_SHIP_FRONTEND_URL", "CCR_CLAUDE_SHIP_WEB_URL"];
const SHIP_FRONTEND_ASSETS_ORIGIN_ENV_KEYS = ["CCR_CLAUDE_SHIP_FRONTEND_ORIGIN", "CCR_CLAUDE_SHIP_ASSETS_ORIGIN", "CCR_CLAUDE_DESIGN_ASSETS_ORIGIN"];

type ClaudeProductAppOpenConfig = {
  appPath: string;
  assetsOriginConfigKeys: string[];
  assetsOriginEnvKeys: string[];
  pluginId: string;
  urlConfigKeys: string[];
  urlEnvKeys: string[];
};

const CLAUDE_PRODUCT_APP_OPEN_CONFIGS: Record<string, ClaudeProductAppOpenConfig> = {
  [CLAUDE_DESIGN_PLUGIN_ID]: {
    appPath: "/design",
    assetsOriginConfigKeys: ["designFrontendAssetsOrigin", "designFrontendOrigin", "designAssetsOrigin", "frontendAssetsOrigin", "frontendOrigin", "assetsOrigin", "staticAssetsOrigin"],
    assetsOriginEnvKeys: DESIGN_FRONTEND_ASSETS_ORIGIN_ENV_KEYS,
    pluginId: CLAUDE_DESIGN_PLUGIN_ID,
    urlConfigKeys: ["designFrontendUrl", "designWebUrl", "frontendUrl", "webUrl"],
    urlEnvKeys: DESIGN_FRONTEND_URL_ENV_KEYS
  },
  [CLAUDE_SHIP_PLUGIN_ID]: {
    appPath: "/claude-ship",
    assetsOriginConfigKeys: ["shipFrontendAssetsOrigin", "shipFrontendOrigin", "shipAssetsOrigin", "frontendAssetsOrigin", "frontendOrigin", "assetsOrigin", "staticAssetsOrigin"],
    assetsOriginEnvKeys: SHIP_FRONTEND_ASSETS_ORIGIN_ENV_KEYS,
    pluginId: CLAUDE_SHIP_PLUGIN_ID,
    urlConfigKeys: ["shipFrontendUrl", "shipWebUrl", "frontendUrl", "webUrl"],
    urlEnvKeys: SHIP_FRONTEND_URL_ENV_KEYS
  }
};

export function pluginAppUrlForOpen(config: AppConfig, pluginId: string, appUrl: string): string {
  const frontendOverride = claudeProductFrontendUrlForOpen(config, pluginId);
  if (frontendOverride) {
    return frontendOverride;
  }

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

export function configForPluginAppOpen(config: AppConfig, pluginId: string): AppConfig {
  if (pluginId === CLAUDE_DESIGN_PLUGIN_ID) {
    return withClaudeDesignRuntimePluginConfig(config);
  }
  if (pluginId === CLAUDE_SHIP_PLUGIN_ID) {
    return withClaudeShipRuntimePluginConfig(config);
  }
  return config;
}

function claudeProductFrontendUrlForOpen(config: AppConfig, pluginId: string): string {
  const product = CLAUDE_PRODUCT_APP_OPEN_CONFIGS[pluginId];
  if (!product) {
    return "";
  }

  const pluginOptions = pluginConfigOptions(config, product.pluginId);
  const configuredUrl = normalizeHttpUrl(
    firstConfigValue(pluginOptions, product.urlConfigKeys) ||
    firstEnvValue(product.urlEnvKeys)
  );
  if (configuredUrl) {
    return configuredUrl;
  }

  const configuredOrigin = normalizeHttpOrigin(
    firstConfigValue(pluginOptions, product.assetsOriginConfigKeys) ||
    firstEnvValue(product.assetsOriginEnvKeys)
  );
  return configuredOrigin ? new URL(product.appPath, configuredOrigin).toString() : "";
}

function pluginConfigOptions(config: AppConfig, pluginId: string): Record<string, unknown> | undefined {
  const plugin = config.plugins.find((candidate: GatewayPluginConfig) => (
    candidate.enabled !== false &&
    candidate.id === pluginId
  ));
  return isRecord(plugin?.config) ? plugin.config : undefined;
}

function firstConfigValue(config: Record<string, unknown> | undefined, keys: string[]): string {
  if (!config) {
    return "";
  }
  for (const key of keys) {
    const value = stringValue(config[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function firstEnvValue(keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(process.env[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeHttpUrl(value: string): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeHttpOrigin(value: string): string {
  const normalized = normalizeHttpUrl(value);
  return normalized ? new URL(normalized).origin : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLegacyClaudeDesignUrl(value: string): boolean {
  try {
    const url = new URL(value, "https://claude.ai");
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/$/, "");
    if (host === "claude.ai") {
      return pathname === "/discover/design" || pathname === "/design";
    }
    return false;
  } catch {
    return false;
  }
}
