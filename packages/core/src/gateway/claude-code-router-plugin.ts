import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { type AppConfig, type RouterBuiltInAgentRuleId, type RouterFallbackConfig, type RouterRule, type RouterRuleCondition, type RouterRuleRewrite } from "@ccr/core/contracts/app";
import { CONFIGDIR } from "@ccr/core/config/constants";
import { applyAgentRequestEnrichers } from "@ccr/core/agents/request-enricher";
import { compileRouterConfig, type CompiledRouterConfig, type CompiledRouterRule } from "@ccr/core/routing/config-compiler";
import type { RouteDecision, RouteDiagnostic, RouteModelRef, RouteRequest, RouteSource } from "@ccr/core/routing/contracts";
import { ModelRegistry, normalizeRouteSelector } from "@ccr/core/routing/model-registry";
import { RoutePolicyEngine, type RoutePolicy } from "@ccr/core/routing/policy-engine";

export { normalizeRouteSelector } from "@ccr/core/routing/model-registry";

type HeaderValue = string | string[] | undefined;

export type MutableRequestLike = RouteRequest;

export type ClaudeCodeRouteDecision = {
  diagnostics: RouteDiagnostic[];
  fallback: RouterFallbackConfig;
  model?: string;
  reason: string;
  sessionId?: string;
  source: RouteSource;
  tokenCount: number;
};

type ConfiguredRouteDecision = Omit<RouteDecision, "diagnostics">;

const requireFromHere = createRequire(__filename);

export class ClaudeCodeRouterPlugin {
  private readonly compiled: CompiledRouterConfig;
  private readonly event = new EventEmitter();

  constructor(private readonly config: AppConfig) {
    this.compiled = compileRouterConfig(config);
  }

  async routeRequest(input: {
    body: Record<string, unknown>;
    headers: Record<string, HeaderValue>;
    method: string;
    url: string;
  }): Promise<{ body: Record<string, unknown>; decision: ClaudeCodeRouteDecision }> {
    const body = cloneRecord(input.body);
    const request: MutableRequestLike = {
      body,
      headers: input.headers,
      log: console,
      method: input.method,
      url: input.url
    };
    applyAgentRequestEnrichers(request, [{
      enrich: (matchedRequest) => {
        injectClaudeCodeAgentToolDescription(matchedRequest.body, this.config);
        injectClaudeCodeToolHubInstructions(matchedRequest.body, this.config);
        removeClaudeCodeBillingSystemHeader(matchedRequest.body);
        matchedRequest.builtInSubagentModel = extractAndRemoveClaudeCodeSubagentModelTag(matchedRequest.body);
      },
      id: "claude-code",
      matches: (candidate) => builtInAgentRouteMatches(candidate, this.config, "claude-code")
    }]);
    const sessionId = resolveSessionId(body, input.headers);
    const tokenCount = calculateTokenCount(body.messages, body.system, body.tools);
    request.sessionId = sessionId;
    request.tokenCount = tokenCount;

    const requestedCustomModel = await this.resolveCustomRoute(request);
    const customModel = this.compiled.modelRegistry.resolve(requestedCustomModel);
    const customDiagnostic: RouteDiagnostic[] = requestedCustomModel && !customModel
      ? [{
          code: "custom-model-not-configured",
          message: `Custom router returned unconfigured model "${requestedCustomModel}".`,
          model: requestedCustomModel,
          source: "custom"
        }]
      : [];
    const configuredDecision = resolveConfiguredRouteDecision(request, this.config, this.compiled, customModel);
    if (configuredDecision.rewrites.length) {
      for (const rewrite of configuredDecision.rewrites) {
        applyRouterRewrite(rewrite, request);
      }
    }
    if (configuredDecision.model) {
      body.model = configuredDecision.model.selector;
    }
    const routedModel = configuredDecision.model?.selector ?? readString(body.model);

    return {
      body,
      decision: {
        diagnostics: [...this.compiled.diagnostics, ...customDiagnostic],
        fallback: configuredDecision.fallback,
        model: routedModel,
        reason: configuredDecision.reason,
        sessionId,
        source: configuredDecision.source,
        tokenCount
      }
    };
  }

  countTokens(body: Record<string, unknown>) {
    return {
      input_tokens: calculateTokenCount(body.messages, body.system, body.tools)
    };
  }

  getRouteDiagnostics(): RouteDiagnostic[] {
    return [...this.compiled.diagnostics];
  }

  private async resolveCustomRoute(request: MutableRequestLike): Promise<string | undefined> {
    const routerPath = this.config.CUSTOM_ROUTER_PATH;
    if (!routerPath) {
      return undefined;
    }

    try {
      const resolvedRouterPath = resolveCustomRouterModule(routerPath);
      delete requireFromHere.cache[resolvedRouterPath];
      const loaded = requireFromHere(resolvedRouterPath) as unknown;
      const customRouter = typeof loaded === "function" ? loaded : readDefaultFunction(loaded);
      if (!customRouter) {
        request.log.warn(`Custom router does not export a function: ${routerPath}`);
        return undefined;
      }
      const result = await customRouter(request, this.config, { event: this.event });
      return normalizeRouteSelector(typeof result === "string" ? result : undefined);
    } catch (error) {
      request.log.error(`Failed to load custom router "${routerPath}": ${formatError(error)}`);
      return undefined;
    }
  }
}

function resolveCustomRouterModule(routerPath: string): string {
  const resolved = requireFromHere.resolve(resolveLocalModulePath(routerPath, "Custom router"));
  assertJavaScriptModulePath(resolved, "Custom router");
  return resolved;
}

function resolveLocalModulePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} path is required.`);
  }

  const expanded = expandHome(trimmed);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  if (isProtocolSpecifier(expanded)) {
    throw new Error(`${label} must be a local JavaScript file path, not a URL or protocol specifier.`);
  }
  if (!expanded.startsWith(".")) {
    throw new Error(`${label} must be an explicit local JavaScript path. Package specifiers are not loaded from configuration.`);
  }

  const resolved = path.resolve(CONFIGDIR, expanded);
  if (!isPathInside(resolved, CONFIGDIR)) {
    throw new Error(`${label} relative paths must stay inside the CCR config directory.`);
  }
  return resolved;
}

function assertJavaScriptModulePath(resolved: string, label: string): void {
  const extension = path.extname(resolved).toLowerCase();
  if (![".cjs", ".js", ".mjs"].includes(extension)) {
    throw new Error(`${label} must resolve to a JavaScript module file.`);
  }
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function isProtocolSpecifier(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function isPathInside(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return relative === "" || (Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveConfiguredRouteDecision(
  request: MutableRequestLike,
  config: AppConfig,
  compiled: CompiledRouterConfig,
  customModel?: RouteModelRef
): ConfiguredRouteDecision {
  const requestedModel = readString(request.body.model);
  const explicitModel = normalizeRouteSelector(requestedModel);
  const builtInDecision = resolveBuiltInAgentRouteDecision(request, config, compiled.modelRegistry, compiled.fallback);
  const policies: Array<RoutePolicy<MutableRequestLike, ConfiguredRouteDecision>> = [
    {
      evaluate: () => customModel
        ? {
            fallback: compiled.fallback,
            model: customModel,
            reason: "custom-router",
            rewrites: [],
            source: "custom"
          }
        : undefined,
      id: "custom"
    },
    {
      evaluate: (context) => resolveBuiltInClaudeCodeSubagentRouteDecision(
        context,
        config,
        compiled.modelRegistry,
        compiled.fallback
      ),
      id: "subagent"
    },
    ...compiled.rules.map((rule): RoutePolicy<MutableRequestLike, ConfiguredRouteDecision> => ({
      evaluate: (context) => {
        const decision = resolveRouterRule(rule, context, compiled.fallback);
        return decision && builtInDecision
          ? mergeConfiguredRouteDecisions(builtInDecision, decision)
          : decision;
      },
      id: `rule:${rule.rule.id}`
    })),
    {
      evaluate: () => builtInDecision,
      id: "builtin"
    },
    {
      evaluate: () => ({
        fallback: compiled.fallback,
        model: compiled.modelRegistry.resolve(explicitModel),
        reason: "default",
        rewrites: [],
        source: "default"
      }),
      id: "default"
    }
  ];
  const match = new RoutePolicyEngine(policies).evaluate(request);
  return match?.decision ?? {
    fallback: compiled.fallback,
    model: compiled.modelRegistry.resolve(explicitModel),
    reason: "default",
    rewrites: [],
    source: "default"
  };
}

function mergeConfiguredRouteDecisions(
  base: ConfiguredRouteDecision,
  override: ConfiguredRouteDecision
): ConfiguredRouteDecision {
  const rewrites = [...base.rewrites, ...override.rewrites];
  return {
    fallback: override.fallback ?? base.fallback,
    model: override.model ?? base.model,
    reason: override.reason,
    source: override.source,
    rewrites
  };
}

function resolveBuiltInClaudeCodeSubagentRouteDecision(
  request: MutableRequestLike,
  config: AppConfig,
  modelRegistry: ModelRegistry,
  fallback: RouterFallbackConfig
): ConfiguredRouteDecision | undefined {
  if (!builtInAgentRouteMatches(request, config, "claude-code")) {
    return undefined;
  }
  const target = normalizeRouteSelector(request.builtInSubagentModel);
  const configuredTarget = modelRegistry.resolve(target);
  if (!target || isSubagentModelPlaceholder(target) || !configuredTarget) {
    return undefined;
  }
  return {
    fallback,
    model: configuredTarget,
    reason: "builtin:claude-code-subagent",
    rewrites: [{
      key: "request.body.model",
      operation: "set",
      value: configuredTarget.selector
    }],
    source: "subagent",
  };
}

function resolveBuiltInAgentRouteDecision(
  request: MutableRequestLike,
  config: AppConfig,
  modelRegistry: ModelRegistry,
  fallback: RouterFallbackConfig
): ConfiguredRouteDecision | undefined {
  for (const agent of builtInAgentRuleIds) {
    if (!builtInAgentRouteMatches(request, config, agent)) {
      continue;
    }
    const target = modelRegistry.resolve(resolveBuiltInAgentRouteTarget(request, config, agent));
    if (!target) {
      continue;
    }
    return {
      fallback,
      model: target,
      reason: `builtin:${agent}`,
      rewrites: [{
        key: "request.body.model",
        operation: "set",
        value: target.selector
      }],
      source: "builtin",
    };
  }
  return undefined;
}

const builtInAgentRuleIds: RouterBuiltInAgentRuleId[] = ["claude-code", "codex"];

function builtInAgentRouteMatches(
  request: MutableRequestLike,
  config: AppConfig,
  agent: RouterBuiltInAgentRuleId
): boolean {
  if (config.Router.builtInRules?.[agent]?.enabled === false) {
    return false;
  }
  if (!resolveBuiltInAgentProfile(request, config, agent)) {
    return false;
  }
  const userAgent = readRequestHeader(request.headers, "user-agent")?.toLowerCase() ?? "";
  return userAgent.includes(builtInAgentUserAgentNeedle(agent));
}

function resolveBuiltInAgentProfile(
  request: MutableRequestLike,
  config: AppConfig,
  agent: RouterBuiltInAgentRuleId
) {
  if (config.profile.enabled === false) {
    return undefined;
  }
  const authenticatedApiKeyId = readRequestHeader(request.headers, "x-auth-api-key-id")?.trim();
  if (!authenticatedApiKeyId) {
    return undefined;
  }
  return config.profile.profiles.find((profile) =>
    profile.enabled &&
    profile.agent === agent &&
    profileApiKeyId(profile.id || profile.name || profile.agent) === authenticatedApiKeyId
  );
}

function resolveBuiltInAgentRouteTarget(
  request: MutableRequestLike,
  config: AppConfig,
  agent: RouterBuiltInAgentRuleId
): string | undefined {
  return normalizeRouteSelector(resolveBuiltInAgentProfile(request, config, agent)?.model);
}

function profileApiKeyId(value: string): string {
  const profileId = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `profile:${profileId || "profile"}`;
}

function builtInAgentUserAgentNeedle(agent: RouterBuiltInAgentRuleId): string {
  return agent === "claude-code" ? "claude" : "codex";
}

const ccrSubagentModelOpenTag = "<CCR-SUBAGENT-MODEL>";
const ccrSubagentModelCloseTag = "</CCR-SUBAGENT-MODEL>";
const ccrSubagentModelTagExample = `${ccrSubagentModelOpenTag}Provider/model${ccrSubagentModelCloseTag}`;
const ccrSubagentModelPlaceholder = "provider/model";
const claudeCodeBillingSystemHeaderPrefix = "x-anthropic-billing-header";
const ccrSubagentToolModelInstruction =
  `CCR subagent routing is enabled. When calling this tool, the prompt parameter MUST start with ` +
  `${ccrSubagentModelTagExample} on its own first line, replacing Provider/model with the best configured CCR gateway model. ` +
  `CCR consumes the tag, removes it from the prompt, and routes the spawned agent request to that model. ` +
  `Do not omit the tag, do not put it in description or subagent_type, and do not rely on the tool model enum for CCR-specific models. ` +
  `中文要求：调用该工具时，prompt 参数第一行必须写入 ${ccrSubagentModelTagExample}，并将 Provider/model 替换成最适合的 CCR 模型。`;
const ccrWorkflowSubagentModelInstruction =
  `CCR workflow subagent routing is enabled. When this workflow creates Agent/Task subagents, each spawned agent prompt MUST start with ` +
  `${ccrSubagentModelTagExample} on its own first line, replacing Provider/model with the best configured CCR gateway model. ` +
  `Put the tag inside the Agent/Task prompt created by the workflow, not in the workflow description or subagent_type. ` +
  `CCR consumes the tag from the spawned agent request, removes it, and routes that request to the selected model. ` +
  `Do not rely on the Agent/Task model enum for CCR-specific models. ` +
  `中文要求：Workflow 中创建 Agent/Task 时，每个被创建 agent 的 prompt 第一行必须写入 ${ccrSubagentModelTagExample}，并替换成最适合的 CCR 模型。`;
const ccrSubagentPromptFieldInstruction =
  `CCR subagent routing is enabled. This prompt string MUST start with ${ccrSubagentModelTagExample} on its own first line, ` +
  `with Provider/model replaced by one configured CCR gateway model. Put the subagent task after that line; CCR removes the tag before the subagent runs. ` +
  `中文要求：这个 prompt 字符串第一行必须是替换后的模型标签，后面再写 subagent 任务正文。`;
type ClaudeCodeSubagentToolKind = "subagent" | "workflow";
const claudeCodeAgentToolNames = new Set(["agent", "task"]);
const claudeCodeWorkflowToolNames = new Set(["workflow"]);
const ccrToolHubSystemInstructionMarker = "CCR ToolHub tool resolution is enabled.";

function claudeCodeToolName(tool: Record<string, unknown>): string | undefined {
  const functionSpec = isRecord(tool.function) ? tool.function : undefined;
  return readString(tool.name) ?? readString(functionSpec?.name);
}

function normalizeClaudeCodeToolName(toolName: string | undefined): string {
  return toolName?.toLowerCase().replace(/[-._]/g, "") ?? "";
}

function injectClaudeCodeToolHubInstructions(body: Record<string, unknown>, config: AppConfig): void {
  if (!config.toolHub?.enabled || !Array.isArray(body.tools)) {
    return;
  }
  const toolNames = claudeCodeToolHubToolNames(body.tools);
  if (!toolNames.resolve) {
    return;
  }
  const invokeName = toolNames.invoke ?? "tool_hub.invoke";
  appendSystemInstruction(body, [
    ccrToolHubSystemInstructionMarker,
    `The ToolHub search/resolution tool is ${toolNames.resolve}; call this actual tool, do not merely mention its name in text.`,
    `You MUST call the ToolHub search/resolution tool ${toolNames.resolve} before answering any request that asks about external services, installed MCP capabilities, business APIs, orders, coupons, stores, accounts, available tools, or capabilities that are not already obvious from the eager tools.`,
    `Do this even if the user did not mention ToolHub or ${toolNames.resolve}. Only skip the ToolHub search/resolution tool when the request is clearly local code/file/shell work or simple conversation that does not need an external or MCP capability.`,
    `If ${toolNames.resolve} returns selected tools, call the ToolHub invocation tool ${invokeName} to run the selected tool instead of telling the user that no such capability is available.`,
    "When the ToolHub resolve result includes executionPlanJs or workflowSketch, treat that JavaScript as the invocation dependency plan: await means serial order, and only callTool calls grouped inside the same Promise.all may be issued in parallel.",
    "Use the user's request as the task and include concise context when resolving. Do not ask the user to name the MCP tool unless the task is genuinely ambiguous after resolution."
  ].join("\n"));
}

function claudeCodeToolHubToolNames(tools: unknown[]): { invoke?: string; resolve?: string } {
  const names: { invoke?: string; resolve?: string } = {};
  for (const tool of tools) {
    if (!isRecord(tool)) {
      continue;
    }
    const name = claudeCodeToolName(tool);
    const normalized = normalizeClaudeCodeToolName(name);
    if (normalized.endsWith("toolhubresolve") && shouldUseClaudeCodeToolHubName(names.resolve, name)) {
      names.resolve = name;
    }
    if (normalized.endsWith("toolhubinvoke") && shouldUseClaudeCodeToolHubName(names.invoke, name)) {
      names.invoke = name;
    }
  }
  return names;
}

function shouldUseClaudeCodeToolHubName(current: string | undefined, candidate: string | undefined): boolean {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }
  return claudeCodeToolHubNameScore(candidate) > claudeCodeToolHubNameScore(current);
}

function claudeCodeToolHubNameScore(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.startsWith("mcp__ccr-toolhub__") || normalized.startsWith("mcp__ccr_toolhub__")) {
    return 3;
  }
  if (normalized.startsWith("mcp__") && normalized.includes("toolhub")) {
    return 2;
  }
  if (normalized.startsWith("mcp__")) {
    return 1;
  }
  return 0;
}

function appendSystemInstruction(body: Record<string, unknown>, instruction: string): void {
  if (systemContainsInstruction(body.system, ccrToolHubSystemInstructionMarker)) {
    return;
  }
  if (typeof body.system === "string") {
    body.system = body.system.trim() ? `${body.system}\n\n${instruction}` : instruction;
    return;
  }
  if (Array.isArray(body.system)) {
    body.system.push({ text: instruction, type: "text" });
    return;
  }
  if (body.system === undefined) {
    body.system = [{ text: instruction, type: "text" }];
  }
}

function systemContainsInstruction(system: unknown, marker: string): boolean {
  if (typeof system === "string") {
    return system.includes(marker);
  }
  if (!Array.isArray(system)) {
    return false;
  }
  return system.some((block) => typeof block === "string"
    ? block.includes(marker)
    : isRecord(block) && typeof block.text === "string" && block.text.includes(marker));
}

function injectClaudeCodeAgentToolDescription(body: Record<string, unknown>, config: AppConfig): void {
  if (!Array.isArray(body.tools)) {
    return;
  }

  const instructions = claudeCodeAgentToolInstructions(config);
  if (!instructions) {
    return;
  }
  for (const tool of body.tools) {
    if (!isRecord(tool)) {
      continue;
    }
    const toolKind = claudeCodeSubagentToolKind(tool);
    if (!toolKind) {
      continue;
    }
    appendToolDescriptionInstruction(tool, toolKind === "workflow" ? instructions.workflow : instructions.tool);
    if (toolKind === "subagent") {
      appendPromptSchemaDescriptionInstruction(tool, instructions.prompt);
    }
  }
}

function claudeCodeSubagentToolKind(tool: Record<string, unknown>): ClaudeCodeSubagentToolKind | undefined {
  const functionSpec = isRecord(tool.function) ? tool.function : undefined;
  const name = readString(tool.name)?.toLowerCase() ?? readString(functionSpec?.name)?.toLowerCase();
  if (!name) {
    return undefined;
  }
  if (claudeCodeAgentToolNames.has(name)) {
    return "subagent";
  }
  if (claudeCodeWorkflowToolNames.has(name)) {
    return "workflow";
  }
  return undefined;
}

function appendToolDescriptionInstruction(tool: Record<string, unknown>, instruction: string): void {
  if (isRecord(tool.function)) {
    tool.function.description = appendDescriptionInstruction(readOptionalString(tool.function.description), instruction);
    return;
  }
  tool.description = appendDescriptionInstruction(readOptionalString(tool.description), instruction);
}

function appendPromptSchemaDescriptionInstruction(tool: Record<string, unknown>, instruction: string): void {
  const functionSpec = isRecord(tool.function) ? tool.function : undefined;
  const schema = isRecord(tool.input_schema)
    ? tool.input_schema
    : isRecord(tool.inputSchema)
      ? tool.inputSchema
      : isRecord(functionSpec?.parameters)
        ? functionSpec.parameters
        : undefined;
  const properties = isRecord(schema?.properties) ? schema.properties : undefined;
  const prompt = isRecord(properties?.prompt) ? properties.prompt : undefined;
  if (!prompt) {
    return;
  }
  prompt.description = appendDescriptionInstruction(readOptionalString(prompt.description), instruction);
}

function appendDescriptionInstruction(description: string | undefined, instruction: string): string {
  const existing = description?.trim() ?? "";
  if (existing.includes(ccrSubagentModelOpenTag)) {
    return existing;
  }
  return existing ? `${existing}\n\n${instruction}` : instruction;
}

function claudeCodeAgentToolInstructions(config: AppConfig): { prompt: string; tool: string; workflow: string } | undefined {
  const modelRows = configuredSubagentModelDescriptionRows(config);
  if (modelRows.length === 0) {
    return undefined;
  }
  const modelList = [
    "Configured CCR gateway models:",
    ...modelRows
  ].join("\n");
  return {
    prompt: [
      ccrSubagentPromptFieldInstruction,
      "",
      modelList
    ].join("\n"),
    tool: [
      ccrSubagentToolModelInstruction,
      "",
      modelList
    ].join("\n"),
    workflow: [
      ccrWorkflowSubagentModelInstruction,
      "",
      modelList
    ].join("\n")
  };
}

function configuredSubagentModelDescriptionRows(config: AppConfig): string[] {
  const candidates: Array<{ key: string; row: string; selector: string }> = [];
  for (const provider of config.Providers) {
    const providerName = provider.name?.trim();
    if (!providerName || !Array.isArray(provider.models)) {
      continue;
    }
    for (const rawModel of provider.models) {
      const model = rawModel.trim();
      const description = provider.modelDescriptions?.[model]?.trim();
      if (!model || !description) {
        continue;
      }
      const selector = `${providerName}/${model}`;
      const key = selector.toLowerCase();
      const displayName = provider.modelDisplayNames?.[model]?.trim();
      const label = displayName && displayName !== model ? `${selector} (${displayName})` : selector;
      candidates.push({
        key,
        row: `- ${label}: ${singleLineText(description, 320)}`,
        selector
      });
    }
  }
  candidates.sort(compareSubagentModelDescriptionRows);

  const rows: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) {
      continue;
    }
    seen.add(candidate.key);
    rows.push(candidate.row);
  }
  return rows;
}

function compareSubagentModelDescriptionRows(
  left: { key: string; row: string; selector: string },
  right: { key: string; row: string; selector: string }
): number {
  return compareCodeUnitStrings(left.key, right.key) ||
    compareCodeUnitStrings(left.selector, right.selector) ||
    compareCodeUnitStrings(left.row, right.row);
}

function compareCodeUnitStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function removeClaudeCodeBillingSystemHeader(body: Record<string, unknown>): void {
  const system = body.system;
  if (!Array.isArray(system) || system.length === 0) {
    return;
  }
  const firstBlock = system[0];
  const firstText = typeof firstBlock === "string"
    ? firstBlock
    : isRecord(firstBlock) && firstBlock.type === "text" && typeof firstBlock.text === "string"
      ? firstBlock.text
      : undefined;
  if (!firstText?.startsWith(claudeCodeBillingSystemHeaderPrefix)) {
    return;
  }
  system.shift();
  if (system.length === 0) {
    delete body.system;
  }
}

function extractAndRemoveClaudeCodeSubagentModelTag(body: Record<string, unknown>): string | undefined {
  const systemModel = extractAndRemoveSystemSubagentModelTag(body);
  if (systemModel) {
    return systemModel;
  }
  return extractAndRemoveMessageSubagentModelTag(body);
}

function extractAndRemoveSystemSubagentModelTag(body: Record<string, unknown>): string | undefined {
  const system = body.system;
  if (typeof system === "string") {
    return extractAndRemoveSubagentModelTagFromText(system, (text) => {
      body.system = text;
    });
  }
  if (!Array.isArray(system)) {
    return undefined;
  }
  for (let index = 0; index < system.length; index += 1) {
    const block = system[index];
    const model = extractAndRemoveSubagentModelTagFromContentBlock(block, (text) => {
      if (typeof block === "string") {
        system[index] = text;
      } else if (isRecord(block)) {
        block.text = text;
      }
    });
    if (model) {
      return model;
    }
  }
  return undefined;
}

function extractAndRemoveMessageSubagentModelTag(body: Record<string, unknown>): string | undefined {
  if (!Array.isArray(body.messages)) {
    return undefined;
  }
  const limit = Math.min(body.messages.length, 2);
  for (let index = 0; index < limit; index += 1) {
    const message = body.messages[index];
    if (!isRecord(message) || message.role !== "user") {
      continue;
    }
    const model = extractAndRemoveSubagentModelTagFromMessage(message);
    if (model) {
      return model;
    }
  }
  return undefined;
}

function extractAndRemoveSubagentModelTagFromMessage(message: Record<string, unknown>): string | undefined {
  if (typeof message.content === "string") {
    return extractAndRemoveSubagentModelTagFromText(message.content, (text) => {
      message.content = text;
    });
  }
  if (!Array.isArray(message.content)) {
    return undefined;
  }
  const content = message.content;
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    const model = extractAndRemoveSubagentModelTagFromContentBlock(block, (text) => {
      if (typeof block === "string") {
        content[index] = text;
      } else if (isRecord(block)) {
        block.text = text;
      }
    });
    if (model) {
      return model;
    }
  }
  return undefined;
}

function extractAndRemoveSubagentModelTagFromContentBlock(
  block: unknown,
  replace: (text: string) => void
): string | undefined {
  if (typeof block === "string") {
    return extractAndRemoveSubagentModelTagFromText(block, replace);
  }
  if (!isRecord(block) || typeof block.text !== "string") {
    return undefined;
  }
  return extractAndRemoveSubagentModelTagFromText(block.text, replace);
}

function extractAndRemoveSubagentModelTagFromText(
  text: string,
  replace: (text: string) => void
): string | undefined {
  const openIndex = text.indexOf(ccrSubagentModelOpenTag);
  if (openIndex < 0) {
    return undefined;
  }
  const modelStart = openIndex + ccrSubagentModelOpenTag.length;
  const closeIndex = text.indexOf(ccrSubagentModelCloseTag, modelStart);
  if (closeIndex < 0) {
    return undefined;
  }
  const model = normalizeRouteSelector(text.slice(modelStart, closeIndex));
  if (!model) {
    return undefined;
  }
  const nextText = `${text.slice(0, openIndex)}${text.slice(closeIndex + ccrSubagentModelCloseTag.length)}`;
  replace(nextText);
  return model;
}

function resolveRouterRule(
  compiledRule: CompiledRouterRule,
  request: MutableRequestLike,
  defaultFallback: RouterFallbackConfig
): ConfiguredRouteDecision | undefined {
  if (!compiledRule.active) {
    return undefined;
  }
  const rule = compiledRule.rule;
  const fallback = rule.fallback ?? defaultFallback;

  const rewrites = compiledRule.rewrites;

  if (rule.type === "condition") {
    return rule.condition && routerRuleConditionMatches(rule.condition, request)
      ? routerRuleRewriteDecision(rule, rewrites, fallback, compiledRule.model)
      : undefined;
  }

  if (rule.type === "model-prefix") {
    const pattern = readString(rule.pattern);
    const requestedModel = readString(request.body.model);
    return pattern && requestedModel?.startsWith(pattern)
      ? routerRuleRewriteDecision(rule, rewrites, fallback, compiledRule.model)
      : undefined;
  }

  return undefined;
}

function routerRuleRewriteDecision(
  rule: RouterRule,
  rewrites: RouterRuleRewrite[],
  fallback: RouterFallbackConfig,
  model: RouteModelRef | undefined
): ConfiguredRouteDecision {
  return {
    fallback,
    model,
    reason: routerRuleReason(rule),
    rewrites,
    source: "rule"
  };
}

function applyRouterRewrite(rewrite: RouterRuleRewrite, request: MutableRequestLike): void {
  const parts = rewrite.key
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const [scope, section, ...rest] = parts;
  if (scope !== "request") {
    return;
  }

  if (section === "header" || section === "headers") {
    const name = rest.join(".").trim().toLowerCase();
    if (!name) {
      return;
    }
    if ((rewrite.operation ?? "set") === "delete") {
      delete request.headers[name];
    } else if (rewrite.value !== undefined) {
      request.headers[name] = rewrite.value;
    }
    return;
  }

  if (section === "body") {
    applyBodyRewrite(request.body, rest, rewrite);
  }
}

function applyBodyRewrite(body: Record<string, unknown>, path: string[], rewrite: RouterRuleRewrite): void {
  const operation = rewrite.operation ?? "set";
  if (operation === "delete") {
    deletePathValue(body, path);
    return;
  }

  const value = rewrite.key === "request.body.model" && rewrite.value !== undefined
    ? normalizeRouteSelector(rewrite.value) ?? rewrite.value
    : rewrite.value !== undefined
      ? parseRewriteLiteral(rewrite.value)
      : undefined;

  if (operation === "set") {
    setPathValue(body, path, value);
    return;
  }

  const current = readPathValue(body, path);
  const array = Array.isArray(current) ? [...current] : [];
  if (operation === "array-append") {
    array.push(value);
    setPathValue(body, path, array);
    return;
  }
  if (operation === "array-prepend") {
    array.unshift(value);
    setPathValue(body, path, array);
    return;
  }
  if (operation === "array-remove") {
    setPathValue(body, path, array.filter((item) => !arrayElementMatches(item, value)));
    return;
  }
  if (operation === "array-replace" && rewrite.match !== undefined) {
    const match = parseRewriteLiteral(rewrite.match);
    setPathValue(body, path, array.map((item) => arrayElementMatches(item, match) ? value : item));
  }
}

function setPathValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    return;
  }

  let current: unknown = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextKey = path[index + 1];
    if (Array.isArray(current)) {
      const arrayIndex = Number(key);
      if (!Number.isInteger(arrayIndex)) {
        return;
      }
      if (!isRecord(current[arrayIndex]) && !Array.isArray(current[arrayIndex])) {
        current[arrayIndex] = numericPathSegment(nextKey) ? [] : {};
      }
      current = current[arrayIndex];
      continue;
    }
    if (!isRecord(current)) {
      return;
    }
    if (!isRecord(current[key]) && !Array.isArray(current[key])) {
      current[key] = numericPathSegment(nextKey) ? [] : {};
    }
    current = current[key];
  }

  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    const arrayIndex = Number(lastKey);
    if (Number.isInteger(arrayIndex)) {
      current[arrayIndex] = value;
    }
    return;
  }
  if (isRecord(current)) {
    current[lastKey] = value;
  }
}

function deletePathValue(target: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) {
    return;
  }
  const parent = readPathValue(target, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      parent.splice(index, 1);
    }
    return;
  }
  if (isRecord(parent)) {
    delete parent[key];
  }
}

function numericPathSegment(value: string): boolean {
  return /^\d+$/.test(value);
}

function parseRewriteLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const json = parseJsonLiteral(trimmed);
  if (json.ok) return json.value;
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const parsedNumber = Number(trimmed);
  return trimmed && Number.isFinite(parsedNumber) ? parsedNumber : trimmed;
}

function routerRuleConditionMatches(condition: RouterRuleCondition, request: MutableRequestLike): boolean {
  if (condition.left.trim().startsWith("response.")) {
    return false;
  }
  const actual = resolveRouterConditionValue(condition.left, request);
  const expected = parseConditionLiteral(condition.right);

  if (condition.operator === "starts-with") {
    const actualText = conditionComparableText(actual);
    const expectedText = conditionComparableText(expected);
    return actualText !== undefined && expectedText !== undefined && actualText.startsWith(expectedText);
  }

  if (condition.operator === "contains" || condition.operator === "not-contains" || condition.operator === "contains-deep") {
    const matched = condition.operator === "contains-deep"
      ? valueContainsDeep(actual, expected)
      : valueContains(actual, expected);
    return condition.operator === "not-contains" ? !matched : matched;
  }

  if (condition.operator === "==" || condition.operator === "!=") {
    const matched = valuesEqual(actual, expected);
    return condition.operator === "==" ? matched : !matched;
  }

  const actualNumber = numberValue(actual);
  const expectedNumber = numberValue(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    if (condition.operator === ">") return actualNumber > expectedNumber;
    if (condition.operator === ">=") return actualNumber >= expectedNumber;
    if (condition.operator === "<") return actualNumber < expectedNumber;
    if (condition.operator === "<=") return actualNumber <= expectedNumber;
  }

  const actualText = conditionComparableText(actual);
  const expectedText = conditionComparableText(expected);
  if (actualText === undefined || expectedText === undefined) {
    return false;
  }
  if (condition.operator === ">") return actualText > expectedText;
  if (condition.operator === ">=") return actualText >= expectedText;
  if (condition.operator === "<") return actualText < expectedText;
  if (condition.operator === "<=") return actualText <= expectedText;
  return false;
}

function resolveRouterConditionValue(path: string, request: MutableRequestLike): unknown {
  const parts = path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  const [scope, section, ...rest] = parts;
  if (scope === "response") {
    return undefined;
  }
  if (scope !== "request") {
    return undefined;
  }

  if (section === "header" || section === "headers") {
    return readRequestHeader(request.headers, rest.join("."));
  }
  if (section === "body") {
    return readPathValue(request.body, rest);
  }
  if (section === "method") {
    return request.method;
  }
  if (section === "url") {
    return request.url;
  }
  if (section === "tokenCount" || section === "token_count") {
    return request.tokenCount;
  }
  if (section === "sessionId" || section === "session_id") {
    return request.sessionId;
  }

  return readPathValue(request.body, [section, ...rest].filter(Boolean));
}

function readRequestHeader(headers: Record<string, HeaderValue>, name: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const direct = readHeader(headers[normalized]);
  if (direct !== undefined) {
    return direct;
  }
  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === normalized);
  return matchedKey ? readHeader(headers[matchedKey]) : undefined;
}

function readPathValue(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    return isRecord(current) ? current[part] : undefined;
  }, value);
}

function parseConditionLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return undefined;
  const json = parseJsonLiteral(trimmed);
  if (json.ok) return json.value;
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const parsedNumber = Number(trimmed);
  return trimmed && Number.isFinite(parsedNumber) ? parsedNumber : trimmed;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true;
  }
  const actualNumber = numberValue(actual);
  const expectedNumber = numberValue(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    return actualNumber === expectedNumber;
  }
  return conditionComparableText(actual) === conditionComparableText(expected);
}

function valueContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => arrayElementMatches(item, expected));
  }
  if (typeof actual === "string") {
    const expectedText = conditionComparableText(expected);
    return expectedText !== undefined && actual.includes(expectedText);
  }
  return false;
}

function valueContainsDeep(actual: unknown, expected: unknown): boolean {
  if (valueContains(actual, expected) || valuesEqual(actual, expected)) {
    return true;
  }
  if (Array.isArray(actual)) {
    return actual.some((item) => valueContainsDeep(item, expected));
  }
  if (isRecord(actual)) {
    return Object.values(actual).some((item) => valueContainsDeep(item, expected));
  }
  const actualText = conditionComparableText(actual);
  const expectedText = conditionComparableText(expected);
  return actualText !== undefined && expectedText !== undefined && actualText.includes(expectedText);
}

function arrayElementMatches(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected) && isRecord(actual)) {
    return Object.entries(expected).every(([key, expectedValue]) => arrayElementMatches(actual[key], expectedValue));
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((item, index) => arrayElementMatches(actual[index], item));
  }
  return valuesEqual(actual, expected);
}

function parseJsonLiteral(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value || (!value.startsWith("{") && !value.startsWith("["))) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function conditionComparableText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.map((item) => conditionComparableText(item)).filter((item): item is string => item !== undefined).join(",");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function singleLineText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function routerRuleReason(rule: RouterRule): string {
  if (rule.id.startsWith("legacy-")) {
    return rule.id.replace(/^legacy-/, "");
  }
  return `rule:${rule.id}`;
}

function isSubagentModelPlaceholder(model: string): boolean {
  return model.trim().toLowerCase() === ccrSubagentModelPlaceholder;
}

function calculateTokenCount(messages: unknown, system: unknown, tools: unknown): number {
  return countMessageTokens(messages) + countSystemTokens(system) + countToolTokens(tools);
}

function countMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((total, message) => total + countUnknownTokens(message), 0);
}

function countSystemTokens(system: unknown): number {
  return countUnknownTokens(system);
}

function countToolTokens(tools: unknown): number {
  if (!Array.isArray(tools)) {
    return 0;
  }
  return tools.reduce((total, tool) => total + countUnknownTokens(tool), 0);
}

function countUnknownTokens(value: unknown): number {
  if (typeof value === "string") {
    return estimateTextTokens(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countUnknownTokens(item), 0);
  }

  if (!isRecord(value)) {
    return 0;
  }

  let total = 0;
  for (const [key, item] of Object.entries(value)) {
    total += estimateTextTokens(key);
    total += countUnknownTokens(item);
  }
  return total;
}

function estimateTextTokens(text: string): number {
  const asciiWords = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return Math.max(1, Math.ceil((asciiWords + cjkChars) * 1.15));
}

function resolveSessionId(body: Record<string, unknown>, headers: Record<string, HeaderValue>): string | undefined {
  const fromHeader = readHeader(headers["x-claude-code-session-id"]) || readHeader(headers["x-claude-session-id"]);
  if (fromHeader) {
    return fromHeader;
  }

  const metadata = body.metadata;
  if (isRecord(metadata) && typeof metadata.user_id === "string") {
    const parts = metadata.user_id.split("_session_");
    if (parts.length > 1) {
      return parts.at(-1);
    }
  }

  return undefined;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDefaultFunction(value: unknown): ((...args: unknown[]) => unknown) | undefined {
  if (isRecord(value) && typeof value.default === "function") {
    return value.default as (...args: unknown[]) => unknown;
  }
  return undefined;
}

function readHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
