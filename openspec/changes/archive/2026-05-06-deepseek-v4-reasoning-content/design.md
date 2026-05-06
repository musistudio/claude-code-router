## Context

The router's transformer pipeline processes requests in two directions:

1. **Request direction** (Claude Code → provider): `AnthropicTransformer.transformRequestOut` converts Anthropic format to OpenAI unified format, then provider transformers (e.g., `deepseek`) run `transformRequestIn`.
2. **Response direction** (provider → Claude Code): provider transformers run `transformResponseOut`, then `AnthropicTransformer.transformResponseIn` converts back to Anthropic SSE format.

The `deepseek` transformer (`packages/core/src/transformer/deepseek.transformer.ts`) currently only clamps `max_tokens` to 8192. Its `transformResponseOut` already processes the streaming response, accumulating `reasoning_content` from `delta.reasoning_content` chunks and converting them to `thinking` format. But the accumulated reasoning content is discarded after stream processing.

DeepSeek V4 thinking mode requires that when a tool call occurred, the assistant message's `reasoning_content` must be passed back verbatim in all subsequent turns. Claude Code strips thinking blocks from conversation history, so the router must preserve and re-inject this content.

The existing `LRUCache` in `packages/core/src/utils/cache.ts` provides a reusable cache with capacity-based eviction.

## Goals / Non-Goals

**Goals:**

- Preserve actual `reasoning_content` from DeepSeek V4 responses and re-inject it on subsequent requests where the same tool call IDs appear
- Handle both streaming and non-streaming response paths
- Degrade gracefully on cache miss (empty string fallback to avoid 400 errors)

**Non-Goals:**

- Supporting DeepSeek's Anthropic-compatible endpoint (uses bypass mode, no transformers run)
- Modifying the transformer pipeline or bypass logic
- Fixing custom transformer plugin loading issues
- Persisting cache across server restarts (in-memory only is acceptable)

## Decisions

### D1: Use tool_call_id as cache key

Cache reasoning content keyed by the tool call ID from the response.

**Why:** Tool call IDs are the only stable identifier preserved end-to-end through the full cycle: DeepSeek response → router transforms → Claude Code stores → Claude Code next request → router transforms again. The same `id` that appears in `response.choices[0].delta.tool_calls[].id` will appear in the next request's `assistant.tool_calls[].id`.

**Alternatives considered:**
- *Session ID + message index*: Session IDs are available but message ordering can shift between requests (Claude Code may modify history). Unreliable.
- *Content hash of assistant message*: Fragile — Claude Code may modify text content, making the hash invalid.

### D2: LRU cache with 200-entry capacity

Use the existing `LRUCache` class from `packages/core/src/utils/cache.ts`.

**Why:** Simple, proven in the codebase, no external dependencies. 200 entries covers long multi-tool sessions (typical Claude Code sessions use 20-50 tool calls). LRU eviction handles cleanup naturally.

**Alternatives considered:**
- *TTL-based cache*: Adds complexity (timers, clock drift). Not needed — tool call IDs from stale sessions won't appear in new requests, so LRU eviction alone is sufficient.
- *Session-scoped cache*: Would require tracking session boundaries. Over-engineering for this use case.

### D3: Inject on all assistant messages, not just tool-call ones

In `transformRequestIn`, inject `reasoning_content` on every assistant message that lacks it, not only those with `tool_calls`.

**Why:** DeepSeek docs say `reasoning_content` is optional for non-tool-call turns and will be ignored if passed. Injecting on all messages simplifies the logic and avoids edge cases where the presence of `tool_calls` is ambiguous in the unified format.

### D4: Cache population in transformResponseOut stream end

Populate the cache at stream end (when `reader.read()` returns `done`), not incrementally during stream processing.

**Why:** The full `reasoning_content` is only available after all chunks are accumulated. Tool call IDs may appear at any point during the stream. Storing at stream end ensures both values are complete.

## Risks / Trade-offs

**[Cache miss on server restart]** → All reasoning content is lost. Fallback to empty string avoids 400 errors but the model loses its reasoning chain. Acceptable since server restarts are infrequent and the model will regenerate reasoning.

**[Memory growth from long reasoning chains]** → DeepSeek V4 reasoning can be lengthy (several KB per turn). LRU cap of 200 entries bounds total memory to ~200 * ~10KB = ~2MB. Acceptable.

**[Tool call ID collision across sessions]** → Different Claude Code sessions could theoretically produce the same tool call ID format. In practice, IDs are UUID-like (`call_abc123`) making collision negligible. Even if it occurs, the worst case is injecting wrong reasoning content, which DeepSeek will simply ignore (it's advisory, not validated).
