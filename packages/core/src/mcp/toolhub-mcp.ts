#!/usr/bin/env node
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonRpcRequest = {
  error?: {
    code?: number;
    message?: string;
  };
  id?: null | number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type JsonRpcResponse =
  | {
      id: null | number | string;
      jsonrpc: "2.0";
      result: JsonValue;
    }
  | {
      error: {
        code: number;
        data?: JsonValue;
        message: string;
      };
      id: null | number | string;
      jsonrpc: "2.0";
    };

type GatewayMcpServerBaseConfig = {
  label?: string;
  name: string;
  protocolVersion?: string;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  transport: "stdio" | "streamable-http" | "sse";
};

type GatewayMcpStdioServerConfig = GatewayMcpServerBaseConfig & {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  stdioMessageMode?: "content-length" | "newline-json";
  transport: "stdio";
};

type GatewayMcpRemoteServerConfig = GatewayMcpServerBaseConfig & {
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  transport: "streamable-http" | "sse";
  url: string;
};

type GatewayMcpServerConfig = GatewayMcpStdioServerConfig | GatewayMcpRemoteServerConfig;

type ToolDefinition = {
  description?: string;
  inputSchema?: Record<string, unknown>;
  name: string;
  outputSchema?: Record<string, unknown>;
  tags?: string[];
  title?: string;
};

type ToolInvocation = {
  mode: "both" | "invoke" | "workflow";
  sideEffect: boolean;
};

type CatalogEntry = {
  alias: string;
  canonicalName: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  invocation: ToolInvocation;
  outputSchema?: Record<string, unknown>;
  remoteToolName: string;
  serverId: string;
  serverLabel?: string;
  serverName: string;
  serverNamespace: string;
  status: "offline" | "online" | "unknown";
  tags: string[];
  title: string;
  toolName: string;
};

type McpClient = {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (message: JsonRpcRequest) => void;
  timer: ReturnType<typeof setTimeout>;
};

type MessageMode = "content-length" | "newline-json";

type ResolveInput = {
  constraints?: {
    allowSideEffects?: boolean;
    latencyBudgetMs?: number;
    maxTools?: number;
    preferWorkflow?: boolean;
  };
  context?: Record<string, unknown>;
  task?: string;
  __codeToolScopeKey?: string;
  __toolHubScopeKey?: string;
};

type CodeToolSessionState = {
  inFlightResolves: Map<string, Promise<ResolveOutput>>;
  loadedTools: Set<string>;
  recentObservations: Array<{
    resultSummary: string;
    toolName: string;
  }>;
  recentlyResolvedTasks: Array<{
    observationCount: number;
    resolvedAt: number;
    taskHash: string;
    toolNames: string[];
  }>;
};

type LlmToolResolution = {
  plannedSteps?: string[];
  referencedTokens?: string[];
  selectedTools: CatalogEntry[];
  summary: string;
  workflowSketch?: string;
};

type ResolveOutput = {
  alreadyResolved?: boolean;
  executionPlanInstructions?: string;
  executionPlanJs?: string;
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
  selectedToolNames: string[];
  selectedTools: CatalogEntry[];
  tsDefinitions?: string;
  usedLlm?: boolean;
  workflowSketch?: string;
};

const protocolVersion = "2024-11-05";
const toolHubServerName = "ccr-toolhub";
const resolveToolName = "tool_hub.resolve";
const invokeToolName = "tool_hub.invoke";
const defaultRequestTimeoutMs = 60_000;
const defaultMaxTools = 10;
const discoveryCacheMaxAgeMs = 10_000;
const repeatedResolveWindowMs = 5 * 60_000;
const executionPlanInstructions = [
  "Treat executionPlanJs as the dependency plan for ToolHub invocations.",
  "Each callTool(toolName, args) call maps to one tool_hub.invoke call with tool=toolName and args=args.",
  "await means the next ToolHub invocation depends on the previous result and must not be started early.",
  "Only callTool calls inside the same Promise.all([...]) expression may be issued as parallel tool calls.",
  "If a later call needs values from an earlier result, wait for that earlier result and fill the arguments after it returns."
].join(" ");
const reservedJavaScriptWords = new Set(
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield"
    .split(" ")
);

type RuntimeLike = {
  callTool(params: unknown): Promise<unknown>;
  close(): void;
};

let runtime: RuntimeLike;
let inputBuffer = Buffer.alloc(0);
let lastMessageMode: MessageMode = "content-length";

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  drainInputBuffer().catch((error) => {
    writeJsonRpc(jsonRpcError(null, -32603, formatError(error)), lastMessageMode);
  });
});

process.stdin.resume();

process.on("exit", () => {
  runtime.close();
});

async function drainInputBuffer(): Promise<void> {
  while (true) {
    discardLeadingNewlines();
    if (inputBuffer.length === 0) {
      return;
    }

    if (!startsWithContentLengthHeader(inputBuffer)) {
      const newline = inputBuffer.indexOf("\n");
      if (newline < 0) {
        return;
      }
      const message = inputBuffer.subarray(0, newline).toString("utf8").trim();
      inputBuffer = inputBuffer.subarray(newline + 1);
      if (!message) {
        continue;
      }
      await handleJsonRpcMessage(message, "newline-json");
      continue;
    }

    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }

    const headerText = inputBuffer.subarray(0, headerEnd).toString("utf8");
    const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      writeJsonRpc(jsonRpcError(null, -32600, "Missing Content-Length header."), "content-length");
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }

    const message = inputBuffer.subarray(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.subarray(messageEnd);
    await handleJsonRpcMessage(message, "content-length");
  }
}

function discardLeadingNewlines(): void {
  while (inputBuffer[0] === 10 || inputBuffer[0] === 13) {
    inputBuffer = inputBuffer.subarray(1);
  }
}

function startsWithContentLengthHeader(buffer: Buffer): boolean {
  return /^content-length\s*:/i.test(buffer.subarray(0, Math.min(buffer.length, 64)).toString("utf8"));
}

async function handleJsonRpcMessage(message: string, messageMode: MessageMode): Promise<void> {
  lastMessageMode = messageMode;
  let payload: unknown;
  try {
    payload = JSON.parse(message) as unknown;
  } catch (error) {
    writeJsonRpc(jsonRpcError(null, -32700, `Invalid JSON-RPC request: ${formatError(error)}`), messageMode);
    return;
  }

  const response = await handleJsonRpcRequest(payload);
  if (response) {
    writeJsonRpc(response, messageMode);
  }
}

async function handleJsonRpcRequest(payload: unknown): Promise<JsonRpcResponse | undefined> {
  if (!isRecord(payload)) {
    return jsonRpcError(null, -32600, "JSON-RPC request must be an object.");
  }

  const request = payload as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.id === undefined && request.method?.startsWith("notifications/")) {
    return undefined;
  }
  if (request.jsonrpc !== "2.0" || !request.method) {
    return jsonRpcError(id, -32600, "Invalid JSON-RPC 2.0 request.");
  }

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          capabilities: {
            tools: {}
          },
          protocolVersion,
          serverInfo: {
            name: toolHubServerName,
            title: "CCR ToolHub",
            version: "1.0.0"
          }
        });
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, { tools: metaTools() as unknown as JsonValue });
      case "tools/call":
        return jsonRpcResult(id, await runtime.callTool(request.params) as JsonValue);
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, formatError(error));
  }
}

class ToolHubRuntime {
  private readonly clients = new Map<string, { client: McpClient; configHash: string }>();
  private readonly registry = new ToolHubRegistry((serverName, config) => this.clientForServer(serverName, config));
  private readonly sessions = new Map<string, CodeToolSessionState>();

  async callTool(params: unknown): Promise<unknown> {
    const name = isRecord(params) && typeof params.name === "string" ? params.name.trim() : "";
    const args = isRecord(params) && isRecord(params.arguments) ? params.arguments : {};
    if (name === resolveToolName || name === "tool_hub_resolve" || name === "code_tool.resolve" || name === "code_tool_resolve") {
      return this.resolveTools(args as ResolveInput);
    }
    if (name === invokeToolName || name === "tool_hub_invoke" || name === "code_tool.invoke" || name === "code_tool_invoke") {
      return this.invokeTool(args);
    }
    throw new Error(`Unknown ToolHub meta tool: ${name}`);
  }

  close(): void {
    for (const entry of this.clients.values()) {
      void entry.client.close();
    }
    this.clients.clear();
    this.sessions.clear();
  }

  private async resolveTools(input: ResolveInput): Promise<unknown> {
    const task = typeof input.task === "string" ? input.task.trim() : "";
    if (!task) {
      throw new Error(`${resolveToolName} requires task.`);
    }
    const maxTools = normalizeMaxTools(input.constraints?.maxTools ?? envNumber("TOOLHUB_MAX_TOOLS", defaultMaxTools));
    const scopeKey = this.scopeKey(input);
    const session = this.session(scopeKey);
    const taskHash = normalizeResolveTaskKey(task);

    this.registry.updateServers(readBackendServers());
    let catalog = await this.registry.listTools();
    if (catalog.length === 0) {
      await this.registry.refreshServers(undefined, true);
      catalog = await this.registry.listTools();
    }
    if (taskWantsChromeLoginImport(task) && !catalogHasChromeLoginImportTool(catalog)) {
      await this.registry.refreshServers(["ccr-browser-automation"], true);
      catalog = await this.registry.listTools();
    }
    if (catalog.length === 0) {
      throw new Error("No MCP tools are available to resolve.");
    }

    const cached = this.findRecentlyResolvedTask(scopeKey, taskHash);
    if (cached) {
      const selectedTools = expandToolBundleWithCompanionTools(
        uniqueToolEntries([
          ...cached.toolNames
            .map((toolName) => this.resolveCatalogEntry(toolName, catalog))
            .filter((entry): entry is CatalogEntry => Boolean(entry)),
          ...getDeterministicTaskTools(task, catalog)
        ]),
        catalog
      );
      if (selectedTools.length > 0) {
        this.markToolsLoaded(scopeKey, selectedTools);
        return toolResult(this.buildRepeatedResolveOutput(selectedTools));
      }
    }

    const inFlightResolve = session.inFlightResolves.get(taskHash);
    if (inFlightResolve) {
      const output = await inFlightResolve;
      const selectedTools = expandToolBundleWithCompanionTools(
        uniqueToolEntries([
          ...output.selectedTools
            .map((tool) => this.resolveCatalogEntry(tool.toolName, catalog) ?? tool)
            .filter((entry): entry is CatalogEntry => Boolean(entry)),
          ...getDeterministicTaskTools(task, catalog)
        ]),
        catalog
      );
      if (selectedTools.length > 0) {
        this.markToolsLoaded(scopeKey, selectedTools);
        return toolResult(this.buildRepeatedResolveOutput(selectedTools));
      }
      return toolResult(output);
    }

    const resolvePromise = this.executeFreshResolve({
      catalog,
      context: input.context,
      maxTools,
      observations: session.recentObservations.slice(-5),
      scopeKey,
      task,
      taskHash,
      timeoutMs: input.constraints?.latencyBudgetMs,
      withoutSideEffects: input.constraints?.allowSideEffects === false
    });
    session.inFlightResolves.set(taskHash, resolvePromise);
    try {
      return toolResult(await resolvePromise);
    } finally {
      if (session.inFlightResolves.get(taskHash) === resolvePromise) {
        session.inFlightResolves.delete(taskHash);
      }
    }
  }

  private async invokeTool(args: Record<string, unknown>): Promise<unknown> {
    const requestedTool = typeof args.tool === "string" ? args.tool.trim() : "";
    if (!requestedTool) {
      throw new Error(`${invokeToolName} requires tool.`);
    }
    const scopeKey = this.scopeKey(args);
    this.registry.updateServers(readBackendServers());
    const catalog = await this.registry.listTools();
    const entry = this.resolveCatalogEntry(requestedTool, catalog);
    if (!entry) {
      return toolError("UNKNOWN_TOOL", `Unknown ToolHub tool: ${requestedTool}`);
    }
    if (!this.session(scopeKey).loadedTools.has(entry.toolName)) {
      return toolError("TOOL_NOT_RESOLVED", `Tool ${entry.toolName} is not loaded in this session. Call ${resolveToolName} for the task first.`);
    }
    const toolArgs = isRecord(args.args) ? args.args : {};
    const client = this.clientForServer(entry.serverName);
    const result = await client.callTool(entry.remoteToolName, toolArgs);
    this.rememberObservation(scopeKey, entry.toolName, result);
    return result;
  }

  private async executeFreshResolve(input: {
    catalog: CatalogEntry[];
    context?: Record<string, unknown>;
    maxTools: number;
    observations: CodeToolSessionState["recentObservations"];
    scopeKey: string;
    task: string;
    taskHash: string;
    timeoutMs?: number;
    withoutSideEffects: boolean;
  }): Promise<ResolveOutput> {
    let resolution: LlmToolResolution;
    let retriever: NonNullable<ResolveOutput["retriever"]> = "llm";
    let usedLlm = true;
    try {
      resolution = await this.resolveCatalogWithLlm(input);
    } catch (error) {
      resolution = this.resolveCatalogLocally({ ...input, error });
      if (resolution.selectedTools.length === 0) {
        throw error;
      }
      retriever = "local";
      usedLlm = false;
    }

    let selectedTools = expandToolBundleWithCompanionTools(
      uniqueToolEntries([
        ...resolution.selectedTools,
        ...getDeterministicTaskTools(input.task, input.catalog)
      ]),
      input.catalog
    );
    if (input.withoutSideEffects) {
      selectedTools = selectedTools.filter((tool) => !tool.invocation.sideEffect);
    }
    if (selectedTools.length === 0) {
      throw new Error("ToolHub could not resolve any matching MCP tools for this task.");
    }

    this.markToolsLoaded(input.scopeKey, selectedTools);
    this.rememberResolvedTask(input.scopeKey, input.taskHash, selectedTools);
    const executionPlanJs = buildExecutionPlanJs(resolution.workflowSketch, selectedTools);
    return {
      ...this.buildResolveOutput(resolution.summary, selectedTools, executionPlanJs),
      plannedSteps: resolution.plannedSteps,
      referencedTokens: resolution.referencedTokens,
      retriever,
      usedLlm,
      workflowSketch: executionPlanJs
    };
  }

  private async resolveCatalogWithLlm(input: {
    catalog: CatalogEntry[];
    context?: Record<string, unknown>;
    maxTools: number;
    observations: CodeToolSessionState["recentObservations"];
    task: string;
    timeoutMs?: number;
  }): Promise<LlmToolResolution> {
    const searchAgent = new OpenAiToolHubSearchAgent({
      openAiApiKey: env("TOOLHUB_OPENAI_API_KEY"),
      openAiBaseUrl: env("TOOLHUB_OPENAI_BASE_URL") || "https://api.openai.com/v1",
      openAiModel: env("TOOLHUB_OPENAI_MODEL")
    });
    const result = await searchAgent.search({
      catalog: input.catalog.map(toSearchCatalogItem),
      code: JSON.stringify({
        context: input.context ?? {},
        observations: input.observations ?? []
      }),
      query: input.task,
      timeoutMs: input.timeoutMs ?? envNumber("TOOLHUB_REQUEST_TIMEOUT_MS", defaultRequestTimeoutMs),
      topK: input.maxTools
    });
    const selectedTools = result.selectedToolNames
      .map((toolName) => this.resolveCatalogEntry(toolName, input.catalog))
      .filter((entry): entry is CatalogEntry => Boolean(entry))
      .slice(0, input.maxTools);
    return {
      plannedSteps: result.plannedSteps,
      referencedTokens: result.referencedTokens,
      selectedTools,
      summary: result.summary,
      workflowSketch: result.workflowSketch
    };
  }

  private resolveCatalogLocally(input: {
    catalog: CatalogEntry[];
    context?: Record<string, unknown>;
    error: unknown;
    maxTools: number;
    observations: CodeToolSessionState["recentObservations"];
    task: string;
  }): LlmToolResolution {
    const taskText = [
      input.task,
      input.context ? JSON.stringify(input.context) : "",
      ...input.observations.map((observation) => `${observation.toolName} ${observation.resultSummary}`)
    ].join(" ");
    const preferredToolNames = getLocalFallbackPreferredTools(taskText);
    const scored = input.catalog
      .map((tool, index) => ({
        index,
        score: scoreLocalCatalogMatch(taskText, tool, preferredToolNames),
        tool
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const selectedTools = uniqueToolEntries(scored.map((item) => item.tool)).slice(0, input.maxTools);
    return {
      plannedSteps: selectedTools.length > 0
        ? [
            "Resolve retrieval LLM did not finish within the latency budget.",
            "Selected candidate tools with local catalog matching."
          ]
        : undefined,
      referencedTokens: tokenizeLocalSearchText(taskText),
      selectedTools,
      summary: `Resolve retrieval fell back to local catalog matching after LLM retrieval failed: ${formatError(input.error)}.`,
      workflowSketch: buildLocalFallbackWorkflowSketch(selectedTools)
    };
  }

  private clientForServer(serverName: string, config?: GatewayMcpServerConfig): McpClient {
    const server = config ?? readBackendServers().find((candidate) => candidate.name === serverName);
    if (!server) {
      throw new Error(`ToolHub backend MCP server not found: ${serverName}`);
    }
    const existing = this.clients.get(serverName);
    const configHash = hashToolHubMcpServerConfig(server);
    if (existing && existing.configHash === configHash) {
      return existing.client;
    }
    void existing?.client.close();
    const client = server.transport === "stdio"
      ? new StdioMcpClient(server)
      : server.transport === "sse"
        ? new SseMcpClient(server)
        : new HttpMcpClient(server);
    this.clients.set(serverName, { client, configHash });
    return client;
  }

  private resolveCatalogEntry(nameOrAlias: string, catalog: CatalogEntry[]): CatalogEntry | undefined {
    const resolvedName = resolveCatalogItemName(catalog.map((entry) => ({
      alias: entry.alias,
      canonicalName: entry.canonicalName,
      name: entry.toolName,
      remoteToolName: entry.remoteToolName
    })), nameOrAlias);
    if (!resolvedName) {
      return undefined;
    }
    return catalog.find((entry) => entry.toolName === resolvedName);
  }

  private buildResolveOutput(summary: string, selectedTools: CatalogEntry[], executionPlanJs = buildSequentialExecutionPlanJs(selectedTools)): ResolveOutput {
    return {
      executionPlanInstructions,
      executionPlanJs,
      nextAction: this.buildResolveNextAction(selectedTools),
      reasoningSummary: summary,
      runtimeContext: {
        availableContextKeys: ["selectedTools", "executionPlanJs", "executionPlanInstructions"],
        summary: [
          ...selectedTools.map((tool) => `${tool.toolName}: ${tool.description || tool.title}`),
          "Follow executionPlanJs for dependency ordering before invoking selected tools."
        ]
      },
      selectedToolNames: selectedTools.map((tool) => tool.toolName),
      selectedTools,
      tsDefinitions: buildTsDefinitions(selectedTools),
      workflowSketch: executionPlanJs
    };
  }

  private buildRepeatedResolveOutput(selectedTools: CatalogEntry[]): ResolveOutput {
    const nextAction = this.buildResolveNextAction(selectedTools);
    const executionPlanJs = buildSequentialExecutionPlanJs(selectedTools);
    return {
      alreadyResolved: true,
      executionPlanInstructions,
      executionPlanJs,
      nextAction,
      reasoningSummary: [
        "This task has already been resolved in the current ToolHub session.",
        nextAction.instruction
      ].join(" "),
      runtimeContext: {
        availableContextKeys: ["selectedTools", "nextAction", "executionPlanJs", "executionPlanInstructions"],
        summary: [
          "The selected tools are already loaded for tool_hub.invoke.",
          "Do not repeat discovery for this task.",
          nextAction.instruction,
          "Follow executionPlanJs for dependency ordering before invoking selected tools."
        ]
      },
      selectedToolNames: selectedTools.map((tool) => tool.toolName),
      selectedTools,
      workflowSketch: executionPlanJs
    };
  }

  private buildResolveNextAction(selectedTools: CatalogEntry[]): NonNullable<ResolveOutput["nextAction"]> {
    const requiredArgumentsByTool = selectedTools
      .map((tool) => ({
        requiredArguments: getSchemaRequiredProperties(tool.inputSchema),
        sideEffect: tool.invocation.sideEffect,
        toolName: tool.toolName
      }))
      .filter((item) => item.requiredArguments.length > 0);
    const confirmationRequiredFor = selectedTools
      .filter((tool) => tool.invocation.sideEffect)
      .map((tool) => tool.toolName);
    const firstTool = selectFirstActionTool(selectedTools);
    const firstRequiredArguments = firstTool ? getSchemaRequiredProperties(firstTool.inputSchema) : [];
    const firstAction = firstRequiredArguments.length > 0
      ? {
          missingArguments: firstRequiredArguments,
          toolName: firstTool?.toolName,
          type: "ask_user" as const
        }
      : {
          toolName: firstTool?.toolName,
          type: "invoke_tool" as const
        };
    const instructionParts = [
      "Do not call tool_hub.resolve again for this task.",
      "Follow executionPlanJs: await is serial dependency; only Promise.all groups may run in parallel."
    ];
    if (firstTool && firstRequiredArguments.length > 0) {
      instructionParts.push(`Ask the user for missing required arguments for ${firstTool.toolName}: ${firstRequiredArguments.join(", ")}.`);
    } else if (firstTool) {
      instructionParts.push(`Call tool_hub.invoke for ${firstTool.toolName}.`);
    } else {
      instructionParts.push("Ask the user for the missing task details before invoking tools.");
    }
    if (confirmationRequiredFor.length > 0) {
      instructionParts.push(`Before calling side-effecting tools, ask for explicit confirmation: ${confirmationRequiredFor.join(", ")}.`);
    }
    return {
      confirmationRequiredFor,
      firstAction,
      instruction: instructionParts.join(" "),
      requiredArgumentsByTool
    };
  }

  private scopeKey(input: Record<string, unknown>): string {
    return readNonEmptyString(input.__toolHubScopeKey) || readNonEmptyString(input.__codeToolScopeKey) || "default";
  }

  private session(scopeKey: string): CodeToolSessionState {
    const existing = this.sessions.get(scopeKey);
    if (existing) {
      return existing;
    }
    const session: CodeToolSessionState = {
      inFlightResolves: new Map(),
      loadedTools: new Set(),
      recentObservations: [],
      recentlyResolvedTasks: []
    };
    this.sessions.set(scopeKey, session);
    return session;
  }

  private markToolsLoaded(scopeKey: string, entries: CatalogEntry[]): void {
    const session = this.session(scopeKey);
    for (const entry of entries) {
      session.loadedTools.add(entry.toolName);
    }
  }

  private rememberResolvedTask(scopeKey: string, taskHash: string, entries: CatalogEntry[]): void {
    const session = this.session(scopeKey);
    session.recentlyResolvedTasks = session.recentlyResolvedTasks.filter((item) => item.taskHash !== taskHash);
    session.recentlyResolvedTasks.unshift({
      observationCount: session.recentObservations.length,
      resolvedAt: Date.now(),
      taskHash,
      toolNames: entries.map((entry) => entry.toolName)
    });
    session.recentlyResolvedTasks = session.recentlyResolvedTasks.slice(0, 10);
  }

  private findRecentlyResolvedTask(scopeKey: string, taskHash: string): CodeToolSessionState["recentlyResolvedTasks"][number] | undefined {
    const session = this.session(scopeKey);
    const now = Date.now();
    session.recentlyResolvedTasks = session.recentlyResolvedTasks.filter((item) => now - item.resolvedAt <= repeatedResolveWindowMs);
    return session.recentlyResolvedTasks.find((item) => item.taskHash === taskHash);
  }

  private rememberObservation(scopeKey: string, toolName: string, result: unknown): void {
    const session = this.session(scopeKey);
    session.recentObservations.push({
      resultSummary: summarizeValue(result),
      toolName
    });
    session.recentObservations = session.recentObservations.slice(-20);
  }
}

class ToolHubRegistry {
  private discoveryPromise: Promise<void> | undefined;
  private readonly entries = new Map<string, {
    config: GatewayMcpServerConfig;
    configHash: string;
    error?: string;
    lastCheckedAt?: number;
    lastSeenOnlineAt?: number;
    loadedFromCache?: boolean;
    status: "offline" | "online" | "unknown";
    tools: ToolDefinition[];
  }>();

  constructor(private readonly clientFactory: (serverName: string, config?: GatewayMcpServerConfig) => McpClient) {}

  updateServers(servers: GatewayMcpServerConfig[]): void {
    const nextServerNames = new Set<string>();
    for (const server of servers) {
      nextServerNames.add(server.name);
      const configHash = hashToolHubMcpServerConfig(server);
      const existing = this.entries.get(server.name);
      if (existing && existing.configHash === configHash) {
        existing.config = cloneServerConfig(server);
        continue;
      }
      const cachedDiscovery = toolHubPersistentCache.readDiscovery(server.name, configHash);
      this.entries.set(server.name, {
        config: cloneServerConfig(server),
        configHash,
        lastCheckedAt: cachedDiscovery?.cachedAt,
        lastSeenOnlineAt: cachedDiscovery?.lastSeenOnlineAt,
        loadedFromCache: Boolean(cachedDiscovery),
        status: "unknown",
        tools: cachedDiscovery?.tools.map((tool) => ({ ...tool })) ?? []
      });
    }

    for (const serverName of this.entries.keys()) {
      if (!nextServerNames.has(serverName)) {
        this.entries.delete(serverName);
      }
    }
  }

  async listTools(): Promise<CatalogEntry[]> {
    await this.ensureDiscoveryFresh();
    return this.listCatalogEntriesSync();
  }

  async refreshServers(serverNames?: string[], force = true): Promise<void> {
    const targetServerNames = normalizeTargetServerNames(serverNames, this.entries);
    if (targetServerNames.length === 0) {
      return;
    }
    if (this.discoveryPromise) {
      await this.discoveryPromise;
      if (!force) {
        return;
      }
    }
    this.discoveryPromise = this.performDiscovery(targetServerNames, force);
    try {
      await this.discoveryPromise;
    } finally {
      this.discoveryPromise = undefined;
    }
  }

  private async ensureDiscoveryFresh(maxAgeMs = discoveryCacheMaxAgeMs): Promise<void> {
    const staleServerNames = [...this.entries.values()]
      .filter((entry) => !entry.lastCheckedAt || Date.now() - entry.lastCheckedAt > maxAgeMs)
      .map((entry) => entry.config.name);
    if (staleServerNames.length === 0) {
      return;
    }
    await this.refreshServers(staleServerNames, false);
  }

  private listCatalogEntriesSync(): CatalogEntry[] {
    const namespaces = serverNamespaces([...this.entries.values()].map((entry) => entry.config.name));
    const entries: CatalogEntry[] = [];
    for (const entry of this.entries.values()) {
      const serverNamespace = namespaces.get(entry.config.name) ?? toIdentifier(entry.config.name);
      for (const tool of entry.tools) {
        const remoteToolName = tool.name.trim();
        if (!remoteToolName) {
          continue;
        }
        const toolName = `mcp.${serverNamespace}.${remoteToolName}`;
        entries.push({
          alias: toIdentifier(toolName),
          canonicalName: `${entry.config.name}.${remoteToolName}`,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema,
          invocation: inferInvocation(tool),
          outputSchema: tool.outputSchema,
          remoteToolName,
          serverId: entry.config.name,
          serverLabel: entry.config.label,
          serverName: entry.config.name,
          serverNamespace,
          status: entry.status,
          tags: tool.tags ?? [],
          title: tool.title || tool.name,
          toolName
        });
      }
    }
    return entries.sort((left, right) => left.toolName.localeCompare(right.toolName));
  }

  private async performDiscovery(serverNames: string[], force: boolean): Promise<void> {
    for (const serverName of serverNames) {
      const entry = this.entries.get(serverName);
      if (!entry) {
        continue;
      }
      if (!force && entry.lastCheckedAt && Date.now() - entry.lastCheckedAt < 3_000) {
        continue;
      }
      await this.probeServer(entry.config);
    }
  }

  private async probeServer(config: GatewayMcpServerConfig): Promise<void> {
    const now = Date.now();
    try {
      const tools = await this.clientFactory(config.name, config).listTools();
      const entry = this.entries.get(config.name);
      if (!entry) {
        return;
      }
      entry.status = "online";
      entry.tools = tools.map((tool) => ({ ...tool }));
      entry.lastCheckedAt = now;
      entry.lastSeenOnlineAt = now;
      entry.loadedFromCache = true;
      entry.error = undefined;
      toolHubPersistentCache.writeDiscovery(config.name, entry.configHash, entry.tools, now);
    } catch (error) {
      const entry = this.entries.get(config.name);
      if (!entry) {
        return;
      }
      entry.status = "offline";
      entry.lastCheckedAt = now;
      entry.loadedFromCache = false;
      entry.error = formatError(error);
    }
  }
}

runtime = new ToolHubRuntime();

class SseMcpClient implements McpClient {
  private endpointUrl = "";
  private initialized = false;
  private nextId = 1;
  private openPromise: Promise<void> | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private streamAbort: AbortController | undefined;
  private streamBuffer = "";

  constructor(private readonly server: GatewayMcpRemoteServerConfig) {}

  async listTools(): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    const result = await this.request("tools/list", {});
    return normalizeToolList(result);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    return this.request("tools/call", {
      name,
      arguments: args
    });
  }

  async close(): Promise<void> {
    this.initialized = false;
    this.endpointUrl = "";
    this.streamAbort?.abort();
    this.streamAbort = undefined;
    this.rejectAll(new Error(`MCP SSE client closed: ${this.server.name}`));
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.ensureStream();
    await this.request("initialize", {
      capabilities: {},
      clientInfo: { name: toolHubServerName, version: "1.0.0" },
      protocolVersion: this.server.protocolVersion || protocolVersion
    }, this.server.startupTimeoutMs);
    await this.notification("notifications/initialized", {}).catch(() => undefined);
    this.initialized = true;
  }

  private async ensureStream(): Promise<void> {
    if (this.endpointUrl) {
      return;
    }
    if (!this.openPromise) {
      this.openPromise = this.openStream().finally(() => {
        this.openPromise = undefined;
      });
    }
    await this.openPromise;
  }

  private async openStream(): Promise<void> {
    const controller = new AbortController();
    this.streamAbort = controller;
    const response = await fetch(this.server.url, {
      headers: this.headers(false),
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`MCP SSE stream failed (${this.server.name}): ${response.status}`);
    }

    let resolveEndpoint: () => void = () => {};
    let rejectEndpoint: (error: Error) => void = () => {};
    const endpointReady = new Promise<void>((resolve, reject) => {
      resolveEndpoint = resolve;
      rejectEndpoint = reject;
    });
    const timeout = setTimeout(() => {
      rejectEndpoint(new Error(`MCP SSE endpoint timed out (${this.server.name}).`));
      controller.abort();
    }, this.server.startupTimeoutMs ?? defaultRequestTimeoutMs);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.streamBuffer += decoder.decode(value, { stream: true });
          this.streamBuffer = consumeSseEvents(this.streamBuffer, (event) => {
            if (event.event === "endpoint") {
              this.endpointUrl = new URL(event.data.trim(), this.server.url).toString();
              clearTimeout(timeout);
              resolveEndpoint();
              return;
            }
            this.routeSseMessage(event.data);
          });
        }
        this.rejectAll(new Error(`MCP SSE stream closed (${this.server.name}).`));
      } catch (error) {
        clearTimeout(timeout);
        rejectEndpoint(toError(error));
        this.rejectAll(toError(error));
      }
    })();

    await endpointReady;
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = this.server.requestTimeoutMs): Promise<unknown> {
    return this.ensureStream().then(() => {
      const id = this.nextId++;
      const message = {
        id,
        jsonrpc: "2.0",
        method,
        params
      };
      const pending = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(String(id));
          reject(new Error(`MCP SSE request timed out (${this.server.name}): ${method}`));
        }, timeoutMs ?? defaultRequestTimeoutMs);
        this.pending.set(String(id), {
          reject,
          resolve: (response) => {
            if (isRecord(response.error)) {
              reject(new Error(String(response.error.message ?? "MCP request failed.")));
              return;
            }
            resolve(response.result);
          },
          timer
        });
      });
      return this.post(message).then(() => pending);
    });
  }

  private async notification(method: string, params: Record<string, unknown>): Promise<void> {
    await this.ensureStream();
    await this.post({ jsonrpc: "2.0", method, params });
  }

  private async post(message: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.endpointUrl, {
      body: JSON.stringify(message),
      headers: this.headers(true),
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`MCP SSE post failed (${this.server.name}): ${response.status}`);
    }
  }

  private headers(json: boolean): Headers {
    const headers = new Headers({
      ...(json ? { "content-type": "application/json" } : {}),
      ...(this.server.headers ?? {})
    });
    const apiKey = this.server.apiKey || (this.server.apiKeyEnv ? process.env[this.server.apiKeyEnv] : "");
    if (apiKey && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${apiKey}`);
    }
    return headers;
  }

  private routeSseMessage(text: string): void {
    let message: JsonRpcRequest;
    try {
      message = JSON.parse(text) as JsonRpcRequest;
    } catch {
      return;
    }
    const key = message.id === undefined || message.id === null ? "" : String(message.id);
    const pending = key ? this.pending.get(key) : undefined;
    if (!pending) {
      return;
    }
    this.pending.delete(key);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  private rejectAll(error: Error): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
}

class HttpMcpClient implements McpClient {
  private initialized = false;
  private sessionId = "";

  constructor(private readonly server: GatewayMcpRemoteServerConfig) {}

  async listTools(): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    const result = await this.request("tools/list", {});
    return normalizeToolList(result);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    return this.request("tools/call", {
      name,
      arguments: args
    });
  }

  async close(): Promise<void> {
    this.initialized = false;
    this.sessionId = "";
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.request("initialize", {
      capabilities: {},
      clientInfo: { name: toolHubServerName, version: "1.0.0" },
      protocolVersion: this.server.protocolVersion || protocolVersion
    }, this.server.startupTimeoutMs);
    await this.notification("notifications/initialized", {}).catch(() => undefined);
    this.initialized = true;
  }

  private async notification(method: string, params: Record<string, unknown>): Promise<void> {
    await this.frame({ jsonrpc: "2.0", method, params }, this.server.requestTimeoutMs, true);
  }

  private async request(method: string, params: Record<string, unknown>, timeoutMs = this.server.requestTimeoutMs): Promise<unknown> {
    const response = await this.frame({
      id: randomUUID(),
      jsonrpc: "2.0",
      method,
      params
    }, timeoutMs, false);
    if (!isRecord(response)) {
      throw new Error(`Invalid MCP response from ${this.server.name}.`);
    }
    if (isRecord(response.error)) {
      throw new Error(`MCP request failed (${this.server.name}): ${String(response.error.message ?? "Unknown error")}`);
    }
    return response.result;
  }

  private async frame(request: Record<string, unknown>, timeoutMs = defaultRequestTimeoutMs, notification: boolean): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers({
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(this.server.headers ?? {})
      });
      const apiKey = this.server.apiKey || (this.server.apiKeyEnv ? process.env[this.server.apiKeyEnv] : "");
      if (apiKey && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${apiKey}`);
      }
      if (this.sessionId) {
        headers.set("mcp-session-id", this.sessionId);
      }
      const response = await fetch(this.server.url, {
        body: JSON.stringify(request),
        headers,
        method: "POST",
        signal: controller.signal
      });
      this.sessionId = response.headers.get("mcp-session-id") || response.headers.get("x-mcp-session-id") || this.sessionId;
      if (notification && response.status === 204) {
        return undefined;
      }
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`MCP HTTP request failed (${this.server.name}): ${response.status} ${text.slice(0, 300)}`);
      }
      if (!text.trim()) {
        return undefined;
      }
      return parseHttpJsonRpcResponse(text);
    } finally {
      clearTimeout(timer);
    }
  }
}

class StdioMcpClient implements McpClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private initialized = false;
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private stdoutBuffer = Buffer.alloc(0);

  constructor(private readonly server: GatewayMcpStdioServerConfig) {}

  async listTools(): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    const result = await this.request("tools/list", {}, this.server.requestTimeoutMs);
    return normalizeToolList(result);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureInitialized();
    return this.request("tools/call", {
      name,
      arguments: args
    }, this.server.requestTimeoutMs);
  }

  async close(): Promise<void> {
    this.initialized = false;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(`MCP stdio client closed: ${this.server.name}`));
    }
    this.pending.clear();
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = undefined;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.ensureChild();
    await this.request("initialize", {
      capabilities: {},
      clientInfo: { name: toolHubServerName, version: "1.0.0" },
      protocolVersion: this.server.protocolVersion || protocolVersion
    }, this.server.startupTimeoutMs);
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) {
      return this.child;
    }
    const child = spawn(this.server.command, this.server.args ?? [], {
      cwd: this.server.cwd || undefined,
      env: {
        ...process.env,
        ...(this.server.env ?? {})
      },
      stdio: ["pipe", "pipe", "pipe"]
    }) as ChildProcessWithoutNullStreams;
    child.stdout.on("data", (chunk: Buffer) => this.readStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        console.error(`[ToolHub backend ${this.server.name}] ${text}`);
      }
    });
    child.on("error", (error) => this.rejectAll(error));
    child.on("exit", (code, signal) => {
      this.initialized = false;
      this.child = undefined;
      this.rejectAll(new Error(`MCP server exited (${this.server.name}): ${signal ?? code ?? "unknown"}`));
    });
    this.child = child;
    return child;
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = defaultRequestTimeoutMs): Promise<unknown> {
    const id = this.nextId++;
    const message = {
      id,
      jsonrpc: "2.0",
      method,
      params
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`MCP stdio request timed out (${this.server.name}): ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), {
        reject,
        resolve: (response) => {
          if (isRecord(response.error)) {
            reject(new Error(String(response.error.message ?? "MCP request failed.")));
            return;
          }
          resolve(response.result);
        },
        timer
      });
      this.write(message);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: Record<string, unknown>): void {
    const child = this.ensureChild();
    const text = JSON.stringify(message);
    if (this.server.stdioMessageMode === "newline-json") {
      child.stdin.write(`${text}\n`);
      return;
    }
    child.stdin.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
  }

  private readStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    if (this.server.stdioMessageMode === "newline-json") {
      this.drainNewlineJsonStdout();
    } else {
      this.drainContentLengthStdout();
    }
  }

  private drainContentLengthStdout(): void {
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const headerText = this.stdoutBuffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.stdoutBuffer = this.stdoutBuffer.subarray(headerEnd + 4);
        continue;
      }
      const contentLength = Number(lengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.stdoutBuffer.length < messageEnd) return;
      const text = this.stdoutBuffer.subarray(messageStart, messageEnd).toString("utf8");
      this.stdoutBuffer = this.stdoutBuffer.subarray(messageEnd);
      this.routeMessage(text);
    }
  }

  private drainNewlineJsonStdout(): void {
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const text = this.stdoutBuffer.subarray(0, newline).toString("utf8").trim();
      this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
      if (text) {
        this.routeMessage(text);
      }
    }
  }

  private routeMessage(text: string): void {
    let message: JsonRpcRequest;
    try {
      message = JSON.parse(text) as JsonRpcRequest;
    } catch {
      return;
    }
    const key = message.id === undefined || message.id === null ? "" : String(message.id);
    const pending = key ? this.pending.get(key) : undefined;
    if (!pending) {
      return;
    }
    this.pending.delete(key);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  private rejectAll(error: Error): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
}

const treeSitterToolName = "tree_sitter_collect_tool_references";
const minSearchTimeoutMs = 8_000;
const maxTurnTimeoutMs = 60_000;
const minTurnRemainingMs = 3_500;
const minFinalAnswerTurnTimeoutMs = 8_000;
const timeoutHeadroomMs = 1_500;

type SearchCatalogItem = {
  alias: string;
  canonicalName?: string;
  description: string;
  invocationMode: string;
  name: string;
  remoteToolName?: string;
  required?: string[];
  serverId?: string;
  serverLabel?: string;
  sideEffect: boolean;
  title: string;
};

type SearchMessage = {
  content?: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: Array<{
    function: {
      arguments: string;
      name: string;
    };
    id: string;
    type: "function";
  }>;
};

type SearchResult = {
  plannedSteps?: string[];
  referencedTokens: string[];
  selectedToolNames: string[];
  summary: string;
  workflowSketch?: string;
};

type ToolReference = {
  column: number;
  line: number;
  rawName: string;
  source: string;
};

class OpenAiToolHubSearchAgent {
  private readonly analyzer = new ToolReferenceAnalyzer();

  constructor(private readonly config: {
    openAiApiKey?: string;
    openAiBaseUrl?: string;
    openAiModel?: string;
  }) {}

  async search(input: {
    catalog: SearchCatalogItem[];
    code?: string;
    query: string;
    timeoutMs?: number;
    topK?: number;
  }): Promise<SearchResult> {
    const query = input.query.trim();
    if (!query) {
      throw new Error("ToolHub resolve query must be non-empty.");
    }
    const apiKey = this.config.openAiApiKey || env("TOOLHUB_OPENAI_API_KEY");
    const baseURL = this.config.openAiBaseUrl || env("TOOLHUB_OPENAI_BASE_URL") || "https://api.openai.com/v1";
    const model = this.config.openAiModel || env("TOOLHUB_OPENAI_MODEL");
    if (!apiKey || !model) {
      throw new Error("ToolHub resolver requires TOOLHUB_OPENAI_API_KEY and TOOLHUB_OPENAI_MODEL.");
    }

    const topK = normalizeTopK(input.topK);
    const timeoutMs = normalizeSearchTimeout(input.timeoutMs);
    const deadlineAt = Date.now() + timeoutMs;
    await waitForLocalResolverEndpoint(baseURL, apiKey, timeoutMs);
    const client = new OpenAI({ apiKey, baseURL });
    const messages: SearchMessage[] = [
      {
        role: "user",
        content: JSON.stringify({
          context: input.code ?? "",
          query
        }, null, 2)
      }
    ];

    let didCallAnalyzer = false;
    let analyzerCallCount = 0;
    let summary = "";
    let workflowSketch = "";
    let plannedSteps: string[] = [];
    let llmSelectedNames: string[] = [];
    let referencedTokens: string[] = [];
    let latestResolvedFromAnalyzer: string[] = [];

    while (true) {
      const remainingMs = deadlineAt - Date.now();
      const minTurnTimeoutMs = didCallAnalyzer ? minFinalAnswerTurnTimeoutMs : minTurnRemainingMs;
      if (remainingMs <= minTurnTimeoutMs + timeoutHeadroomMs) {
        break;
      }
      const turnTimeoutMs = Math.min(remainingMs - timeoutHeadroomMs, maxTurnTimeoutMs);
      const responseMessage = await this.callOpenAiWithTools(
        client,
        model,
        buildSearchSystemPrompt(input.catalog, topK),
        messages,
        turnTimeoutMs
      );

      const toolCalls = responseMessage.tool_calls ?? [];
      if (toolCalls.length > 0) {
        messages.push(responseMessage);
        const roundResolvedToolNames: string[] = [];
        for (const toolCall of toolCalls) {
          if (toolCall.function.name !== treeSitterToolName) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` })
            });
            continue;
          }
          didCallAnalyzer = true;
          analyzerCallCount += 1;
          const toolInput = parseToolArguments(toolCall.function.arguments);
          const analyzeCode = typeof toolInput.code === "string" ? toolInput.code : "";
          const references = this.analyzer.collectReferences(analyzeCode);
          const tokens = uniqueStrings(references.map((item) => item.rawName));
          const resolvedToolNames = uniqueStrings(
            tokens
              .map((token) => resolveCatalogItemName(input.catalog, token))
              .filter((name): name is string => typeof name === "string")
          );
          referencedTokens = uniqueStrings([...referencedTokens, ...tokens]);
          roundResolvedToolNames.push(...resolvedToolNames);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              references,
              resolvedToolNames,
              tokens
            })
          });
        }
        latestResolvedFromAnalyzer = uniqueStrings(roundResolvedToolNames);
        continue;
      }

      const contentText = typeof responseMessage.content === "string" ? responseMessage.content.trim() : "";
      const parsed = firstJsonObject(contentText);
      if (!parsed) {
        messages.push(responseMessage);
        messages.push({
          role: "user",
          content: didCallAnalyzer
            ? "Return only a valid JSON object with keys \"summary\", \"steps\", \"workflowSketch\", and \"toolNames\"."
            : `You must call ${treeSitterToolName} on a TypeScript workflow sketch before your final answer.`
        });
        continue;
      }

      summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      workflowSketch = typeof parsed.workflowSketch === "string" ? parsed.workflowSketch : "";
      plannedSteps = toStringArray(parsed.steps);
      const workflowReferences = this.analyzer.collectReferences(workflowSketch);
      const workflowTokens = uniqueStrings(workflowReferences.map((item) => item.rawName));
      const workflowResolvedNames = uniqueStrings(
        workflowTokens
          .map((token) => resolveCatalogItemName(input.catalog, token))
          .filter((name): name is string => typeof name === "string")
      );
      referencedTokens = uniqueStrings([...referencedTokens, ...workflowTokens]);
      llmSelectedNames = uniqueStrings(
        [
          ...workflowResolvedNames,
          ...toStringArray(parsed.toolNames)
        ]
          .map((name) => resolveCatalogItemName(input.catalog, name))
          .filter((name): name is string => typeof name === "string")
      );
      const selectedToolNames = uniqueStrings([...latestResolvedFromAnalyzer, ...llmSelectedNames]).slice(0, topK);
      const refinementFeedback = didCallAnalyzer
        ? buildSearchRefinementFeedback({
            selectedToolNames,
            summary,
            workflowSketch
          })
        : selectedToolNames.length === 0
          ? "Your current answer resolved to zero valid catalog tools. Call the tree-sitter tool on a revised TypeScript workflow sketch before answering."
          : undefined;
      if (refinementFeedback) {
        messages.push(responseMessage);
        messages.push({ role: "user", content: refinementFeedback });
        continue;
      }
      break;
    }

    const selectedToolNames = uniqueStrings([...latestResolvedFromAnalyzer, ...llmSelectedNames]).slice(0, topK);
    if (selectedToolNames.length === 0) {
      throw new Error(didCallAnalyzer || analyzerCallCount > 0
        ? "Resolve retrieval did not converge on any valid catalog tools after AST refinement."
        : "Resolve retrieval did not converge on any valid catalog tools.");
    }
    if (!didCallAnalyzer || analyzerCallCount === 0) {
      referencedTokens = uniqueStrings([...referencedTokens, ...selectedToolNames]);
    }
    if (didCallAnalyzer && analyzerCallCount === 0) {
      throw new Error("Resolve retrieval LLM did not complete an AST planning round.");
    }
    if (!summary) {
      summary = didCallAnalyzer
        ? "Resolved a planned end-to-end tool bundle with AST-assisted retrieval."
        : "Resolved a planned end-to-end tool bundle from the resolver model response.";
    } else if (summary.toLowerCase().includes("no strong tool bundle match was found")) {
      summary = "Resolved a candidate tool bundle after iterative AST refinement.";
    }
    return {
      plannedSteps: plannedSteps.length > 0 ? plannedSteps : undefined,
      referencedTokens,
      selectedToolNames,
      summary,
      workflowSketch: workflowSketch || undefined
    };
  }

  private async callOpenAiWithTools(
    client: OpenAI,
    model: string,
    system: string,
    messages: SearchMessage[],
    timeoutMs: number
  ): Promise<SearchMessage> {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        ...messages
      ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: false,
      tools: [
        {
          type: "function",
          function: {
            name: treeSitterToolName,
            description: "Analyze a short TypeScript workflow sketch and extract exact ToolHub tool references.",
            parameters: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "TypeScript workflow sketch that references ToolHub tools."
                }
              },
              required: ["code"],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: "auto"
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, {
      timeout: timeoutMs
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("OpenAI resolve retrieval returned no assistant message.");
    }
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = (message.tool_calls ?? [])
      .map((toolCall, index) => {
        const rawToolCall = toolCall as unknown as { function?: unknown };
        const functionCall = isRecord(rawToolCall.function) ? rawToolCall.function : {};
        return {
          id: toolCall.id || `tool_call_${index}`,
          type: "function" as const,
          function: {
            arguments: typeof functionCall.arguments === "string" ? functionCall.arguments : "",
            name: typeof functionCall.name === "string" ? functionCall.name : ""
          }
        };
      })
      .filter((toolCall) => toolCall.function.name.length > 0);
    if (!content && toolCalls.length === 0) {
      throw new Error("OpenAI resolve retrieval returned no assistant content or tool calls.");
    }
    return {
      role: "assistant",
      content,
      tool_calls: toolCalls
    };
  }
}

async function waitForLocalResolverEndpoint(baseURL: string, apiKey: string, timeoutMs: number): Promise<void> {
  const readinessUrl = localResolverReadinessUrl(baseURL);
  if (!readinessUrl) {
    return;
  }
  const deadline = Date.now() + Math.min(Math.max(timeoutMs, 1000), 30_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      await fetch(readinessUrl, {
        headers: { authorization: `Bearer ${apiKey}` },
        method: "GET",
        signal: controller.signal
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableLocalResolverError(error)) {
        return;
      }
      await delay(300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`ToolHub resolver could not connect to CCR Gateway at ${readinessUrl}: ${formatError(lastError)}.`);
}

function localResolverReadinessUrl(baseURL: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    return undefined;
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    return undefined;
  }
  const base = baseURL.replace(/\/+$/g, "");
  return `${base}/models`;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("127.");
}

function isRetryableLocalResolverError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  const code = errorCode(error);
  return code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    code === "ETIMEDOUT";
}

function errorCode(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const direct = typeof error.code === "string" ? error.code : "";
  if (direct) {
    return direct;
  }
  const cause = isRecord(error.cause) ? error.cause : undefined;
  return typeof cause?.code === "string" ? cause.code : "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metaTools(): Array<{ description: string; inputSchema: Record<string, unknown>; name: string }> {
  return [
    {
      name: resolveToolName,
      description: [
        "Search ToolHub with the configured model and resolve installed MCP tools needed for a task.",
        `MUST be called before answering any request about external services, installed MCP capabilities, business APIs, orders, coupons, stores, accounts, available tools, or capabilities that are not already obvious from the eager tools.`,
        `Call this even if the user did not mention ToolHub or ${resolveToolName}.`,
        `Use ${invokeToolName} after this tool returns selected tools.`,
        "Follow the returned executionPlanJs: await means serial dependency, and only calls grouped by Promise.all may be invoked in parallel.",
        "Use the user's request as task and include concise context so the resolver can select the right tools."
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          context: { type: "object", additionalProperties: true },
          constraints: {
            type: "object",
            properties: {
              maxTools: { type: "number" }
            },
            additionalProperties: false
          }
        },
        required: ["task"],
        additionalProperties: false
      }
    },
    {
      name: invokeToolName,
      description: `Invoke one MCP tool selected by ${resolveToolName}. Follow executionPlanJs from ${resolveToolName}; do not parallelize invoke calls unless that plan groups them in Promise.all.`,
      inputSchema: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args: { type: "object", additionalProperties: true }
        },
        required: ["tool"],
        additionalProperties: false
      }
    }
  ];
}

function readBackendServers(): GatewayMcpServerConfig[] {
  const raw = env("TOOLHUB_MCP_SERVERS_JSON");
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(normalizeServerConfig).filter((server): server is GatewayMcpServerConfig => Boolean(server))
      : [];
  } catch {
    return [];
  }
}

function normalizeServerConfig(value: unknown): GatewayMcpServerConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const rawTransport = typeof value.transport === "string" ? value.transport : typeof value.type === "string" ? value.type : "";
  const normalizedTransport = rawTransport.toLowerCase().replace(/_/g, "-");
  const transport = normalizedTransport === "streamable-http" || normalizedTransport === "streamablehttp" || normalizedTransport === "http"
    ? "streamable-http"
    : normalizedTransport === "sse"
      ? "sse"
      : "stdio";
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : "";
  if (!name) {
    return undefined;
  }
  const base = {
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : undefined,
    name,
    protocolVersion: typeof value.protocolVersion === "string" ? value.protocolVersion : protocolVersion,
    requestTimeoutMs: normalizeTimeout(value.requestTimeoutMs, defaultRequestTimeoutMs),
    startupTimeoutMs: normalizeTimeout(value.startupTimeoutMs, defaultRequestTimeoutMs),
    transport
  };
  if (transport !== "stdio") {
    const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : "";
    if (!url) {
      return undefined;
    }
    return {
      ...base,
      apiKey: typeof value.apiKey === "string" ? value.apiKey : undefined,
      apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : undefined,
      headers: isStringRecord(value.headers) ? value.headers : {},
      transport,
      url
    };
  }
  const command = typeof value.command === "string" && value.command.trim() ? value.command.trim() : "";
  if (!command) {
    return undefined;
  }
  return {
    ...base,
    args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [],
    command,
    cwd: typeof value.cwd === "string" && value.cwd.trim() ? value.cwd.trim() : undefined,
    env: isStringRecord(value.env) ? value.env : {},
    stdioMessageMode: value.stdioMessageMode === "newline-json" ? "newline-json" : "content-length",
    transport
  };
}

function normalizeToolList(value: unknown): ToolDefinition[] {
  const tools = isRecord(value) && Array.isArray(value.tools) ? value.tools : [];
  const result: ToolDefinition[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool.name !== "string" || !tool.name.trim()) {
      continue;
    }
    result.push({
      description: typeof tool.description === "string" ? tool.description : "",
      inputSchema: normalizeInputSchema(tool.inputSchema ?? tool.input_schema),
      name: tool.name.trim(),
      outputSchema: normalizeOptionalSchema(tool.outputSchema ?? tool.output_schema),
      tags: Array.isArray(tool.tags) ? tool.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
      title: typeof tool.title === "string" && tool.title.trim() ? tool.title.trim() : undefined
    });
  }
  return result;
}

function normalizeInputSchema(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { type: "object", properties: {} };
}

function normalizeOptionalSchema(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function parseHttpJsonRpcResponse(text: string): unknown {
  if (/^event:/m.test(text) || /^data:/m.test(text)) {
    const events = text.split(/\n\n+/);
    for (const event of events) {
      const data = event
        .split(/\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      if (!data) continue;
      try {
        return JSON.parse(data) as unknown;
      } catch {
        continue;
      }
    }
  }
  return JSON.parse(text) as unknown;
}

function consumeSseEvents(buffer: string, handle: (event: { data: string; event: string }) => void): string {
  let offset = 0;
  for (;;) {
    const nextMatch = /\r?\n\r?\n/.exec(buffer.slice(offset));
    if (!nextMatch || nextMatch.index < 0) {
      return buffer.slice(offset);
    }
    const next = offset + nextMatch.index;
    const raw = buffer.slice(offset, next);
    offset = next + nextMatch[0].length;
    let event = "message";
    const data: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim() || "message";
      } else if (line.startsWith("data:")) {
        data.push(line.slice("data:".length).trimStart());
      }
    }
    if (data.length > 0 || event !== "message") {
      handle({ data: data.join("\n"), event });
    }
  }
}

function firstJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function serverNamespaces(serverNames: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  const output = new Map<string, string>();
  for (const serverName of serverNames) {
    const base = toIdentifier(serverName);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    output.set(serverName, count === 1 ? base : `${base}_${count}`);
  }
  return output;
}

function toIdentifier(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) {
    return "tool";
  }
  return /^\d/.test(normalized) ? `_${normalized}` : normalized;
}

function toSearchCatalogItem(entry: CatalogEntry): SearchCatalogItem {
  return {
    alias: entry.alias,
    canonicalName: entry.canonicalName,
    description: entry.description,
    invocationMode: entry.invocation.mode,
    name: entry.toolName,
    remoteToolName: entry.remoteToolName,
    required: getSchemaRequiredProperties(entry.inputSchema),
    serverId: entry.serverId,
    serverLabel: entry.serverLabel,
    sideEffect: entry.invocation.sideEffect,
    title: entry.title
  };
}

function buildSearchSystemPrompt(catalog: SearchCatalogItem[], topK: number): string {
  return [
    "You are the ToolHub resolve planner and retrieval agent.",
    "Your job is to return the complete anticipated tool bundle for the user task, not just the first tool.",
    "You must think ahead about the next likely steps needed to finish the task end-to-end.",
    `You MUST call ${treeSitterToolName} before your final answer.`,
    "You may need multiple planning and search rounds.",
    "If your first workflow sketch yields zero, partial, or weak tool matches, revise the sketch and call the tree-sitter tool again before answering.",
    "Workflow you must follow:",
    "1. Plan the likely execution steps.",
    "2. Draft a short JavaScript/TypeScript workflow sketch that uses the exact catalog tool names or aliases you expect to need.",
    "2a. Prefer sketches that call tools through string literals such as callTool(\"<exact catalog tool name>\", {...}) or tools.call(\"<exact catalog tool name>\", {...}).",
    "3. Call the tree-sitter tool on that sketch.",
    "4. Inspect the tree-sitter result and check whether the bundle is complete end-to-end.",
    "5. If it is incomplete, revise the sketch and call the tree-sitter tool again.",
    "6. Return the final JSON only after the bundle is complete.",
    `Return at most ${topK} tool names.`,
    "Final answer MUST be a JSON object with this shape:",
    "{ \"summary\": string, \"steps\": string[], \"workflowSketch\": string, \"toolNames\": string[] }",
    "Rules:",
    "- toolNames must be exact catalog names or aliases.",
    "- workflowSketch is the dependency plan that will be returned to the caller as executionPlanJs.",
    "- In workflowSketch, use await to show serial dependencies and Promise.all([...]) only for tool calls that are independent and safe to invoke in parallel.",
    "- Do not put side-effecting calls in Promise.all unless they are truly independent and safe to run concurrently.",
    "- In workflowSketch, prefer string-literal tool calls over reconstructed member chains whenever possible.",
    "- Include prerequisite and downstream tools you will likely need after the first action.",
    "- Never invent tool names.",
    "- Generic browser automation tools are a strong match for web tasks such as ordering, buying, booking, delivery, or checkout when no domain-specific MCP tool exists.",
    "- For browser navigation/open calls, prefer omitting waitUntil or using waitUntil: \"interactive\" so the agent can inspect and act as soon as the page is usable.",
    "- Do not use waitUntil: \"network_idle\" for Gmail, Google sign-in, SPAs, mail, chat, auth, checkout, verification, or pages with long-lived requests. Use network_idle only when the user explicitly asks for network quiescence.",
    "- When selecting CCR browser automation tools, include the human-handoff follow-up tools needed if login, CAPTCHA, verification, blocked navigation, or manual confirmation appears.",
    "- For CCR browser automation bundles, include browser_handoff_request and browser_handoff_wait when the workflow may need user help. Do not assume all browser tools are preloaded.",
    "- For importing existing Chrome login state into CCR's in-app browser, select browser_chrome_login_import and include browser_chrome_login_import_status to check completion.",
    "- If using member-call syntax, prefer tools.<catalog alias>(...) or mcp.<server namespace>.<remote tool name>(...).",
    "- For lookup tasks, do not stop at opening or navigating. Include the tools needed to read or extract the answer.",
    "- If the catalog has no strong match, return an empty toolNames array.",
    "",
    "Tool catalog:",
    JSON.stringify(catalog, null, 2)
  ].join("\n");
}

function buildSearchRefinementFeedback(input: {
  selectedToolNames: string[];
  summary: string;
  workflowSketch: string;
}): string | undefined {
  const issues: string[] = [];
  if (!input.workflowSketch.trim()) {
    issues.push("workflowSketch is empty.");
  }
  if (input.selectedToolNames.length === 0) {
    issues.push("Your current answer resolved to zero valid catalog tools.");
  }
  if (input.summary.trim().toLowerCase().includes("no strong tool bundle match was found")) {
    issues.push("Your summary says the bundle is weak; revise the workflow sketch and search again.");
  }
  if (issues.length === 0) {
    return undefined;
  }
  return [
    "Your last candidate tool bundle is incomplete.",
    ...issues.map((issue, index) => `${index + 1}. ${issue}`),
    `Revise the workflow sketch, call ${treeSitterToolName} again, and then return updated JSON only.`
  ].join("\n");
}

class ToolReferenceAnalyzer {
  collectReferences(code: string): ToolReference[] {
    if (!code.trim()) {
      return [];
    }
    const references: ToolReference[] = [];
    this.collectStringCallReferences(code, references);
    this.collectMemberReferences(code, references);
    return uniqueToolReferences(references);
  }

  private collectStringCallReferences(code: string, output: ToolReference[]): void {
    const patterns: Array<{ regex: RegExp; source: string }> = [
      { regex: /\bcallTool\s*\(\s*(["'`])([^"'`]+)\1/g, source: "callTool" },
      { regex: /\btools\s*\.\s*call\s*\(\s*(["'`])([^"'`]+)\1/g, source: "tools.call" },
      { regex: /\b[\w$]+\s*\.\s*callTool\s*\(\s*(["'`])([^"'`]+)\1/g, source: "context.callTool" },
      { regex: /\btools\s*\[\s*(["'`])([^"'`]+)\1\s*\]\s*\(/g, source: "tools.subscript" }
    ];
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern.regex)) {
        const rawName = match[2]?.trim();
        if (rawName) {
          output.push(buildToolReference(code, match.index ?? 0, rawName, pattern.source));
        }
      }
    }
  }

  private collectMemberReferences(code: string, output: ToolReference[]): void {
    const patterns: Array<{ regex: RegExp; source: string }> = [
      { regex: /\btools\s*\.\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g, source: "tools.member" },
      { regex: /\bmcp\s*\.\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*){1,})\s*\(/g, source: "mcp.member" }
    ];
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern.regex)) {
        const pathText = match[1]?.replace(/\s+/g, "");
        if (!pathText || pathText === "call") {
          continue;
        }
        const rawName = pattern.source === "mcp.member" ? `mcp.${pathText}` : pathText;
        output.push(buildToolReference(code, match.index ?? 0, rawName, pattern.source));
      }
    }
  }
}

function buildToolReference(code: string, index: number, rawName: string, source: string): ToolReference {
  const before = code.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    column: lines[lines.length - 1].length + 1,
    line: lines.length,
    rawName,
    source
  };
}

function uniqueToolReferences(references: ToolReference[]): ToolReference[] {
  const seen = new Set<string>();
  const output: ToolReference[] = [];
  for (const reference of references) {
    const key = `${reference.rawName}\u0000${reference.source}\u0000${reference.line}\u0000${reference.column}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(reference);
  }
  return output;
}

function parseToolArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeTopK(value: unknown): number {
  return Math.min(Math.max(toPositiveIntOrDefault(value, defaultMaxTools), 1), 20);
}

function normalizeSearchTimeout(value: unknown): number {
  return Math.max(toPositiveIntOrDefault(value, defaultRequestTimeoutMs), minSearchTimeoutMs);
}

function toPositiveIntOrDefault(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

function resolveCatalogItemName(
  catalog: Array<{ alias: string; canonicalName?: string; name: string; remoteToolName?: string }>,
  token: string
): string | undefined {
  const normalized = token.trim();
  if (!normalized) {
    return undefined;
  }
  const lookupCandidates = uniqueStrings([
    normalized,
    toIdentifier(normalized),
    normalized.startsWith("mcp.") ? normalized : `mcp.${normalized}`,
    normalized.startsWith("mcp_") ? normalized : `mcp_${toIdentifier(normalized)}`
  ]);
  for (const item of catalog) {
    const itemExactNames = uniqueStrings([
      item.name,
      item.alias,
      item.canonicalName ?? "",
      item.canonicalName ? toIdentifier(item.canonicalName) : ""
    ].filter(Boolean));
    for (const candidate of lookupCandidates) {
      if (itemExactNames.includes(candidate)) {
        return item.name;
      }
    }
  }
  const suffixMatches = catalog.filter((item) => matchesUniqueSuffix(item, normalized));
  return suffixMatches.length === 1 ? suffixMatches[0].name : undefined;
}

function matchesUniqueSuffix(
  item: { alias: string; canonicalName?: string; name: string; remoteToolName?: string },
  token: string
): boolean {
  const tokenAlias = toIdentifier(token);
  const nameSuffix = item.name.split(".").slice(1).join(".");
  const remoteToolName = item.remoteToolName || item.name.split(".").at(-1) || "";
  const suffixes = uniqueStrings([
    item.canonicalName ?? "",
    item.canonicalName ? toIdentifier(item.canonicalName) : "",
    nameSuffix,
    toIdentifier(nameSuffix),
    remoteToolName,
    toIdentifier(remoteToolName)
  ].filter(Boolean));
  return suffixes.includes(token) || suffixes.includes(tokenAlias);
}

function buildTsDefinitions(entries: CatalogEntry[]): string {
  return entries
    .map((entry) => {
      const typeName = toTypeName(entry.toolName);
      const argsTypeName = `${typeName}Args`;
      return [
        "/**",
        ` * ${entry.description || entry.title}`,
        ` * Exact tool name: "${entry.toolName}".`,
        ` * Callable references: "${entry.toolName}", "${entry.alias}".`,
        " */",
        `type ${argsTypeName} = ${schemaToType(entry.inputSchema)};`,
        `type ${typeName}Call = { tool: "${entry.toolName}"; args: ${argsTypeName}; };`
      ].join("\n");
    })
    .join("\n\n");
}

function schemaToType(schema: Record<string, unknown> | undefined): string {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return "Record<string, unknown>";
  }
  const required = new Set(getSchemaRequiredProperties(schema));
  const lines = ["{"];
  for (const [key, value] of Object.entries(schema.properties)) {
    const propertySchema = isRecord(value) ? value : {};
    lines.push(`  ${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${jsonSchemaTypeToTs(propertySchema)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function jsonSchemaTypeToTs(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum) && schema.enum.every((item) => typeof item === "string")) {
    return schema.enum.map((item) => JSON.stringify(item)).join(" | ") || "string";
  }
  switch (schema.type) {
    case "array":
      return "unknown[]";
    case "boolean":
      return "boolean";
    case "integer":
    case "number":
      return "number";
    case "object":
      return "Record<string, unknown>";
    case "string":
      return "string";
    default:
      return "unknown";
  }
}

function toTypeName(value: string): string {
  const words = value.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const name = words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("");
  return name || "Tool";
}

function scoreLocalCatalogMatch(taskText: string, tool: CatalogEntry, preferredToolScores: Map<string, number>): number {
  const taskTokens = tokenizeLocalSearchText(taskText);
  const taskTokenSet = new Set(taskTokens);
  const toolText = [
    tool.toolName,
    tool.alias,
    tool.canonicalName,
    tool.remoteToolName,
    tool.serverId,
    tool.serverLabel ?? "",
    tool.title,
    tool.description,
    ...tool.tags
  ].join(" ");
  const toolTokens = tokenizeLocalSearchText(toolText);
  let score = preferredToolScores.get(tool.remoteToolName) ?? preferredToolScores.get(tool.toolName) ?? 0;
  for (const token of toolTokens) {
    if (taskTokenSet.has(token)) {
      score += token.length > 4 ? 3 : 1;
    }
  }
  if (tool.invocation.sideEffect) {
    score -= 8;
  }
  return score;
}

function getLocalFallbackPreferredTools(taskText: string): Map<string, number> {
  const tokens = new Set(tokenizeLocalSearchText(taskText));
  const normalizedText = taskText.toLowerCase();
  const scores = new Map<string, number>();
  const add = (toolName: string, score: number) => scores.set(toolName, Math.max(scores.get(toolName) ?? 0, score));
  if (hasAnyToken(tokens, [
    "app",
    "book",
    "booking",
    "browse",
    "buy",
    "cart",
    "checkout",
    "coffee",
    "delivery",
    "latte",
    "order",
    "pickup",
    "product",
    "purchase",
    "restaurant",
    "search",
    "shop",
    "store",
    "website"
  ]) || /咖啡|拿铁|生椰|点单|下单|外卖|配送|自取|门店|商品|购买|结账|订单/.test(normalizedText)) {
    add("browser_session_open", 120);
    add("browser_navigate", 112);
    add("browser_snapshot", 108);
    add("browser_ax_query", 96);
    add("browser_element_input", 88);
    add("browser_element_click", 84);
    add("browser_screenshot", 60);
    add("browser_events_await", 44);
  }
  if (hasAnyToken(tokens, [
    "auth",
    "chrome",
    "cookie",
    "cookies",
    "import",
    "localstorage",
    "login",
    "session",
    "signin",
    "storage"
  ]) || /chrome|cookie|cookies|localstorage|local storage|登录态|登录状态|导入登录|浏览器登录|本地存储/.test(normalizedText)) {
    add("browser_chrome_login_import", 128);
    add("browser_chrome_login_import_status", 92);
  }
  if (hasAnyToken(tokens, ["address", "delivery", "geo", "geolocation", "location", "nearby", "pickup", "store"]) ||
    /地址|定位|位置|附近|配送|外卖|自取|门店/.test(normalizedText)) {
    add("location_permission_status", 90);
    add("location_get_current", 86);
  }
  if (hasAnyToken(tokens, ["ask", "choice", "confirm", "confirmation", "missing", "option", "preference", "question", "select", "user"]) ||
    /确认|选择|偏好|口味|缺少|询问|用户/.test(normalizedText)) {
    add("user_interaction_collect", 82);
  }
  return scores;
}

function getDeterministicTaskTools(taskText: string, catalog: CatalogEntry[]): CatalogEntry[] {
  if (!taskWantsChromeLoginImport(taskText)) {
    return [];
  }
  return [
    catalog.find((tool) => isBrowserAutomationTool(tool) && tool.remoteToolName === "browser_chrome_login_import"),
    catalog.find((tool) => isBrowserAutomationTool(tool) && tool.remoteToolName === "browser_chrome_login_import_status")
  ].filter((tool): tool is CatalogEntry => Boolean(tool));
}

function taskWantsChromeLoginImport(taskText: string): boolean {
  const normalizedText = taskText.toLowerCase();
  return normalizedText.includes("browser_chrome_login_import") ||
    /(chrome|谷歌浏览器|浏览器).*(login|signin|auth|cookie|localstorage|local storage|session|登录态|登录状态|登录信息|本地存储|cookie)/.test(normalizedText) ||
    /(import|导入|迁移|同步).*(chrome|谷歌浏览器).*(login|signin|auth|cookie|localstorage|local storage|session|登录态|登录状态|登录信息|本地存储)/.test(normalizedText) ||
    /(登录态|登录状态|登录信息).*(chrome|谷歌浏览器|浏览器).*(导入|迁移|同步)/.test(normalizedText);
}

function catalogHasChromeLoginImportTool(catalog: CatalogEntry[]): boolean {
  return catalog.some((tool) => isBrowserAutomationTool(tool) && tool.remoteToolName === "browser_chrome_login_import");
}

function tokenizeLocalSearchText(text: string): string[] {
  const tokens = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !localSearchStopWords.has(token));
  return uniqueStrings(tokens);
}

const localSearchStopWords = new Set(["a", "an", "and", "are", "as", "be", "by", "for", "from", "in", "is", "it", "need", "of", "or", "the", "then", "to", "with"]);

function uniqueToolEntries(entries: CatalogEntry[]): CatalogEntry[] {
  const seen = new Set<string>();
  const output: CatalogEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.toolName)) {
      continue;
    }
    seen.add(entry.toolName);
    output.push(entry);
  }
  return output;
}

function expandToolBundleWithCompanionTools(selectedTools: CatalogEntry[], catalog: CatalogEntry[]): CatalogEntry[] {
  const output = uniqueToolEntries(selectedTools);
  const selectedNames = new Set(output.map((tool) => tool.toolName));
  const selectedRemoteNames = new Set(output.map((tool) => tool.remoteToolName));
  const hasBrowserAutomationTool = output.some((tool) => isBrowserAutomationTool(tool));
  const hasHandoffRequestTool = output.some((tool) =>
    isBrowserAutomationTool(tool) &&
    (tool.remoteToolName === "browser_handoff_request" || tool.remoteToolName === "askHumanHelp")
  );
  const hasChromeLoginImportTool = output.some((tool) =>
    isBrowserAutomationTool(tool) &&
    tool.remoteToolName === "browser_chrome_login_import"
  );
  const companionRemoteNames = new Set<string>();

  if (hasBrowserAutomationTool) {
    companionRemoteNames.add("browser_handoff_request");
    companionRemoteNames.add("browser_handoff_status");
    companionRemoteNames.add("browser_handoff_wait");
  }
  if (hasHandoffRequestTool) {
    companionRemoteNames.add("browser_handoff_wait");
  }
  if (hasChromeLoginImportTool) {
    companionRemoteNames.add("browser_chrome_login_import_status");
  }

  for (const remoteToolName of companionRemoteNames) {
    if (selectedRemoteNames.has(remoteToolName)) {
      continue;
    }
    const companion = catalog.find((tool) =>
      isBrowserAutomationTool(tool) &&
      tool.remoteToolName === remoteToolName &&
      !selectedNames.has(tool.toolName)
    );
    if (companion) {
      output.push(companion);
      selectedNames.add(companion.toolName);
      selectedRemoteNames.add(companion.remoteToolName);
    }
  }

  return output;
}

function isBrowserAutomationTool(tool: CatalogEntry): boolean {
  return tool.serverName === "ccr-browser-automation" ||
    tool.serverId === "ccr-browser-automation" ||
    tool.serverNamespace === "ccr_browser_automation" ||
    tool.toolName.startsWith("mcp.ccr_browser_automation.");
}

function buildLocalFallbackWorkflowSketch(selectedTools: CatalogEntry[]): string | undefined {
  return selectedTools.length > 0 ? buildSequentialExecutionPlanJs(selectedTools) : undefined;
}

function isBrowserNavigationTool(tool: CatalogEntry): boolean {
  return isBrowserAutomationTool(tool) && (
    tool.toolName.endsWith("browser_session_open") ||
    tool.toolName.endsWith("browser_navigate") ||
    tool.remoteToolName === "browser_session_open" ||
    tool.remoteToolName === "browser_navigate"
  );
}

function buildExecutionPlanJs(workflowSketch: string | undefined, selectedTools: CatalogEntry[]): string {
  const trimmed = typeof workflowSketch === "string" ? workflowSketch.trim() : "";
  return trimmed || buildSequentialExecutionPlanJs(selectedTools);
}

function buildSequentialExecutionPlanJs(selectedTools: CatalogEntry[]): string {
  if (selectedTools.length === 0) {
    return [
      "async function runWithToolHub() {",
      "  // Ask the user for missing task details before invoking tools.",
      "}"
    ].join("\n");
  }
  const lines = [
    "async function runWithToolHub() {",
    "  // Invoke calls in this order unless the plan explicitly uses Promise.all."
  ];
  selectedTools.forEach((tool, index) => {
    lines.push(`  const step${index + 1} = await callTool(${JSON.stringify(tool.toolName)}, ${buildExecutionPlanArgs(tool)});`);
  });
  lines.push("}");
  return lines.join("\n");
}

function buildExecutionPlanArgs(tool: CatalogEntry): string {
  if (isBrowserNavigationTool(tool)) {
    return "{ url, waitUntil: \"interactive\" }";
  }
  const required = getSchemaRequiredProperties(tool.inputSchema);
  if (required.length === 0) {
    return "{}";
  }
  return `{ ${required.map((key) => `${JSON.stringify(key)}: ${toPlanVariableName(key)}`).join(", ")} }`;
}

function toPlanVariableName(value: string): string {
  const identifier = toIdentifier(value).replace(/^[A-Z]/, (match) => match.toLowerCase());
  if (!identifier || reservedJavaScriptWords.has(identifier)) {
    return "value";
  }
  return identifier;
}

function inferInvocation(tool: ToolDefinition): ToolInvocation {
  const text = `${tool.name} ${tool.title ?? ""} ${tool.description ?? ""}`;
  const tokenList = tokenizeToolText(text);
  const tokens = new Set(tokenList);
  const sideEffect = hasAnyToken(tokens, [
    "book",
    "cancel",
    "commit",
    "create",
    "delete",
    "execute",
    "merge",
    "post",
    "publish",
    "purchase",
    "push",
    "remove",
    "reserve",
    "run",
    "send",
    "submit",
    "update",
    "write"
  ]);
  const workflowOnly = hasAnyToken(tokens, ["batch", "bulk", "foreach", "iterate", "parallel"]) ||
    hasTokenSequence(tokenList, ["for", "each"]) ||
    hasTokenSequence(tokenList, ["sync", "all"]) ||
    hasTokenSequence(tokenList, ["export", "all"]);
  return {
    mode: workflowOnly ? "workflow" : "both",
    sideEffect
  };
}

function tokenizeToolText(text: string): string[] {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9_]+/g, " ")
    .toLowerCase();
  return spaced.split(/\s+|_+/).filter(Boolean);
}

function hasAnyToken(tokens: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.has(candidate));
}

function hasTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || tokens.length < sequence.length) {
    return false;
  }
  for (let index = 0; index <= tokens.length - sequence.length; index += 1) {
    if (sequence.every((token, offset) => tokens[index + offset] === token)) {
      return true;
    }
  }
  return false;
}

function selectFirstActionTool(selectedTools: CatalogEntry[]): CatalogEntry | undefined {
  const candidates = selectedTools
    .map((tool, index) => ({
      index,
      rank: rankFirstActionTool(tool),
      tool
    }))
    .filter((candidate) => !candidate.tool.invocation.sideEffect);
  const rankedCandidates = candidates.length
    ? candidates
    : selectedTools.map((tool, index) => ({
        index,
        rank: rankFirstActionTool(tool),
        tool
      }));
  return rankedCandidates.sort((left, right) => {
    return left.rank.derivedRequiredCount - right.rank.derivedRequiredCount ||
      right.rank.userSuppliedRequiredCount - left.rank.userSuppliedRequiredCount ||
      left.rank.requiredCount - right.rank.requiredCount ||
      left.index - right.index;
  })[0]?.tool;
}

function rankFirstActionTool(tool: CatalogEntry): {
  derivedRequiredCount: number;
  requiredCount: number;
  userSuppliedRequiredCount: number;
} {
  const required = getSchemaRequiredProperties(tool.inputSchema);
  return {
    derivedRequiredCount: required.filter(isLikelyWorkflowIntermediateArgument).length,
    requiredCount: required.length,
    userSuppliedRequiredCount: required.filter(isLikelyUserSuppliedArgument).length
  };
}

function isLikelyWorkflowIntermediateArgument(name: string): boolean {
  const normalized = normalizeSchemaPropertyName(name);
  return /(?:dept|department|shop|store|merchant|product|goods|sku|cart|order|payment|coupon|address)id$/.test(normalized) ||
    /(?:sku|order|product|goods|shop|store)(?:code|no|num|number)$/.test(normalized) ||
    normalized === "id" ||
    normalized.endsWith("list");
}

function isLikelyUserSuppliedArgument(name: string): boolean {
  const normalized = normalizeSchemaPropertyName(name);
  return normalized === "query" ||
    normalized === "keyword" ||
    normalized === "keywords" ||
    normalized === "search" ||
    normalized === "address" ||
    normalized === "city" ||
    normalized === "latitude" ||
    normalized === "lat" ||
    normalized === "longitude" ||
    normalized === "lng" ||
    normalized === "lon" ||
    normalized.endsWith("name") ||
    normalized.endsWith("text");
}

function normalizeSchemaPropertyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getSchemaRequiredProperties(schema: Record<string, unknown> | undefined): string[] {
  return Array.isArray(schema?.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
}

function cloneServerConfig(config: GatewayMcpServerConfig): GatewayMcpServerConfig {
  if (config.transport === "stdio") {
    return {
      ...config,
      args: config.args ? [...config.args] : undefined,
      env: config.env ? { ...config.env } : undefined
    };
  }
  return {
    ...config,
    headers: config.headers ? { ...config.headers } : undefined
  };
}

function normalizeTargetServerNames(serverNames: string[] | undefined, entries: Map<string, unknown>): string[] {
  if (!serverNames || serverNames.length === 0) {
    return [...entries.keys()];
  }
  return uniqueStrings(serverNames.map((item) => item.trim()).filter((item) => entries.has(item)));
}

const toolHubPersistentCache = {
  readDiscovery(serverName: string, configHash: string): {
    cachedAt: number;
    configHash: string;
    lastSeenOnlineAt?: number;
    tools: ToolDefinition[];
  } | null {
    const store = readCacheStore();
    const entry = store.discovery[serverName];
    if (!entry) {
      return null;
    }
    if (entry.configHash !== configHash) {
      delete store.discovery[serverName];
      writeCacheStore(store);
      return null;
    }
    return {
      cachedAt: entry.cachedAt,
      configHash: entry.configHash,
      lastSeenOnlineAt: entry.lastSeenOnlineAt,
      tools: entry.tools.map((tool) => ({ ...tool }))
    };
  },
  writeDiscovery(serverName: string, configHash: string, tools: ToolDefinition[], lastSeenOnlineAt = Date.now()): void {
    const store = readCacheStore();
    store.discovery[serverName] = {
      cachedAt: Date.now(),
      configHash,
      lastSeenOnlineAt,
      tools: tools.map((tool) => ({ ...tool }))
    };
    writeCacheStore(store);
  }
};

type ToolHubCacheStore = {
  discovery: Record<string, {
    cachedAt: number;
    configHash: string;
    lastSeenOnlineAt?: number;
    tools: ToolDefinition[];
  }>;
  version: 1;
};

function readCacheStore(): ToolHubCacheStore {
  try {
    const file = toolHubCacheFile();
    if (!existsSync(file)) {
      return createEmptyCacheStore();
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return normalizeCacheStore(parsed);
  } catch {
    return createEmptyCacheStore();
  }
}

function writeCacheStore(store: ToolHubCacheStore): void {
  const file = toolHubCacheFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tempFile, file);
}

function createEmptyCacheStore(): ToolHubCacheStore {
  return { discovery: {}, version: 1 };
}

function normalizeCacheStore(value: unknown): ToolHubCacheStore {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.discovery)) {
    return createEmptyCacheStore();
  }
  const discovery: ToolHubCacheStore["discovery"] = {};
  for (const [serverName, entryValue] of Object.entries(value.discovery)) {
    if (!isRecord(entryValue) || typeof entryValue.configHash !== "string" || !Array.isArray(entryValue.tools)) {
      continue;
    }
    discovery[serverName] = {
      cachedAt: typeof entryValue.cachedAt === "number" && Number.isFinite(entryValue.cachedAt) ? entryValue.cachedAt : Date.now(),
      configHash: entryValue.configHash,
      lastSeenOnlineAt: typeof entryValue.lastSeenOnlineAt === "number" && Number.isFinite(entryValue.lastSeenOnlineAt) ? entryValue.lastSeenOnlineAt : undefined,
      tools: entryValue.tools
        .map(normalizeToolDefinitionForCache)
        .filter((tool): tool is ToolDefinition => Boolean(tool))
    };
  }
  return { discovery, version: 1 };
}

function normalizeToolDefinitionForCache(value: unknown): ToolDefinition | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  return {
    description: typeof value.description === "string" ? value.description : "",
    inputSchema: normalizeOptionalSchema(value.inputSchema),
    name: value.name.trim(),
    outputSchema: normalizeOptionalSchema(value.outputSchema),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : undefined
  };
}

function toolHubCacheFile(): string {
  return env("TOOLHUB_CACHE_FILE") || path.join(os.homedir(), ".claude-code-router", "toolhub-cache.json");
}

function hashToolHubMcpServerConfig(config: GatewayMcpServerConfig): string {
  return createHash("sha256").update(stableJsonStringify(config) ?? "null").digest("hex");
}

function stableJsonStringify(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item) ?? "null").join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key]) ?? "null"}`);
  return `{${entries.join(",")}}`;
}

function normalizeResolveTaskKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function summarizeValue(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 600 ? `${text.slice(0, 600)}...` : text;
  } catch {
    return String(value);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function jsonRpcResult(id: null | number | string, result: JsonValue): JsonRpcResponse {
  return {
    id,
    jsonrpc: "2.0",
    result
  };
}

function jsonRpcError(id: null | number | string, code: number, message: string): JsonRpcResponse {
  return {
    error: {
      code,
      message
    },
    id,
    jsonrpc: "2.0"
  };
}

function writeJsonRpc(response: JsonRpcResponse, messageMode: MessageMode = "content-length"): void {
  const text = JSON.stringify(response);
  if (messageMode === "newline-json") {
    process.stdout.write(`${text}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

function toolError(code: string, message: string): unknown {
  return {
    content: [{
      text: `${code}: ${message}`,
      type: "text"
    }],
    isError: true
  };
}

function toolResult(payload: Record<string, unknown>): unknown {
  return {
    ...payload,
    content: [{
      text: JSON.stringify(payload, null, 2),
      type: "text"
    }],
    structuredContent: payload
  };
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMaxTools(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 20) : defaultMaxTools;
}

function normalizeTimeout(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 100), 600_000) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
