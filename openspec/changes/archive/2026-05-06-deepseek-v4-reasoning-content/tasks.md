## 1. Cache Infrastructure

- [x] 1.1 Add `LRUCache` import to `packages/core/src/transformer/deepseek.transformer.ts`
- [x] 1.2 Add `private reasoningCache = new LRU cache(200)` property to `DeepseekTransformer` class

## 2. Cache Population (Response Direction)

- [x] 2.1 In `transformResponseOut` streaming path: accumulate tool call IDs from `data.choices[0].delta.tool_calls[].id` alongside existing `reasoningContent` accumulation
- [x] 2.2 In `transformResponseOut` streaming path: at stream end, store `tool_call_id → reasoningContent` for each collected tool call ID in the cache
- [x] 2.3 In `transformResponseOut` non-streaming path: extract `reasoning_content` and `tool_calls[].id` from JSON response, store in cache

## 3. Cache Injection (Request Direction)

- [x] 3.1 In `transformRequestIn`: walk `request.messages`, for each assistant message missing `reasoning_content`, look up cache by first `tool_calls[].id`, inject cached value or empty string fallback

## 4. Verification

- [x] 4.1 Build the project (`pnpm build`) and verify no compilation errors
- [x] 4.2 Test with the curl reproduction case from the issue (multi-turn tool-use request to DeepSeek V4 Pro)
