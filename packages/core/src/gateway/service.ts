/**
 * Public gateway facade.
 *
 * Runtime orchestration and protocol features live in focused modules; this file keeps
 * the historical import surface stable for Electron, CLI, web management, and tests.
 */
export { gatewayService } from "@ccr/core/gateway/application/gateway-service";
export { prepareCodexApplyPatchBridgeRequest, transformCodexApplyPatchBridgeRequestBody, transformCodexApplyPatchBridgeResponseValue, transformCodexApplyPatchBridgeSseEvent } from "@ccr/core/gateway/features/codex-patch-bridge";
export { normalizeClaudeCodeOauthProviderPlugins, normalizeCoreGatewayVirtualModelProfiles } from "@ccr/core/gateway/core-runtime/config-compiler";
export { fusionBuiltinToolArtifactsForTest, fusionFallbackToolDefinitions, fusionToolNamesBackedByMcpServers } from "@ccr/core/mcp/fusion-config";
export type { BrowserAutomationMcpIntegration, BrowserWebSearchMcpIntegration, BrowserWebSearchMcpRegistration, BrowserWebSearchProtocolRecord, BrowserWebSearchProtocolResult } from "@ccr/core/gateway/internal/shared";
export { prepareGatewayUpstreamAttemptForTest } from "@ccr/core/gateway/upstream/executor";
export { fallbackRetryDelayAfterNetworkErrorForTest, fallbackRetryDelayAfterStatusForTest } from "@ccr/core/gateway/upstream/retry-policy";
export { shouldApplyGatewayRouting } from "@ccr/core/routing/protocol-endpoints";
export { extractHostedWebSearchQueryHint, fusionWebSearchToolNameForRequest, hostedWebSearchProtocolResponseStream, prepareAnthropicWebSearchProtocolRequestBody, prepareClaudeCodeWebSearchContinuationRequestBody, prepareHostedWebSearchProtocolRequestBody, selectHostedWebSearchProtocolRecords, transformAnthropicWebSearchProtocolResponseValue, transformAnthropicWebSearchProtocolSseText, transformGeminiHostedWebSearchResponseValue, transformGeminiHostedWebSearchSseText, transformOpenAiChatHostedWebSearchResponseValue, transformOpenAiChatHostedWebSearchSseText, transformOpenAiResponsesHostedWebSearchResponseValue, transformOpenAiResponsesHostedWebSearchSseText } from "@ccr/core/gateway/features/hosted-web-search/index";
