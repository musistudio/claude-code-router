/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import { join as pathJoin } from "node:path";
import type { AppConfig, GatewayMcpServerConfig, VirtualModelFusionVisionConfig, VirtualModelFusionWebSearchConfig, VirtualModelFusionWebSearchProvider } from "@ccr/core/contracts/app";
import { BUILTIN_FUSION_VISION_TOOL_NAME, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME } from "@ccr/core/contracts/app";
import { TOOL_HUB_MCP_SERVER_NAME, toolHubBuiltInBackendServers, toolHubMcpRuntimeConfig, toolHubRequestTimeoutMs } from "@ccr/core/mcp/toolhub-config";
import { isRecord, numberValue, stringListValue, stringValue } from "@ccr/core/gateway/internal/value";
import { defaultFusionWebSearchProvider, fusionModelProviderName } from "@ccr/core/gateway/internal/shared";
import type { BrowserWebSearchMcpIntegration, CoreGatewayProvider } from "@ccr/core/gateway/internal/shared";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";


export async function fusionBuiltinToolArtifacts(
  profiles: unknown[],
  coreEndpoint: string,
  coreAuthToken: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration
): Promise<{ mcpServers: GatewayMcpServerConfig[]; providers: CoreGatewayProvider[] }> {
  const providers: CoreGatewayProvider[] = [];
  const mcpServers: GatewayMcpServerConfig[] = [];
  const toolServerKeys = new Set<string>();
  const entry = bundledFusionBuiltinMcpEntryPath();

  for (const [index, profile] of profiles.entries()) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }
    const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
    const profileId = stringValue(profile.id) || stringValue(profile.key) || `fusion-${index + 1}`;
    const sanitizedProfileId = sanitizeMcpServerName(profileId);

    const visionConfig = readFusionVisionConfig(metadata?.fusionVision) ?? legacyFusionVisionConfig(profile);
    if (visionConfig?.toolName) {
      const resolvedVision = resolveFusionVisionRuntime(visionConfig);
      providers.push(...resolvedVision.providers);
      const toolServerKey = `vision:${visionConfig.toolName}`;
      if (!toolServerKeys.has(toolServerKey)) {
        toolServerKeys.add(toolServerKey);
        const useGatewayVisionRuntime = !visionConfig.baseUrl;
        mcpServers.push(fusionBuiltinMcpServer({
          entry,
          env: {
            FUSION_BUILTIN_TOOL_KIND: "vision",
            FUSION_TOOL_NAME: visionConfig.toolName,
            ...(useGatewayVisionRuntime ? { VISION_GATEWAY_BASE_URL: `${coreEndpoint}/v1` } : { VISION_BASE_URL: visionConfig.baseUrl || "" }),
            ...(useGatewayVisionRuntime && coreAuthToken ? { VISION_GATEWAY_API_KEY: coreAuthToken } : {}),
            ...(resolvedVision.model ? { VISION_MODEL: resolvedVision.model } : {}),
            ...(visionConfig.baseUrl && visionConfig.apiKey ? { VISION_API_KEY: visionConfig.apiKey } : {}),
            ...(visionConfig.timeoutMs ? { VISION_TIMEOUT_MS: String(visionConfig.timeoutMs) } : {})
          },
          name: `fusion-vision-${sanitizedProfileId}`
        }));
      }
    }

    const webSearchConfig = readFusionWebSearchConfig(metadata?.fusionWebSearch) ?? legacyFusionWebSearchConfig(profile);
    if (webSearchConfig?.toolName) {
      const toolServerKey = `web_search:${webSearchConfig.toolName}`;
      if (!toolServerKeys.has(toolServerKey)) {
        toolServerKeys.add(toolServerKey);
        const provider = webSearchConfig.provider ?? defaultFusionWebSearchProvider;
        if (provider === "browser") {
          const browserMcpServer = await browserWebSearchMcpIntegration?.registerBrowserWebSearchMcpServer({
            env: webSearchConfig.env ?? {},
            name: `fusion-browser-web-search-${sanitizedProfileId}`,
            resultCount: webSearchConfig.resultCount,
            timeoutMs: webSearchConfig.timeoutMs,
            toolName: webSearchConfig.toolName
          });
          if (browserMcpServer) {
            mcpServers.push(browserMcpServer);
          }
        } else {
          mcpServers.push(fusionBuiltinMcpServer({
            entry,
            env: {
              FUSION_BUILTIN_TOOL_KIND: "web_search",
              FUSION_TOOL_NAME: webSearchConfig.toolName,
              SEARCH_PROVIDER: provider,
              ...(webSearchConfig.resultCount ? { SEARCH_RESULT_COUNT: String(webSearchConfig.resultCount) } : {}),
              ...(webSearchConfig.timeoutMs ? { SEARCH_TIMEOUT_MS: String(webSearchConfig.timeoutMs) } : {}),
              ...(webSearchConfig.env ?? {})
            },
            name: `fusion-web-search-${sanitizedProfileId}`
          }));
        }
      }
    }
  }

  return { mcpServers, providers };
}


export async function fusionBuiltinToolArtifactsForTest(
  profiles: unknown[],
  coreEndpoint: string,
  coreAuthToken: string,
  browserWebSearchMcpIntegration?: BrowserWebSearchMcpIntegration
): Promise<{ mcpServers: GatewayMcpServerConfig[]; providers: unknown[] }> {
  return fusionBuiltinToolArtifacts(profiles, coreEndpoint, coreAuthToken, browserWebSearchMcpIntegration);
}


function fusionBuiltinMcpServer({
  entry,
  env,
  name
}: {
  entry: string;
  env: Record<string, string>;
  name: string;
}): GatewayMcpServerConfig {
  return {
    args: [entry],
    command: process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      ...env
    },
    name,
    protocolVersion: "2024-11-05",
    requestTimeoutMs: 600000,
    startupTimeoutMs: 600000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}


function bundledFusionBuiltinMcpEntryPath(): string {
  return pathJoin(__dirname, "fusion-vision-mcp.js");
}


export function fusionToolFallbackMcpServer(
  profiles: unknown[],
  existingServers: unknown[]
): GatewayMcpServerConfig | undefined {
  const tools = fusionFallbackToolDefinitions(profiles, fusionToolNamesBackedByMcpServers(existingServers));
  if (tools.length === 0) {
    return undefined;
  }

  return {
    args: [bundledFusionToolFallbackMcpEntryPath()],
    command: process.execPath,
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_FALLBACK_TOOLS_JSON: JSON.stringify(tools)
    },
    name: uniqueMcpServerName("ccr-fusion-tool-fallback", existingServers),
    protocolVersion: "2024-11-05",
    requestTimeoutMs: 600000,
    startupTimeoutMs: 600000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}


function bundledFusionToolFallbackMcpEntryPath(): string {
  return pathJoin(__dirname, "fusion-tool-fallback-mcp.js");
}


export function toolHubMcpServer(config: AppConfig, backendServers: unknown[]): GatewayMcpServerConfig | undefined {
  const toolHub = config.toolHub;
  const runtimeBackendServers = [
    ...toolHubBuiltInBackendServers(config),
    ...backendServers
  ];
  const runtimeConfig = toolHubMcpRuntimeConfig(config, runtimeBackendServers);
  if (!toolHub?.enabled || !runtimeConfig) {
    return undefined;
  }

  return {
    ...runtimeConfig,
    name: uniqueMcpServerName(TOOL_HUB_MCP_SERVER_NAME, runtimeBackendServers),
    protocolVersion: "2024-11-05",
    requestTimeoutMs: toolHubRequestTimeoutMs(config, runtimeBackendServers),
    startupTimeoutMs: 600000,
    stdioMessageMode: "content-length",
    transport: "stdio"
  };
}


export function fusionFallbackToolDefinitions(
  profiles: unknown[],
  backedToolNames: Set<string> = new Set()
): FusionFallbackToolDefinition[] {
  const byName = new Map<string, FusionFallbackToolDefinition>();

  for (const profile of profiles) {
    if (!isRecord(profile) || profile.enabled === false) {
      continue;
    }

    if (Array.isArray(profile.tools)) {
      for (const tool of profile.tools) {
        if (!isRecord(tool)) {
          continue;
        }
        const name = stringValue(tool.name);
        if (!name) {
          continue;
        }
        if (backedToolNames.has(name)) {
          continue;
        }

        const existing = byName.get(name);
        const description = stringValue(tool.description);
        const inputSchema = isRecord(tool.inputSchema)
          ? tool.inputSchema
          : isRecord(tool.input_schema)
            ? tool.input_schema
            : undefined;
        const unavailableMessage = fusionFallbackToolUnavailableMessage(profile, name);
        if (existing) {
          if (!existing.description && description) {
            existing.description = description;
          }
          if (!existing.inputSchema && inputSchema) {
            existing.inputSchema = inputSchema;
          }
          if (!existing.unavailableMessage && unavailableMessage) {
            existing.unavailableMessage = unavailableMessage;
          }
          continue;
        }

        byName.set(name, {
          ...(description ? { description } : {}),
          ...(inputSchema ? { inputSchema } : {}),
          ...(unavailableMessage ? { unavailableMessage } : {}),
          name
        });
      }
    }

    const browserFallback = browserWebSearchFallbackToolDefinition(profile, backedToolNames);
    if (browserFallback && !byName.has(browserFallback.name)) {
      byName.set(browserFallback.name, browserFallback);
    }
  }

  return [...byName.values()];
}


type FusionFallbackToolDefinition = {
  description?: string;
  inputSchema?: Record<string, unknown>;
  name: string;
  unavailableMessage?: string;
};


function fusionFallbackToolUnavailableMessage(profile: unknown, toolName: string): string | undefined {
  if (!isRecord(profile)) {
    return undefined;
  }
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const webSearchConfig = readFusionWebSearchConfig(fusionWebSearch);
  if (webSearchConfig?.provider !== "browser" || webSearchConfig.toolName !== toolName) {
    return undefined;
  }
  return browserWebSearchUnavailableMessage(toolName);
}


export function browserWebSearchUnavailableMessage(toolName: string): string {
  return [
    `Fusion MCP tool "${toolName}" is unavailable because In-app Browser web search requires CCR Desktop.`,
    "This runtime did not register the Electron browser web search integration, so the hidden browser search tool cannot run here.",
    "Run the profile in CCR Desktop or switch the Fusion web search provider to Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, or Exa."
  ].join(" ");
}


function browserWebSearchFallbackToolDefinition(
  profile: Record<string, unknown>,
  backedToolNames: Set<string>
): FusionFallbackToolDefinition | undefined {
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const webSearchConfig = readFusionWebSearchConfig(fusionWebSearch);
  if (webSearchConfig?.provider !== "browser" || !webSearchConfig.toolName || backedToolNames.has(webSearchConfig.toolName)) {
    return undefined;
  }
  return {
    description: "Fallback registration for CCR In-app Browser web search when the Electron browser integration is unavailable.",
    inputSchema: {
      additionalProperties: true,
      properties: {
        count: { maximum: 20, minimum: 1, type: "number" },
        prompt: { type: "string" },
        query: { type: "string" }
      },
      required: ["prompt"],
      type: "object"
    },
    name: webSearchConfig.toolName,
    unavailableMessage: fusionFallbackToolUnavailableMessage(profile, webSearchConfig.toolName)
  };
}


export function fusionToolNamesBackedByMcpServers(servers: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const server of servers) {
    if (!isRecord(server)) {
      continue;
    }
    const serverName = stringValue(server.name);
    if (serverName) {
      names.add(serverName);
    }

    const env = isRecord(server.env) ? server.env : undefined;
    const fusionToolName = stringValue(env?.FUSION_TOOL_NAME);
    if (fusionToolName) {
      names.add(fusionToolName);
    }
  }
  return names;
}


function uniqueMcpServerName(baseName: string, servers: unknown[]): string {
  const used = new Set(
    servers
      .map((server) => isRecord(server) ? stringValue(server.name)?.toLowerCase() : undefined)
      .filter((name): name is string => Boolean(name))
  );
  if (!used.has(baseName.toLowerCase())) {
    return baseName;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${baseName}-${index}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}


export function withFusionVirtualModelAliases(profiles: unknown[]): unknown[] {
  return profiles.map((profile) => {
    if (!isRecord(profile)) {
      return profile;
    }
    const match = isRecord(profile.match) ? profile.match : {};
    const exactAliases = stringListValue(match.exactAliases);
    const catalogNames = exactAliases.length > 0
      ? exactAliases
      : [stringValue(profile.key) || stringValue(profile.displayName)].filter((value): value is string => Boolean(value));
    const fusionAliases = catalogNames.flatMap(fusionModelSelectors).filter(Boolean);
    if (fusionAliases.length === 0) {
      return profile;
    }
    return {
      ...profile,
      match: {
        ...match,
        exactAliases: uniqueStrings([...exactAliases, ...fusionAliases])
      }
    };
  });
}


export function withCodexCompatibleVirtualModelProfiles(profiles: unknown[]): unknown[] {
  return profiles.map((profile) => {
    if (!isRecord(profile) || profile.enabled === false) {
      return profile;
    }
    const materialization = isRecord(profile.materialization) ? profile.materialization : {};
    if (materialization.enabled === false || materialization.includeInGatewayModels === false) {
      return profile;
    }
    const execution = isRecord(profile.execution) ? profile.execution : {};
    if (execution.clientToolsPolicy === "allow") {
      return profile;
    }
    return {
      ...profile,
      execution: {
        ...execution,
        clientToolsPolicy: "allow"
      }
    };
  });
}


export function fusionModelSelector(model: string): string {
  const normalized = fusionModelNameFromSelector(model);
  return normalized ? `${fusionModelProviderName}/${normalized}` : "";
}


function fusionModelSelectors(model: string): string[] {
  const normalized = fusionModelNameFromSelector(model);
  if (!normalized) {
    return [];
  }
  const lowerModel = normalized.toLowerCase();
  return uniqueStrings([
    fusionModelSelector(normalized),
    lowerModel,
    `${fusionModelProviderName}/${lowerModel}`,
    `${fusionModelProviderName.toLowerCase()}/${lowerModel}`
  ]);
}


export function fusionModelNameFromSelector(model: string): string {
  const trimmed = model.trim();
  const prefix = `${fusionModelProviderName}/`;
  return trimmed.toLowerCase().startsWith(prefix.toLowerCase())
    ? trimmed.slice(prefix.length).trim()
    : trimmed;
}


function legacyFusionVisionConfig(profile: Record<string, unknown>): VirtualModelFusionVisionConfig | undefined {
  const toolName = legacyFusionBuiltinToolName(profile, BUILTIN_FUSION_VISION_TOOL_NAME, "matchMultimodal");
  return toolName ? { toolName } : undefined;
}


function legacyFusionWebSearchConfig(profile: Record<string, unknown>): VirtualModelFusionWebSearchConfig | undefined {
  const toolName = legacyFusionBuiltinToolName(profile, BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME, "matchWebSearch");
  return toolName ? { provider: defaultFusionWebSearchProvider, toolName } : undefined;
}


function legacyFusionBuiltinToolName(
  profile: Record<string, unknown>,
  baseToolName: string,
  executionFlag: "matchMultimodal" | "matchWebSearch"
): string | undefined {
  const tools = Array.isArray(profile.tools) ? profile.tools : [];
  const toolName = tools
    .map((tool) => isRecord(tool) ? stringValue(tool.name) ?? "" : "")
    .find((name) => fusionBuiltinToolNameMatches(name, baseToolName));
  if (toolName) {
    return toolName;
  }
  const execution = isRecord(profile.execution) ? profile.execution : {};
  return execution[executionFlag] === true ? baseToolName : undefined;
}


function fusionBuiltinToolNameMatches(name: string, baseToolName: string): boolean {
  if (name === baseToolName || name.startsWith(`${baseToolName}_`)) {
    return true;
  }
  if (baseToolName !== BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME) {
    return false;
  }
  return coreGatewayWebSearchToolNameMatches(name);
}


export function normalizeFusionWebSearchProfileToolName(profile: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const configuredToolName = stringValue(fusionWebSearch?.toolName);
  const legacyToolName = configuredToolName ? undefined : legacyFusionWebSearchConfig(profile)?.toolName;
  const toolName = configuredToolName || legacyToolName;
  if (!toolName) {
    return undefined;
  }

  const nextToolName = coreGatewayCompatibleWebSearchToolName(toolName, stringValue(profile.key) || stringValue(profile.id));
  if (nextToolName === toolName) {
    return undefined;
  }

  const tools = Array.isArray(profile.tools)
    ? profile.tools.map((tool) => {
        if (!isRecord(tool) || stringValue(tool.name) !== toolName) {
          return tool;
        }
        return {
          ...tool,
          name: nextToolName
        };
      })
    : profile.tools;

  return {
    ...profile,
    ...(metadata && fusionWebSearch
      ? {
          metadata: {
            ...metadata,
            fusionWebSearch: {
              ...fusionWebSearch,
              toolName: nextToolName
            }
          }
        }
      : {}),
    ...(tools ? { tools } : {})
  };
}


export function withFusionWebSearchToolInstructions(profile: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = isRecord(profile.metadata) ? profile.metadata : undefined;
  const fusionWebSearch = isRecord(metadata?.fusionWebSearch) ? metadata.fusionWebSearch : undefined;
  const toolName = stringValue(fusionWebSearch?.toolName) || legacyFusionWebSearchConfig(profile)?.toolName;
  if (!toolName) {
    return undefined;
  }
  const execution = isRecord(profile.execution) ? profile.execution : {};
  if (execution.matchWebSearch !== true) {
    return undefined;
  }

  const instruction = [
    `When the client request includes a hosted web_search tool declaration, call the ${toolName} function tool before answering.`,
    "Pass the user's search query in the prompt field.",
    "Do not use provider-native web search or claim that web search is unavailable unless this function tool returns an error."
  ].join(" ");
  const instructions = isRecord(profile.instructions) ? profile.instructions : {};
  if ([instructions.prepend, instructions.append, instructions.replace].some((value) => stringValue(value)?.includes(instruction))) {
    return undefined;
  }
  const replace = stringValue(instructions.replace);
  const append = stringValue(instructions.append);
  return {
    ...profile,
    instructions: {
      ...instructions,
      ...(replace
        ? { replace: `${replace.trim()}\n\n${instruction}` }
        : { append: [append, instruction].filter(Boolean).join("\n\n") })
    }
  };
}


function coreGatewayCompatibleWebSearchToolName(toolName: string, fallbackName?: string): string {
  if (coreGatewayWebSearchToolNameMatches(toolName)) {
    return toolName;
  }

  const normalized = sanitizeFusionToolName(toolName);
  const prefix = `${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}_`;
  if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
    return truncateFusionToolName(`${normalized.slice(prefix.length)}_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`);
  }

  const fallback = sanitizeFusionToolName(fallbackName || normalized || "fusion");
  return truncateFusionToolName(`${fallback}_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`);
}


function coreGatewayWebSearchToolNameMatches(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-.]/g, "_");
  return normalized === BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME ||
    normalized.endsWith(`_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`) ||
    normalized.includes("search_web");
}


function sanitizeFusionToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "fusion";
}


function truncateFusionToolName(value: string): string {
  const maxToolNameLength = 64;
  if (value.length <= maxToolNameLength) {
    return value;
  }
  const suffix = `_${BUILTIN_FUSION_WEB_SEARCH_TOOL_NAME}`;
  const available = Math.max(1, maxToolNameLength - suffix.length);
  return `${value.slice(0, available).replace(/_+$/g, "")}${suffix}`;
}


function readFusionVisionConfig(value: unknown): VirtualModelFusionVisionConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolName = stringValue(value.toolName);
  if (!toolName) {
    return undefined;
  }
  const config: VirtualModelFusionVisionConfig = {
    toolName,
    apiKey: stringValue(value.apiKey),
    baseUrl: stringValue(value.baseUrl),
    model: stringValue(value.model),
    modelSelector: stringValue(value.modelSelector)
  };
  const timeoutMs = numberValue(value.timeoutMs);
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  return config;
}


export function readFusionWebSearchConfig(value: unknown): VirtualModelFusionWebSearchConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolName = stringValue(value.toolName);
  if (!toolName) {
    return undefined;
  }
  const config: VirtualModelFusionWebSearchConfig = {
    toolName,
    env: isRecord(value.env) ? stringRecordFromUnknown(value.env) : undefined,
    provider: parseFusionWebSearchProvider(value.provider)
  };
  const resultCount = numberValue(value.resultCount);
  if (resultCount) {
    config.resultCount = resultCount;
  }
  const timeoutMs = numberValue(value.timeoutMs);
  if (timeoutMs) {
    config.timeoutMs = timeoutMs;
  }
  return config;
}


function resolveFusionVisionRuntime(
  config: VirtualModelFusionVisionConfig
): { model?: string; providers: CoreGatewayProvider[] } {
  const selector = config.modelSelector || config.model;
  if (config.baseUrl) {
    return {
      model: config.model || config.modelSelector,
      providers: []
    };
  }

  const parsed = parseFusionModelSelector(selector);
  if (!parsed) {
    return {
      model: selector ? normalizeGatewayModelSelector(selector) : undefined,
      providers: []
    };
  }

  return {
    model: `${parsed.providerName}/${parsed.model}`,
    providers: []
  };
}


function parseFusionModelSelector(value: string | undefined): { model: string; providerName: string } | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex > 0 && commaIndex < trimmed.length - 1) {
    const providerName = trimmed.slice(0, commaIndex).trim();
    const model = trimmed.slice(commaIndex + 1).trim();
    return providerName && model ? { model, providerName } : undefined;
  }
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const providerName = trimmed.slice(0, slashIndex).trim();
    const model = trimmed.slice(slashIndex + 1).trim();
    return providerName && model ? { model, providerName } : undefined;
  }
  return undefined;
}


function normalizeGatewayModelSelector(value: string): string {
  const parsed = parseFusionModelSelector(value);
  return parsed ? `${parsed.providerName}/${parsed.model}` : value.trim();
}


function parseFusionWebSearchProvider(value: unknown): VirtualModelFusionWebSearchProvider | undefined {
  const normalized = stringValue(value)?.toLowerCase();
  if (
    normalized === "brave" ||
    normalized === "bing" ||
    normalized === "google_cse" ||
    normalized === "serper" ||
    normalized === "serpapi" ||
    normalized === "tavily" ||
    normalized === "exa" ||
    normalized === "browser"
  ) {
    return normalized;
  }
  return undefined;
}


function stringRecordFromUnknown(value: Record<string, unknown>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const normalizedValue = stringValue(rawValue);
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return Object.keys(result).length ? result : undefined;
}


function sanitizeMcpServerName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fusion";
}
