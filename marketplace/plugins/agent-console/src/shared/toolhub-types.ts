import type { AgentMcpServerConfig } from "./plugin-types";

export type ToolHubServerStatus = "offline" | "online" | "unknown";

export const toolHubBuiltinMcpServerIds = ["browser", "automations", "location", "userInteraction"] as const;

export type ToolHubBuiltinMcpServerId = typeof toolHubBuiltinMcpServerIds[number];

export type ToolHubBuiltinMcpServerSettings = Record<ToolHubBuiltinMcpServerId, boolean>;

export type ToolHubMcpServerConfig = AgentMcpServerConfig & {
  id: string;
  label?: string;
  pluginId?: string;
};

export type ToolHubUserMcpServerConfig = AgentMcpServerConfig & {
  enabled: boolean;
  id: string;
  label?: string;
};

export type ToolHubLlmSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ToolHubSettings = {
  builtinMcpServers: ToolHubBuiltinMcpServerSettings;
  enabled: boolean;
  llm: ToolHubLlmSettings;
  mcpServers: ToolHubUserMcpServerConfig[];
};

export type ToolHubToolInvocationMode = "both" | "invoke" | "workflow";

export type ToolHubToolDefinition = {
  description: string;
  inputSchema?: Record<string, unknown>;
  name: string;
  outputSchema?: Record<string, unknown>;
  tags?: string[];
  title?: string;
};

export type ToolHubToolInvocation = {
  mode: ToolHubToolInvocationMode;
  sideEffect: boolean;
};

export type ToolHubCatalogEntry = {
  alias: string;
  canonicalName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  invocation: ToolHubToolInvocation;
  outputSchema?: Record<string, unknown>;
  remoteToolName: string;
  serverId: string;
  serverLabel?: string;
  serverNamespace: string;
  status: ToolHubServerStatus;
  tags: string[];
  title: string;
  toolName: string;
};

export type ToolHubRegistryServerView = {
  error?: string;
  id: string;
  label?: string;
  lastCheckedAt?: string;
  lastSeenOnlineAt?: string;
  pluginId?: string;
  status: ToolHubServerStatus;
  toolCount: number;
  tools: ToolHubCatalogEntry[];
  type: "http" | "sse" | "stdio";
};

export type ToolHubRegistrySummary = {
  offlineServerCount: number;
  onlineServerCount: number;
  serverCount: number;
  toolCount: number;
  unknownServerCount: number;
};

export type ToolHubResolveConstraints = {
  allowSideEffects?: boolean;
  latencyBudgetMs?: number;
  maxTools?: number;
  preferWorkflow?: boolean;
};

export type ToolHubResolveInput = {
  constraints?: ToolHubResolveConstraints;
  context?: Record<string, unknown>;
  task: string;
};

export type ToolHubResolveResult = {
  alreadyResolved?: boolean;
  nextAction?: {
    confirmationRequiredFor: string[];
    firstAction: {
      missingArguments?: string[];
      toolName?: string;
      type: "ask_user" | "invoke_tool";
    };
    instruction: string;
    requiredArgumentsByTool: Array<{
      requiredArguments: string[];
      sideEffect: boolean;
      toolName: string;
    }>;
  };
  plannedSteps?: string[];
  reasoningSummary: string;
  referencedTokens?: string[];
  retriever?: "llm" | "local";
  runtimeContext?: {
    availableContextKeys: string[];
    summary: string[];
  };
  selectedTools: ToolHubCatalogEntry[];
  selectedToolNames?: string[];
  tsDefinitions?: string;
  usedLlm?: boolean;
  workflowSketch?: string;
};

export type ToolHubWorkflowOptions = {
  dryRun?: boolean;
  maxReplans?: number;
  maxToolCalls?: number;
  replanMaxTools?: number;
  replanTask?: string;
  replanTimeoutMs?: number;
  strategy?: "reactive" | "static";
  timeoutMs?: number;
};

export type ToolHubSandboxRunPayload = {
  callableTools: string[];
  code: string;
  requestId: string;
  timeoutMs: number;
};

export type ToolHubSandboxToolCallPayload = {
  args: Record<string, unknown>;
  requestId: string;
  tool: string;
  toolCallId: string;
};

export type ToolHubSandboxResultPayload = {
  error?: string;
  explicitResult?: boolean;
  ok: boolean;
  requestId: string;
  result?: unknown;
};

export type ToolHubSandboxConsolePayload = {
  level: "debug" | "error" | "info" | "log" | "warn";
  requestId: string;
  text: string;
};
