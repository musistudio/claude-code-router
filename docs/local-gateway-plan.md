# Local Gateway Plan

This repository uses `musistudio/claude-code-router` as the upstream base.
Local work should prefer CCR extension points before modifying core code.

## Current Target

- Claude Code ingress remains Anthropic `/v1/messages`.
- Default coding model routes to XFYun `astron-code-latest`.
- DeepSeek v4 is available for background, reasoning sidecar, fallback, and later RAG enrichment.
- Provider keys are read from environment variables.
- Persistent state and semantic memory use Docker-managed Postgres + pgvector first.

## Runtime Split

- Claude Code should point at the local CCR server:
  - `ANTHROPIC_BASE_URL=http://127.0.0.1:3456`
  - `ANTHROPIC_AUTH_TOKEN=local-dev-key`
- CCR reads the XFYun key from `XFYUN_API_KEY` and sends Claude Code traffic to:
  - `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic/v1/messages`
  - `astron-code-latest`
- MCP and OpenAI-compatible tools can call CCR with OpenAI format:
  - URL: `http://127.0.0.1:3456/v1/chat/completions`
  - local key: `local-dev-key`
  - model: `deepseek,deepseek-v4-flash` or `deepseek,deepseek-v4-pro`
- CCR reads the DeepSeek key from `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` and sends tool traffic to `https://api.deepseek.com/chat/completions`.

The stable boundary in this workspace is:

- Claude Code traffic stays on XFYun by default, including background, thinking,
  long-context, and subagent requests.
- DeepSeek v4 stays available for MCP/tools through explicit
  `/v1/chat/completions` routing.
- Automatic fallback from Claude traffic to DeepSeek is disabled by default so
  provider boundaries remain predictable.

Do not put provider API keys in repository files or `config.json`; keep them in process/user environment variables.

## Local Start

1. Apply the config template:
   `powershell -ExecutionPolicy Bypass -File D:\project\proxy_local\local\apply-local-config.ps1`
2. Start Postgres/pgvector:
   `docker compose -f D:\project\proxy_local\docker-compose.yml up -d`
3. Start the gateway after setting `XFYUN_API_KEY` and `OPENAI_API_KEY` in the shell:
   `powershell -ExecutionPolicy Bypass -File D:\project\proxy_local\local\start-local.ps1`

`start-local.ps1` builds `shared`, `core`, and `server`, then runs `packages/server/dist/index.js`. Use `-Dev` only when debugging ts-node startup.

## Extension Points

- `local/custom-router.cjs`: task difficulty and scenario routing.
- `local/config.example.json`: provider, router, concurrency, and storage defaults.
- `infra/postgres/init/001_gateway_schema.sql`: initial state and semantic memory schema.

## Concurrency

The local core patch reads:

- `Concurrency.global`: maximum in-flight provider requests across the gateway.
- `Concurrency.providers.<provider>`: per-provider in-flight limit.
- `Concurrency.queueTimeoutMs`: maximum time a request may wait for a slot.

Streaming requests hold their slot until the upstream stream is consumed or cancelled.

## Compatibility Patches

- Anthropic passthrough requests to non-first-party providers lift any mid-conversation `messages[].role === "system"` blocks into top-level `system`.
- Hop-by-hop and unsupported forwarding headers such as `expect`, `host`, and `content-length` are removed before `fetch`.
- Non-Anthropic providers do not receive unsupported `mid-conversation-system*` beta headers.
- CCR subagent markers (`<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>`) are resolved before custom routing so Claude Code subagents keep explicit routing.
- `/v1/chat/completions` also supports `provider,model` parsing, which lets MCP/tooling target DeepSeek directly.

## RAG Direction

Start with Postgres + pgvector:

- `gateway_sessions`: session metadata.
- `gateway_requests`: route decisions, latency, usage, failures.
- `semantic_documents`: session/project/reference snippets and embeddings.

Do not add Qdrant until pgvector becomes a measurable bottleneck.
