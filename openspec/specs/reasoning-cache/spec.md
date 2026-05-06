### Requirement: Cache reasoning content from streaming responses
The `deepseek` transformer SHALL accumulate tool call IDs alongside reasoning content during streaming response processing in `transformResponseOut`. When the stream ends, the transformer SHALL store each `tool_call_id → reasoning_content` mapping in an LRU cache.

#### Scenario: Streaming response with reasoning and tool calls
- **WHEN** a streaming response contains `delta.reasoning_content` chunks followed by `delta.tool_calls` with IDs
- **THEN** the transformer accumulates the full reasoning content string, collects all tool call IDs, and stores `tool_call_id → reasoning_content` for each ID in the LRU cache

#### Scenario: Streaming response with reasoning but no tool calls
- **WHEN** a streaming response contains `delta.reasoning_content` chunks but no `delta.tool_calls`
- **THEN** the transformer SHALL NOT store anything in the cache (reasoning content is optional per DeepSeek docs for non-tool-call turns)

#### Scenario: Streaming response with no reasoning content
- **WHEN** a streaming response has no `delta.reasoning_content` chunks
- **THEN** the transformer SHALL NOT store anything in the cache

### Requirement: Cache reasoning content from non-streaming responses
The `deepseek` transformer SHALL extract `reasoning_content` and `tool_calls[].id` from non-streaming JSON responses in `transformResponseOut` and store them in the LRU cache.

#### Scenario: Non-streaming response with reasoning and tool calls
- **WHEN** a non-streaming JSON response contains `choices[0].message.reasoning_content` and `choices[0].message.tool_calls` with IDs
- **THEN** the transformer SHALL store each `tool_call_id → reasoning_content` mapping in the LRU cache

#### Scenario: Non-streaming response with reasoning but no tool calls
- **WHEN** a non-streaming JSON response contains `reasoning_content` but no `tool_calls`
- **THEN** the transformer SHALL NOT store anything in the cache

### Requirement: Re-inject cached reasoning content on requests
The `deepseek` transformer SHALL, in `transformRequestIn`, inject `reasoning_content` on every assistant message that lacks it. For messages with `tool_calls`, the transformer SHALL look up the cached reasoning content by the first tool call ID. If found, inject the cached value. If not found, inject an empty string.

#### Scenario: Assistant message with tool calls and cached reasoning content
- **WHEN** an assistant message has `tool_calls` with an ID that exists in the cache
- **THEN** the transformer SHALL set `reasoning_content` to the cached value

#### Scenario: Assistant message with tool calls but cache miss
- **WHEN** an assistant message has `tool_calls` with an ID that does not exist in the cache
- **THEN** the transformer SHALL set `reasoning_content` to an empty string

#### Scenario: Assistant message with no tool calls
- **WHEN** an assistant message has no `tool_calls` and no `reasoning_content`
- **THEN** the transformer SHALL set `reasoning_content` to an empty string

#### Scenario: Assistant message that already has reasoning_content
- **WHEN** an assistant message already has a `reasoning_content` field
- **THEN** the transformer SHALL NOT modify it

### Requirement: LRU cache capacity and eviction
The reasoning content cache SHALL use the existing `LRUCache` class with a capacity of 200 entries. When the cache is full, adding a new entry SHALL evict the least recently used entry.

#### Scenario: Cache at capacity
- **WHEN** the cache contains 200 entries and a new entry is added
- **THEN** the least recently used entry SHALL be evicted before the new entry is stored
