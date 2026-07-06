import { join as pathJoin } from "node:path";
import { CONFIGDIR } from "@ccr/core/config/constants";
import type { AppConfig } from "@ccr/core/contracts/app";

export const TOOL_HUB_MCP_SERVER_NAME = "ccr-toolhub";
export const TOOL_HUB_MCP_RUNTIME_FILE_NAME = "toolhub-mcp.js";

export type ToolHubMcpRuntimeConfig = {
  args: string[];
  command: string;
  env: Record<string, string>;
};

export type ClaudeCodeMcpServerConfig = ToolHubMcpRuntimeConfig | {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
} | {
  headers?: Record<string, string>;
  type: "http" | "sse";
  url: string;
};

export type ToolHubClaudeCodeMcpConfig = {
  mcpServers: Record<string, ClaudeCodeMcpServerConfig>;
};

export function toolHubBackendServers(config: AppConfig | undefined, extraServers: unknown[] = []): unknown[] {
  return [
    ...(Array.isArray(config?.agent?.mcpServers) ? config.agent.mcpServers : []),
    ...(Array.isArray(config?.toolHub?.mcpServers) ? config.toolHub.mcpServers : []),
    ...extraServers
  ].filter(isToolHubBackendServer);
}

export function toolHubMcpRuntimeConfig(
  config: AppConfig | undefined,
  backendServers = toolHubBackendServers(config),
  options: {
    command?: string;
    entryPath?: string;
    resolver?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  } = {}
): ToolHubMcpRuntimeConfig | undefined {
  const toolHub = config?.toolHub;
  if (!toolHub?.enabled) {
    return undefined;
  }

  const normalizedBackendServers = backendServers.filter(isToolHubBackendServer);
  if (normalizedBackendServers.length === 0) {
    return undefined;
  }

  return {
    args: [options.entryPath ?? bundledToolHubMcpEntryPath()],
    command: options.command ?? process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      TOOLHUB_CACHE_FILE: pathJoin(CONFIGDIR, "toolhub-cache.json"),
      TOOLHUB_MAX_TOOLS: String(toolHub.maxTools ?? 10),
      TOOLHUB_MCP_SERVERS_JSON: JSON.stringify(normalizedBackendServers),
      TOOLHUB_OPENAI_API_KEY: options.resolver?.apiKey ?? toolHub.llm?.apiKey ?? "",
      TOOLHUB_OPENAI_BASE_URL: options.resolver?.baseUrl ?? toolHub.llm?.baseUrl ?? "https://api.openai.com/v1",
      TOOLHUB_OPENAI_MODEL: options.resolver?.model ?? toolHub.llm?.model ?? "",
      TOOLHUB_REQUEST_TIMEOUT_MS: String(toolHub.requestTimeoutMs ?? 60000)
    }
  };
}

export function toolHubClaudeCodeMcpConfig(
  config: AppConfig | undefined,
  options: Parameters<typeof toolHubMcpRuntimeConfig>[2] = {}
): ToolHubClaudeCodeMcpConfig | undefined {
  const toolHub = config?.toolHub;
  if (!toolHub?.enabled) {
    return undefined;
  }

  const backendServers = toolHubBackendServers(config);
  if (backendServers.length === 0) {
    return undefined;
  }

  const runtimeConfig = toolHubMcpRuntimeConfig(config, backendServers, options);
  return runtimeConfig
    ? { mcpServers: { [TOOL_HUB_MCP_SERVER_NAME]: runtimeConfig } }
    : undefined;
}

export function bundledToolHubMcpEntryPath(): string {
  return pathJoin(__dirname, TOOL_HUB_MCP_RUNTIME_FILE_NAME);
}

export function bundledToolHubMcpEntryPathCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return uniqueStrings([
    bundledToolHubMcpEntryPath(),
    ...(resourcesPath
      ? [
          pathJoin(resourcesPath, "app.asar", "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME),
          pathJoin(resourcesPath, "app", "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME)
        ]
      : []),
    pathJoin(process.cwd(), "packages", "electron", "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME),
    pathJoin(process.cwd(), "packages", "cli", "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME),
    pathJoin(process.cwd(), "packages", "core", "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME),
    pathJoin(process.cwd(), "dist", "main", TOOL_HUB_MCP_RUNTIME_FILE_NAME)
  ]);
}

function isToolHubBackendServer(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && stringValue(value.name)?.toLowerCase() !== TOOL_HUB_MCP_SERVER_NAME;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
