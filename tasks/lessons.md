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

## Development & Tooling
- **Dependency Scoping**: `pino` is provided by Fastify in the server package but is not a direct dependency of the `core` package. Direct imports of `pino` in `core` will cause build failures; use the passed-in `logger` instance or native `fs` for separate log files.
- **Response Cloning**: When implementing background logging for responses, use `response.clone()` to avoid consuming the original stream, which would otherwise prevent the transformer from processing the output.
