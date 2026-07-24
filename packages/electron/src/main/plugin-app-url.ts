import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAUDE_DESIGN_PLUGIN_ID, knownGatewayPluginDefaultApps, type AppConfig } from "@ccr/core/contracts/app";

const DEFAULT_CLAUDE_DESIGN_FRONTEND_URL = "https://claude-design-assets.pages.dev/design";

export function pluginAppUrlForOpen(config: AppConfig, pluginId: string, appUrl: string): string {
  if (pluginId !== CLAUDE_DESIGN_PLUGIN_ID) {
    return appUrl;
  }
  if (!isLegacyClaudeDesignUrl(appUrl)) {
    return appUrl;
  }
  if (shouldOpenSavedClaudeDesignFrontend(config)) {
    return "https://claude.ai/design";
  }
  return knownGatewayPluginDefaultApps(CLAUDE_DESIGN_PLUGIN_ID)?.find((app) => app.id === "claude-design")?.url ||
    DEFAULT_CLAUDE_DESIGN_FRONTEND_URL;
}

export function shouldOpenSavedClaudeDesignFrontend(config: AppConfig): boolean {
  const plugin = config.plugins.find((candidate) => candidate.enabled !== false && candidate.id === CLAUDE_DESIGN_PLUGIN_ID);
  const pluginConfig = readRecord(plugin?.config);
  if (
    pluginConfig?.savedHtmlPath === false ||
    pluginConfig?.htmlPath === false ||
    pluginConfig?.designHtmlPath === false ||
    pluginConfig?.useSavedHtml === false
  ) {
    return false;
  }
  const configuredPath = readString(pluginConfig?.savedHtmlPath) ||
    readString(pluginConfig?.htmlPath) ||
    readString(pluginConfig?.designHtmlPath) ||
    process.env.CCR_CLAUDE_DESIGN_HTML_PATH ||
    process.env.CLAUDE_DESIGN_HTML_PATH;
  if (configuredPath) {
    return existsSync(path.resolve(expandHomePath(configuredPath)));
  }
  const home = os.homedir();
  return Boolean(home && existsSync(path.join(home, "Downloads", "Claude Design.html")));
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
