---
name: deepseek-v4-reasoning-content
status: draft
created: 2026-05-06
---

# DeepSeek V4 Thinking Mode: Preserve and Re-inject reasoning_content

## Problem

DeepSeek V4 Pro/Flash in thinking mode requires every assistant message to carry `reasoning_content` once any tool call has occurred in the conversation. Per DeepSeek docs:

- **No tool call** → `reasoning_content` is optional (ignored if passed)
- **Tool call happened** → `reasoning_content` must be the **actual reasoning from the previous response**, passed back verbatim in ALL subsequent turns

Claude Code strips thinking blocks from conversation history. Multi-turn requests with tools fail with:

```
400: "The `reasoning_content` in the thinking mode must be passed back to the API."
```

This makes DeepSeek V4 completely unusable with Claude Code for any workflow involving tools (i.e. essentially always).

GitHub issue: musistudio/claude-code-router#1378

## Root Cause

Claude Code receives the `reasoning_content` (converted to `thinking` blocks by the router) in the response stream but does not include it in subsequent requests. The `deepseek` transformer has no mechanism to preserve and re-inject the actual reasoning content — it only clamps `max_tokens`.

The transformer pipeline does execute on this code path (bypass is `false` since `"deepseek" !== "Anthropic"`), so a fix in the `deepseek` transformer will actually run.

## Proposed Fix

**Cache reasoning content from responses, keyed by tool_call_id, and re-inject it on subsequent requests.**

### Architecture

```
Turn 1 (response):
  DeepSeek → {reasoning_content: "I need to...", tool_calls: [{id: "call_abc"}]}
  deepseek.transformResponseOut → cache["call_abc"] = "I need to..."
  (also converts reasoning_content → thinking format for Claude Code)

Turn 2 (request):
  Claude Code → {messages: [..., {role: "assistant", tool_calls: [{id: "call_abc"}]}]}
  AnthropicTransformer.transformRequestOut → unified format
  deepseek.transformRequestIn → lookup cache["call_abc"] → inject reasoning_content: "I need to..."
  DeepSeek receives the full reasoning chain back ✓
```

### Changes

**File: `packages/core/src/transformer/deepseek.transformer.ts`**

1. **Add an LRU cache** to the `DeepseekTransformer` class (reuse existing `LRUCache` from `packages/core/src/utils/cache.ts`):
   ```
   Map<tool_call_id, reasoning_content>
   ```
   Capacity ~200 entries (covers long multi-tool sessions). LRU eviction handles cleanup naturally.

2. **In `transformResponseOut` (streaming path)**: The stream already accumulates `reasoningContent` in a closure variable. Add:
   - Also accumulate tool call IDs from `data.choices[0].delta.tool_calls[].id`
   - At stream end (when reader finishes), store `tool_call_id → reasoningContent` for each tool call ID
   - If reasoning finished with no tool calls, no caching needed (content is optional per DeepSeek docs)

3. **In `transformResponseOut` (non-streaming path)**: Extract `reasoning_content` and `tool_calls[].id` from the JSON response, cache them.

4. **In `transformRequestIn`**: For every assistant message with `tool_calls`, look up the cached `reasoning_content` by the first `tool_call.id`. If found, set `msg.reasoning_content = cached_content`. If not found (cache miss), fall back to empty string `""`.

### Pseudocode

```typescript
import { LRUCache } from "@/utils/cache";

class DeepseekTransformer implements Transformer {
  name = "deepseek";
  private reasoningCache = new LRUCache<string, string>(200);

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192;
    }
    if (Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        if (msg.role === 'assistant' && (msg as any).reasoning_content == null) {
          const toolCallId = msg.tool_calls?.[0]?.id;
          const cached = toolCallId ? this.reasoningCache.get(toolCallId) : undefined;
          (msg as any).reasoning_content = cached ?? '';
        }
      }
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // Streaming path:
    //   - accumulate reasoningContent (existing)
    //   - accumulate toolCallIds (new)
    //   - at stream end: for each toolCallId, cache reasoningContent (new)
    // Non-streaming path:
    //   - extract reasoning_content + tool_calls[].id from JSON (new)
    //   - cache them (new)
  }
}
```

### Why tool_call_id as cache key

- Tool call IDs are unique per response and preserved end-to-end (DeepSeek → router → Claude Code → back to router)
- The same ID appears in the response's `tool_calls[].id` and the subsequent request's `assistant.tool_calls[].id`
- LRU eviction naturally handles cleanup without TTL complexity

### Fallback behavior

If a cache miss occurs (server restarted between turns, or cache evicted), inject `reasoning_content: ""`. This avoids the 400 error but the model loses its reasoning chain for that turn. Acceptable as a degraded mode — the model will generate new reasoning.

## Scope

### In Scope
- Cache and re-inject actual `reasoning_content` in the `deepseek` transformer
- Handle both streaming and non-streaming response paths

### Out of Scope
- Anthropic-format DeepSeek endpoint (`https://api.deepseek.com/anthropic/v1/messages`) — bypass mode where no transformers run; separate approach needed
- Changes to bypass logic or transformer pipeline architecture
- Custom transformer plugin loading issues (separate concern raised in the issue)

## Testing

1. Configure DeepSeek V4 Pro with the `deepseek` transformer
2. Send a multi-turn tool-use request via curl (from the issue)
3. Verify: no 400 error, reasoning_content is preserved across turns
4. Verify: server restart between turns gracefully falls back to empty string
5. Verify: non-tool-call turns work without injection

## Risk

Low-medium. The change is isolated to the `deepseek` transformer. The LRU cache adds a small memory footprint (~200 entries of reasoning strings). Cache misses degrade gracefully to empty string. No impact on non-DeepSeek providers.
