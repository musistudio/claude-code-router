/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { ApiKeyConfig, GatewayMcpServerConfig, GatewayProviderConfig, GatewayProviderProtocol, VirtualModelFusionWebSearchProvider } from "@ccr/core/contracts/app";
import type { ClaudeAppGatewayModelRouteOptions } from "@ccr/core/agents/claude-app/gateway-routes";
import type { RouteModelRef } from "@ccr/core/routing/contracts";
import { findModelCatalogEntry } from "@ccr/core/gateway/model-catalog";


export type CoreGatewayProvider = {
  apikey?: string;
  baseurl?: string;
  billing?: unknown;
  extraBody?: unknown;
  extraHeaders?: unknown;
  models: string[];
  name: string;
  type: GatewayProviderProtocol;
};


export const defaultFusionWebSearchProvider: VirtualModelFusionWebSearchProvider = "brave";

export const fusionModelProviderName = "Fusion";

export const claudeCodeOneMillionContextSuffix = "[1m]";

export const claudeAppGatewayModelRouteOptions: ClaudeAppGatewayModelRouteOptions = {
  displayName: (model) => findModelCatalogEntry(model)?.displayName,
  supportsOneMillionContext: (model) => Boolean(findModelCatalogEntry(model)?.limits?.supports1MContext)
};


export type ApiKeyAuthorizationResult =
  | { ok: true; apiKey?: ApiKeyConfig }
  | { ok: false };


export type ApiKeyLimitUsage = {
  imageCount: number;
  totalTokens: number;
};


export type ApiKeyLimitRule = {
  limit: number;
  metric: "images" | "requests" | "tokens";
  name: string;
  requested: number;
  windowMs: number;
};


export type GatewayStopOptions = {
  proxyRestoreTimeoutMs?: number;
};


export type HostedWebSearchProtocolContext = {
  maxUses?: number;
  protocol: GatewayProviderProtocol;
  queryHint?: string;
  records?: BrowserWebSearchProtocolRecord[];
  requestId: string;
  sinceMs: number;
  toolName: string;
};


export type AnthropicWebSearchProtocolContext = HostedWebSearchProtocolContext;


export type ClaudeCodeWebSearchContinuationContext = {
  queryHint?: string;
  sinceMs: number;
  toolName: string;
};


export type BrowserWebSearchMcpRegistration = {
  env?: Record<string, string>;
  name: string;
  resultCount?: number;
  timeoutMs?: number;
  toolName: string;
};


export type BrowserWebSearchProtocolResult = {
  content?: string;
  diagnostics?: string[];
  snippet?: string;
  title: string;
  url: string;
};


export type BrowserWebSearchProtocolRecord = {
  completedAtMs: number;
  engine: string;
  query: string;
  results: BrowserWebSearchProtocolResult[];
  searchUrl: string;
  toolName: string;
};


export type BrowserWebSearchMcpIntegration = {
  registerBrowserWebSearchMcpServer: (options: BrowserWebSearchMcpRegistration) => Promise<GatewayMcpServerConfig | undefined>;
  recentBrowserWebSearchResults?: (options: { sinceMs: number; toolName?: string }) => BrowserWebSearchProtocolRecord[];
  runBrowserWebSearch?: (options: { count?: number; prompt: string; timeoutMs?: number; toolName?: string }) => Promise<BrowserWebSearchProtocolRecord | undefined>;
  stopBrowserWebSearchMcpServers: () => Promise<void>;
};


export type BrowserAutomationMcpIntegration = {
  handleBrowserAutomationMcpRequest: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  stopBrowserAutomationMcpServer: () => Promise<void>;
};


export type CoreGatewayHealth = {
  runtimeId?: string;
  status?: string;
};


export type ManagedGatewayRuntimeMarker = {
  generatedConfigFile?: unknown;
  gatewayEntry?: unknown;
  pid?: unknown;
  runtimeId?: unknown;
  startedAt?: unknown;
};


export type ApiKeyWindowCounter = {
  expiresAt: number;
  value: number;
  windowStart: number;
};


export type RawTracePartText = {
  contentType?: string;
  text: string;
};


export type CursorOpenAICompatContext = {
  systemPrompt?: string;
  toolChoice?: unknown;
  tools: unknown[];
};


export type CursorOpenAICompatPreparation = {
  body?: Buffer;
  diagnostic: "fallback-injected" | "simplified-missing-context";
};


export type ClaudeCodeDiscoverableModel = {
  id: string;
  oneMillionContext: boolean;
};


export type UpstreamAttempt = {
  body?: Buffer;
  credentialChain?: string[];
  credentialIds?: string[];
  credentialProtocol?: GatewayProviderProtocol;
  headers?: Record<string, string>;
  index: number;
  logicalProvider?: string;
  model?: string;
  target?: RouteModelRef;
};


export type UpstreamFailedAttempt = {
  credentialChain?: string[];
  credentialIds?: string[];
  delayMs?: number;
  error?: string;
  model?: string;
  statusCode?: number;
};


export type UpstreamFetchResult = {
  attempt: UpstreamAttempt;
  failedAttempts: UpstreamFailedAttempt[];
  response: Response;
};


export type ProviderCredentialRoutingTarget = {
  body?: Buffer;
  model?: string;
  provider: GatewayProviderConfig;
  protocol: GatewayProviderProtocol;
  source: "header" | "model" | "plan";
};


export class UpstreamRequestError extends Error {
  readonly attempt?: UpstreamAttempt;
  readonly failedAttempts: UpstreamFailedAttempt[];

  constructor(message: string, options: { attempt?: UpstreamAttempt; cause?: unknown; failedAttempts: UpstreamFailedAttempt[] }) {
    super(message);
    this.name = "UpstreamRequestError";
    this.attempt = options.attempt;
    this.cause = options.cause;
    this.failedAttempts = options.failedAttempts;
  }
}


export const requireFromHere = createRequire(__filename);

export const claudeCodeOauthBetaHeader = "anthropic-beta";

export const claudeCodeOauthRequiredBeta = "oauth-2025-04-20";

export const coreGatewayAuthHeader = "x-ccr-core-auth";

export const coreGatewayAuthTokenEnv = "CCR_CORE_GATEWAY_AUTH_TOKEN";

export const clientClosedRequestStatusCode = 499;

export const clientDisconnectMessage = "Client connection closed before response completed.";

export function resolveStreamRequestLogOutcome(input: {
  clientDisconnected: boolean;
  detectedError?: string;
  streamError?: string;
  terminalEventSeen: boolean;
  upstreamStatus: number;
}): { error?: string; statusCode: number } {
  const interrupted = input.clientDisconnected && !input.terminalEventSeen;
  if (interrupted) {
    return {
      error: clientDisconnectMessage,
      statusCode: clientClosedRequestStatusCode
    };
  }
  return {
    error: input.clientDisconnected && input.terminalEventSeen
      ? input.detectedError
      : input.streamError ?? input.detectedError,
    statusCode: input.upstreamStatus
  };
}

export const localObservabilityHeaderNames = new Set([
  "x-ccr-claude-app-model-rewrite",
  "x-ccr-codex-patch-bridge",
  "x-ccr-claude-model-discovery",
  "x-ccr-cursor-openai-compat",
  "x-ccr-logical-provider",
  "x-ccr-provider-credential-chain",
  "x-ccr-provider-credential-saturated"
]);

export const proxyHeaderDenyList = new Set(["connection", coreGatewayAuthHeader, "host", "upgrade"]);

export const responseHeaderDenyList = new Set(["connection", "content-encoding", "transfer-encoding"]);

export const maxUsageCaptureBytes = 8 * 1024 * 1024;

export const apiKeyLimitCounterRetentionWindows = 2;

export const gatewayRuntimeMarkerFile = "gateway-runtime.json";

export const rawTraceSyncHeader = "x-ccr-raw-trace-token";

export const billingUsageSyncHeader = "x-ccr-billing-usage-token";

export const virtualApplyPatchToolName = "virtual_apply_patch";


export const rawTraceSyncPath = "/__ccr/raw-trace-sync";

export const billingUsageSyncPath = "/__ccr/billing-usage-sync";

export const gatewayEntryOverrideEnv = "CCR_GATEWAY_ENTRY";

export const gatewayPackageCandidates = ["@the-next-ai/ai-gateway", "gateway"];

export const codexPatchBridgeInstructionText = [
  "When modifying files, call virtual_apply_patch.",
  "Do not use exec_command or write_stdin to edit files, including shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar shell-based edits.",
  "Use exec_command only for reading files, listing/searching, running builds/tests, starting servers, and other commands that are not manual file edits."
].join(" ");

export const codexPatchBridgeShellToolGuidance = [
  "When virtual_apply_patch is available, do not use this tool to edit files.",
  "Do not write files with shell redirection, heredocs, cat >, tee, sed -i, perl -i, python, node scripts, or similar commands.",
  "Use virtual_apply_patch for manual file changes."
].join(" ");

export const virtualApplyPatchLarkGrammar = [
  "start: begin_patch hunk+ end_patch",
  "begin_patch: \"*** Begin Patch\" LF",
  "end_patch: \"*** End Patch\" LF?",
  "",
  "hunk: add_hunk | delete_hunk | update_hunk",
  "add_hunk: \"*** Add File: \" filename LF add_line+",
  "delete_hunk: \"*** Delete File: \" filename LF",
  "update_hunk: \"*** Update File: \" filename LF change_move? change?",
  "",
  "filename: /(.+)/",
  "add_line: \"+\" /(.*)/ LF -> line",
  "",
  "change_move: \"*** Move to: \" filename LF",
  "change: (change_context | change_line)+ eof_line?",
  "change_context: (\"@@\" | \"@@ \" /(.+)/) LF",
  "change_line: (\"+\" | \"-\" | \" \") /(.*)/ LF",
  "eof_line: \"*** End of File\" LF",
  "",
  "%import common.LF"
].join("\n");

export const gatewayProviderProtocolFallbackOrder: GatewayProviderProtocol[] = [
  "anthropic_messages",
  "openai_chat_completions",
  "openai_responses",
  "gemini_generate_content",
  "gemini_interactions"
];

export const privateDirMode = 0o700;

export const privateFileMode = 0o600;
