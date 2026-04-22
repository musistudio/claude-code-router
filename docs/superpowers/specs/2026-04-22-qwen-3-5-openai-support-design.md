# Spec: Qwen 3.5 OpenAI Protocol Support

## Overview
Enable support for Qwen 3.5 via the OpenAI `/v1/chat/completions` protocol. This allows OpenAI-compatible clients (like LiteLLM) to use the router while benefiting from specialized features like Qwen-specific thinking detection and tool mapping.

## Goals
- Support OpenAI `/v1/chat/completions` endpoint.
- Forward OpenAI requests through the same "smart routing" and transformation pipeline as `/v1/messages`.
- Automatically detect Qwen `<think>` tags and map them to OpenAI `reasoning_content`.
- Implement "Shadow Tool Mapping" (long names to short names) for OpenAI requests.

## Architecture

### 1. Routing Layer (`packages/core/src/server.ts`)
- Register `/v1/chat/completions` in the `preHandler` hook.
- Extract `provider,model` from the `model` field in the OpenAI request body.
- Invoke the `router()` utility to select the target model and scenario.

### 2. Transformer Layer (`packages/core/src/transformer/openai.transformer.ts`)
A new `OpenAITransformer` will be created:
- **`transformRequestOut`**: 
    - Convert OpenAI messages to `UnifiedChatRequest`.
    - Apply "Shadow Tool Mapping" (e.g., `run_bash_command` -> `Bash`).
    - Ensure strict tool parameters (inject `required` fields).
- **`transformResponseIn`**:
    - Detect Qwen `<think>` tags in the raw response.
    - Map thinking content to `reasoning_content`.
    - Re-format the unified response to OpenAI `chat.completion` (or chunk for streams).

### 3. Shared Utilities
To avoid duplication with `AnthropicTransformer`, the following will be moved to shared utilities:
- **Tool Mapping**: `run_bash_command` <-> `Bash` bidirectional mapping.
- **Thinking Detection**: Regex-based `<think>` tag extraction.

## Data Flow
1. Client sends OpenAI POST to `/v1/chat/completions`.
2. `server.ts` hook parses the model and calls `router()`.
3. `routes.ts` selects `OpenAITransformer`.
4. `OpenAITransformer.transformRequestOut` prepares the payload for the provider.
5. Provider (e.g., DashScope/LiteLLM) returns a response.
6. `OpenAITransformer.transformResponseIn` parses Qwen output and formats it as an OpenAI response with `reasoning_content`.

## Testing Strategy
- **Unit Tests**: Test tool mapping and thinking extraction in isolation.
- **Integration Tests**: Mock a Qwen provider and verify that `/v1/chat/completions` returns `reasoning_content` when `<think>` tags are present.
- **Client Verification**: Test with LiteLLM to ensure seamless integration.
