/** Public facade for the Bailian enhanced-search web_search bridge. */
export { bailianEnhancedSearchEndpointEnv, defaultBailianEnhancedSearchMcpEndpoint, normalizeBailianEnhancedSearchQuery, searchBailianEnhancedWeb } from "@ccr/core/gateway/features/bailian-enhanced-search/mcp";
export {
  executeBailianEnhancedSearchSideQuery,
  prepareBailianEnhancedSearchSideQuery,
  isBailianEnhancedSearchSideQueryBody,
  stripClaudeCodeWebSearchQueryPrefix
} from "@ccr/core/gateway/features/bailian-enhanced-search/side-query";
export type { BailianEnhancedSearchSideQueryContext, BailianEnhancedSearchSideQueryResponse } from "@ccr/core/gateway/features/bailian-enhanced-search/side-query";
