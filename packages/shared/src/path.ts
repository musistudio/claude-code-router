/**
 * Path-related utilities
 */

/**
 * Check if the given pathname is an LLM API endpoint
 * Supports both Anthropic (/v1/messages) and OpenAI (/chat/completions) style paths
 */
export function isLLMApiPath(pathname: string): boolean {
  return pathname.endsWith('/v1/messages') || pathname.endsWith('/chat/completions');
}
