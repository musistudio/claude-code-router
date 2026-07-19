import { join as pathJoin } from "node:path";
import type { AppConfig, GatewayMcpServerConfig } from "@ccr/core/contracts/app";
import { MEDIA_TOOLS_MCP_SERVER_NAME } from "@ccr/core/contracts/app";
import { mediaMcpToolDefinition, mediaToolBindingsForConfig } from "@ccr/core/media/tools";

export const MEDIA_TOOLS_MCP_PATH = "/__ccr/media/mcp";
export const LEGACY_GROK_MEDIA_MCP_PATH = "/__ccr/grok-media/mcp";
export const MEDIA_ARTIFACT_PATH_PREFIX = "/__ccr/media/artifacts/";
export const LEGACY_GROK_MEDIA_ARTIFACT_PATH_PREFIX = "/__ccr/grok-media/artifacts/";

export function mediaToolsMcpEnabled(config: AppConfig | undefined): boolean {
  return Boolean(config?.mediaTools?.enabled);
}

export function mediaToolsMcpServer(
  config: AppConfig | undefined,
  options: { apiKey?: string } = {}
): GatewayMcpServerConfig | undefined {
  if (!config || !mediaToolsMcpEnabled(config) || !hasGatewayEndpoint(config)) return undefined;
  const apiKey = options.apiKey || firstConfiguredApiKey(config);
  return {
    args: [bundledMediaToolsMcpEntryPath()],
    command: process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      ...(apiKey ? { CCR_MEDIA_MCP_API_KEY: apiKey } : {}),
      CCR_MEDIA_MCP_TOOLS_JSON: JSON.stringify(mediaToolBindingsForConfig(config).map(mediaMcpToolDefinition)),
      CCR_MEDIA_MCP_URL: `${mediaToolsGatewayEndpoint(config)}${MEDIA_TOOLS_MCP_PATH}`,
      CCR_MEDIA_MCP_REQUEST_TIMEOUT_MS: String(Math.min(3600000, Math.max(60000, config.mediaTools.jobTimeoutMs + 30000)))
    },
    name: MEDIA_TOOLS_MCP_SERVER_NAME,
    protocolVersion: "2024-11-05",
    requestTimeoutMs: Math.min(3600000, Math.max(60000, config.mediaTools.jobTimeoutMs + 30000)),
    startupTimeoutMs: 60000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}

export function bundledMediaToolsMcpEntryPath(): string {
  return pathJoin(__dirname, "media-tools-proxy-mcp.js");
}


function firstConfiguredApiKey(config: AppConfig): string | undefined {
  return (Array.isArray(config.APIKEYS) ? config.APIKEYS : [])
    .find((apiKey) => apiKey.key.trim())?.key.trim() || stringValue(config.APIKEY);
}

export function mediaToolsGatewayEndpoint(config: AppConfig): string {
  return `http://${formatHost(clientGatewayHost(config.gateway.host))}:${config.gateway.port}`;
}

function hasGatewayEndpoint(config: AppConfig): boolean {
  const gateway = (config as Partial<AppConfig>).gateway;
  return Boolean(gateway && stringValue(gateway.host) && Number.isFinite(gateway.port));
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function clientGatewayHost(host: string): string {
  const value = stringValue(host) ?? "127.0.0.1";
  if (value === "0.0.0.0") return "127.0.0.1";
  if (value === "::" || value === "[::]") return "::1";
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
