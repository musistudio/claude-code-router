# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router (CCR) proxies Claude Code requests to different LLM providers with routing, request/response transformation, and streaming. Monorepo with five packages:

| Package | npm name | Role |
|---------|----------|------|
| `core` | `@musistudio/llms` | Core engine: Fastify server, routing, transformers, providers, plugins |
| `server` | `@CCR/server` | Application layer: auth, config API, preset API, log API, UI static serving |
| `cli` | `@CCR/cli` | CLI binary (`ccr`) — start/stop/restart, model selector, preset management |
| `shared` | `@CCR/shared` | Constants, preset utilities, shared types |
| `ui` | `@CCR/ui` | React + Vite + Tailwind web management dashboard |

**Dependency graph**: `cli → server → core → shared`; `ui → shared` (standalone frontend)

The `docs/` directory is a Docusaurus site for project documentation.

## Build & Dev Commands

```bash
pnpm build                  # Build all packages (shared → core → server → cli → ui)
pnpm build:shared           # Build shared only
pnpm build:core             # Build @musistudio/llms only
pnpm build:server           # Build server only
pnpm build:cli              # Build CLI only
pnpm build:ui               # Build UI only

pnpm dev:cli                # CLI dev mode (ts-node)
pnpm dev:server             # Server dev mode (ts-node)
pnpm dev:ui                 # UI dev mode (Vite)
pnpm dev:core               # Core dev mode (nodemon)
pnpm dev:docs               # Docs dev server

pnpm release                # Build + publish all
```

Build order matters: `shared` must build before `core`, `core` before `server`, `server` before `cli`. The root `pnpm build` script handles this.

There is **no test infrastructure** — no test runner, no test files, no test dependencies.

## Request Flow

When a Claude Code client sends a request:

```
Client (Claude Code)
  → Fastify server (core/src/server.ts)
  → Router preHandler hook (core/src/utils/router.ts)
      - Extracts session ID from metadata.user_id
      - Calculates token count (tiktoken cl100k_base or configured tokenizer)
      - Resolves target model: custom router → subagent tag → scenario routing → default
      - Sets req.body.model to "providerName,modelName" format
  → preHandler hook (server.ts) splits "providerName,modelName" into req.provider / req.model
  → Route handler (core/src/api/routes.ts)
      - Resolves provider from TransformerService
      - Processes request transformers: transformRequestOut → provider-level transformRequestIn → model-specific transformRequestIn
      - Sends request to upstream provider (with concurrency control via Semaphore)
      - Processes response transformers: provider-level transformResponseOut → model-specific transformResponseOut → transformResponseIn
      - Returns streaming (SSE) or JSON response
```

### Routing Priority (in `router.ts`)

1. **Explicit model** — if body.model already contains a comma (e.g. `openrouter,claude-3.5-sonnet`), use it directly
2. **Long context** — token count > `longContextThreshold` (default 60000) → `Router.longContext`
3. **Subagent tag** — `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` in system prompt
4. **Background** — model name contains "claude" + "haiku" → `Router.background`
5. **Web search** — tools include `web_search*` type → `Router.webSearch`
6. **Thinking** — `req.body.thinking` is set → `Router.think`
7. **Default** — `Router.default`

Fallback: if a provider returns an error and `fallback` config exists for the scenario type, tries each fallback model in sequence.

## Core Architecture

### Transformer System (`packages/core/src/transformer/`)

Each transformer implements `Transformer` interface with optional methods:
- `transformRequestOut` / `transformRequestIn` — modify requests
- `transformResponseOut` / `transformResponseIn` — modify responses
- `auth` — set authentication headers (used in passthrough mode)
- `endPoint` — if set, registers a dedicated Fastify POST route for this transformer

**Passthrough mode**: when a provider uses only one transformer and it matches the route's transformer, all other transformers are bypassed and the request is forwarded as-is (with auth).

Built-in transformers (see `index.ts`): `Anthropic`, `OpenAI`, `Gemini`, `VertexGemini`, `VertexClaude`, `Deepseek`, `Openrouter`, `Groq`, `Cerebras`, `Vercel`, `OpenAIResponses`, `Tooluse`, `MaxToken`, `MaxCompletionTokens`, `Reasoning`, `Sampling`, `EnhanceTool`, `Cleancache`, `StreamOptions`, `CustomParams`, `ForceReasoning`

Custom transformers loaded via `transformers` array in config.json (path + optional options).

### Concurrency Control (`packages/core/src/utils/concurrency.ts`)

Semaphore-based concurrency limiting per provider and globally. Configured via `Concurrency` in config:
- `global` — max concurrent requests across all providers
- `providers.<name>` — max concurrent requests per provider
- `queueTimeoutMs` — timeout for queued requests (default 120000ms)

### Plugin System (`packages/core/src/plugins/`)

Plugins extend functionality via hooks. Built-in: `tokenSpeedPlugin` (tracks token throughput). Custom plugins implement `CCRPlugin` interface.

### Agent System (`packages/server/src/agents/`)

Agents intercept specific request types (e.g., image agent). Flow: `shouldHandle` → `reqHandler` (modify request) → add agent tools → intercept tool call in `onSend` → execute agent tool → new LLM request → stream results back.

### SSE Stream Processing (`packages/core/src/utils/sse.ts`)

- `SSEParserTransform` — parses SSE text into event objects
- `SSESerializerTransform` — serializes event objects into SSE text
- `rewriteStream` — intercepts/modifies stream data for agent tool calls

### Namespace System

The `Server` class supports registering multiple namespaces via `registerNamespace(name, options)`. Each namespace gets its own `ConfigService`, `TransformerService`, and `ProviderService` instances. The main namespace (`/`) uses the root config; prefixed namespaces (e.g., `/preset/my-preset`) use isolated configs from preset providers.

### Model Alias System (`packages/core/src/utils/model-alias.ts`)

Config-driven model name mapping. When Claude Code sends a model name like `claude-opus-4`, the `resolveModelAlias()` function looks it up in the `ModelMapping` config section and returns the mapped `provider,model` string (e.g. `deepseek,deepseek-v4-pro`). Resolution strategy: exact match → progressive prefix stripping → case-insensitive fallback. Called in `router.ts` before the existing routing logic. Adding a new provider only requires editing `config.json`.

### Semantic Store (`packages/core/src/services/semantic-store.ts`)

Lightweight vector storage backed by Postgres+pgvector. API endpoints registered in `packages/server/src/server.ts`:
- `POST /api/semantic/upsert` — store document with optional auto-embedding
- `POST /api/semantic/search` — cosine similarity search (falls back to ILIKE if no embeddings)
- `GET /api/semantic/status` — Postgres connection health
- `DELETE /api/semantic/:scope/:topic` — delete by scope+topic
- `GET /api/health` — gateway health (providers + semantic store)

Graceful degradation: if Postgres is unavailable, semantic operations return empty results; the gateway continues serving LLM requests.

### Header Compatibility Layer

When forwarding to non-Anthropic providers, `routes.ts` sets `stripAnthropicHeaders: true`, causing `request.ts` to strip `anthropic-beta` and `anthropic-version` headers. Providers using the `Anthropic` transformer (like Xfyun) keep these headers.

## Configuration

Location: `~/.claude-code-router/config.json` (JSON5 format)

Key features:
- Environment variable interpolation: `$VAR_NAME` or `${VAR_NAME}`
- Automatic backups (keeps last 3)
- Hot reload requires restart (`ccr restart`)
- If `Providers` are configured, `HOST` and `APIKEY` must be set
- Without `APIKEY`, host is forced to `127.0.0.1`

## Development Notes

1. **Node.js**: ≥ 20.0.0 (per root package.json engines field)
2. **Package manager**: pnpm with workspace protocol
3. **TypeScript**: All packages use TypeScript; `ui` package is ESM (`"type": "module"`)
4. **Build tools**: core/server/cli/shared use esbuild (scripts in `scripts/`); ui uses Vite
5. **HTTP framework**: Fastify (not Hono/Express) — core creates the Fastify instance, server extends it
6. **Code comments**: MUST be written in English
7. **Documentation**: Add to `docs/` project (Docusaurus), not standalone md files
8. **@musistudio/llms**: This IS the `core` package — it's published to npm as `@musistudio/llms` but lives in this repo at `packages/core/`
9. **Path aliases**: The core package uses `@/` path alias mapped to `packages/core/src/` (configured in tsconfig and esbuild)
