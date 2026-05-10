# Project Lessons Learned

## Git & Workflow
- **Cherry-picking for Integration**: When merging a feature branch from a divergent fork into a base repo with critical fixes, cherry-picking specific commits is preferred over `git merge` to avoid regression and maintain a linear history.

## LLM Provider Integration (Gemini)
- **Problem**: Gemini 500 errors and tool use failures in multi-turn conversations.
  - **Resolution**: Implemented robust error handling and enhanced state management within the Gemini transformer. This ensures conversation history is correctly maintained and API calls are resilient to transient issues, preventing server errors and enabling reliable tool execution across multiple turns.
  - **Symptoms & Fix**: If Gemini returns 500 errors or tool calls fail in multi-turn dialogues, review the conversation state management and message history preparation for the Gemini API. Look for issues in how previous turns are summarized or passed, and ensure error handling (e.g., retries) is active.
- **Problem**: Gemini/Gemma streaming issues, autocompact malfunctions, and tool schema validation failures.
  - **Resolution**: Improved the streaming parser/serializer to correctly handle partial and complete stream events for both Gemini and Gemma. Enhanced autocompact logic to intelligently manage the context window, preventing unexpected truncations. Strengthened tool schema sanitization to ensure generated tool definitions strictly comply with API requirements.
  - **Symptoms & Fix**: If streaming responses are incomplete or corrupted, autocompact causes unexpected message shortening, or tool definitions are rejected, inspect the respective streaming, context management, and schema validation components of the Gemini/Gemma integration. Verify JSON schema conformity and stream processing integrity.
- **Problem**: Inefficient message grouping and suboptimal streaming logic for Gemini tool call handling.
  - **Resolution**: Refactored and optimized the internal message grouping mechanism and streaming logic for Gemini. This involved implementing smarter buffering and assembly of partial tool call events, leading to more efficient processing and faster, more accurate tool invocation.
  - **Symptoms & Fix**: If Gemini tool calls are delayed, appear out of order, or are incorrectly interpreted during streaming, examine the message grouping and streaming pipeline. Confirm that partial tool call payloads are being correctly identified, buffered, and reassembled before dispatching the full tool call.
- **Problem**: Gemini thinking-stream refactors can preserve happy-path parity but still lose metadata or raise cleanup exceptions on abrupt stream termination.
  - **Resolution**: Keep the last successfully parsed chunk/candidate around for end-of-stream finalization, and harden shared stream cleanup so `onComplete` failures and `controller.close()` do not mask the original stream error.
  - **Symptoms & Fix**: If fallback thinking/content chunks are missing `id` or `model`, or stream failures produce noisy secondary exceptions during shutdown, inspect the finalization path and the shared SSE reader cleanup order before changing the thinking sequencer logic.

## LLM Provider Integration (Mistral)
- **Parameter Mapping**: Mistral requires `reasoning_effort` (low, medium, high) instead of a `reasoning` object. 
- **Model ID Wildcards**: Use `.startsWith()` for model families (e.g., `mistral-small-`) to support multiple versions of the same model without manual list updates.
- **Effort Heuristics**: Mapping `max_tokens` to effort levels (low < 1k, medium < 5k, high > 5k) is a reliable way to translate unified reasoning requests to provider-specific efforts.
- **Nested Thinking Format**: Some Mistral models return thinking as an array of blocks within the `content` field (`delta.content = [{ type: "thinking", thinking: [...] }]`). Naive string concatenation of these objects results in `[object Object]` in the UI.
- **Aggressive Serialization**: To prevent `[object Object]` outputs, always verify if thinking content is a string or an object. Use a fallback to `.text` property or `JSON.stringify()` when dealing with provider-specific thinking blocks.

## LLM Provider Integration (DeepSeek)
- **Reasoning Replay Is Mandatory**: When DeepSeek thinking mode remains enabled across tool-use turns, prior assistant tool-call messages must carry their original `reasoning_content` back to the API. Replaying only the tool calls and visible assistant text is not enough.
- **Repair Source Order**: The safest replay order is: keep existing `reasoning_content` if present, otherwise derive it from `thinking.content`, otherwise restore it from a local cache keyed by conversation scope plus tool-call identity/signature.
- **Cache Population Point**: Populate the cache from provider responses, not from user-facing display chunks alone. For streamed responses, accumulate reasoning text plus the eventual assistant content/tool calls and store the final assistant message shape on stream completion.

## Architecture
- **Thin Transformer Pattern**: For maintainability, keep transformer classes as thin wrappers that handle high-level provider config and delegate all data transformation logic to a dedicated utility file (e.g., `gemini.util.ts`, `mistral.util.ts`).

## Infrastructure & Deployment
- **Docker Compose Builds**: Always include the `build` block with `context` and `dockerfile` when using local images to prevent Docker from attempting to pull the image from a remote registry.
- **Port Consistency**: Cross-verify `docker-compose` port mappings with the application's `config.json` (e.g., port `3456`) to ensure connectivity.
- **Persistence**: Use volume mounts for the entire configuration root (e.g., `/root/.claude-code-router`) to preserve both settings and logs across container restarts.

## LLM Provider Integration (Codex / ChatGPT Backend)
- **API Format**: Codex uses the Responses API (`POST /responses`) with an `input` array of message/function_call/function_call_output entries, not the standard `messages` array. System messages become a top-level `instructions` string — use Claude Code's system message directly, not model-specific defaults.
- **OAuth Authentication**: Codex authenticates via OAuth PKCE, not static API keys. Tokens are stored in `~/.claude-code-router/codex_auth.json` and automatically refreshed by the transformer. The provider config still needs a placeholder `api_key` field.
- **Streaming Is Mandatory**: Codex requires `stream: true` and `store: false`. The transformer must propagate `stream: true` to the original request body via `context.req.body.stream = true` so the downstream `formatResponse` sends an SSE stream rather than JSON.
- **Cloudflare Strips Content-Type**: Codex API responses are proxied through Cloudflare, which strips the `Content-Type` header from SSE responses. The `transformResponseOut` method must treat missing/empty `Content-Type` as `text/event-stream` and default to SSE parsing before attempting JSON parsing.
- **Tool Call Conversion**: Codex emits `response.output_item.added` (function_call) for tool use start and `response.function_call_arguments.delta` for argument chunks. These must be converted to OpenAI-format tool call chunks (`choice.delta.tool_calls`) which the AnthropicTransformer then converts to Anthropic-format `content_block_start`/`content_block_delta` events.
- **Multiple Thinking Waves**: Codex can emit reasoning in multiple waves (thinking content → signature → thinking content → signature). When the AnthropicTransformer closes a thinking block on signature, `isThinkingStarted` must be reset to `false` so each subsequent wave opens a new `content_block_start`. Without this reset, the second wave gets `content_block_delta` with index `-1`, causing Claude Code's "Content block not found" error.

## LLM Provider Integration (Gemini Nano / Chrome Prompt API)

- **Context Window**: Gemini Nano has a ~9216 token context window and ~1200 char output limit per turn. These tight constraints require aggressive prompt compression and structured output enforcement.
- **Persistent Session Architecture**: The bridge maintains a single `LanguageModel` session across all requests. Conversation history is carried forward within the session itself — no need to rebuild from `initialPrompts` each turn. This preserves context naturally but requires tracking `processedMsgCount` to only feed new messages to the model.
- **Structured Output via responseConstraint**: The model has no native function calling. Instead, `responseConstraint` (JSON Schema, Chrome 137+) forces output to match `{text, tool_calls[{name, arguments}]}`. The schema enforces `maxItems: 1` on `tool_calls` to keep output within budget. Text `maxLength: 1100` is set below the ~1200 char output ceiling to prevent truncation.
- **Whitespace Stalling**: Gemini Nano stalls on whitespace-heavy content (Python code indentation, JSON formatting). The bridge detects this with a whitespace character counter and aborts the stream after 2000 consecutive whitespace chars with no content. Write calls are limited to 3 lines — files are built incrementally with Write→Edit→Edit chains.
- **System Prompt Compression**: Claude Code's system prompt (~2400 chars of verbose instructions) is replaced with a compact ~700 char prompt listing 7 core tools (Bash, Read, Write, Edit, WebFetch, WebSearch, AskUserQuestion) with concise parameter descriptions and format examples. XML-style tags (`<tools>`, `<format>`, `<rules>`) provide clear structure as recommended by Gemini prompting docs.
- **Context Budget Conservation**: `stripClaudeCodeContext()` removes `<system-reminder>`, `<command-*>`, and `<local-command-*>` blocks injected by Claude Code. Tool results are truncated to 500 chars, file contents to 400 chars. Continuation prompts are minimized to status codes (`[write-ok]`, `[edit-ok]`, `[error]`) instead of verbose sentences.
- **Read Result Extraction**: Original regex-based extraction from prompt text was fragile and often failed. Fixed by using structured message matching: track `tool_call_id` from Read tool calls in assistant messages, then match against `tool_call_id` in tool result messages. Both OpenAI format (`role: "tool"`, `tool_call_id`) and Anthropic format (`tool_result` content blocks in user messages) are supported.
- **Auto-Compaction**: Triggers at 85% context usage (`usageRatio >= 0.85`). Calls `resetSession()` which destroys the old session and creates a new one with system prompt + "[Earlier conversation compacted to save context.]" appended. All messages are marked as processed to avoid re-feeding.
- **Retry on Broken Output**: If the model produces invalid JSON, a second attempt is made with an instruction appended to fix JSON formatting. This catches the common case where the model emits unclosed brackets or malformed JSON.
- **Token Estimation**: `completion_tokens` estimated as `response.length / 4` (chars-to-tokens heuristic). `prompt_tokens` computed from session context delta (`postUsage - preUsage - completionTokenEstimate`). These are approximate but sufficient for Claude Code's statusline display.
- **Tool Call Normalization**: The model may invent parameter names or tool names. `normalizeToolCall()` case-insensitively matches tool names and remaps parameter keys to the canonical names defined in `TOOL_REQUIRED_PARAMS`. Unknown args are mapped positionally.
- **Bridge Endpoints**: The bridge exposes `GET /v1/models` (list with `display_name` and `context_window.used_percentage` for statusline), `GET /v1/models/{name}` (individual model info for Claude Code's model discovery), `POST /v1/chat/completions` (streaming/non-streaming), and `GET /health`.

## Development & Tooling
- **Dependency Scoping**: `pino` is provided by Fastify in the server package but is not a direct dependency of the `core` package. Direct imports of `pino` in `core` will cause build failures; use the passed-in `logger` instance or native `fs` for separate log files.
- **Response Cloning**: When implementing background logging for responses, use `response.clone()` to avoid consuming the original stream, which would otherwise prevent the transformer from processing the output.
