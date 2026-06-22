# Claude Code Router Desktop

Electron desktop wrapper for Claude Code Router. The core gateway runtime is provided by the local `next-ai/gateway` project and installed as:

```json
"gateway": "file:../../next-ai/gateway"
```

At runtime this app starts two local services:

- CCR wrapper: `http://127.0.0.1:3456`
- next-ai core gateway: `http://127.0.0.1:3457`

The wrapper also owns an internal backend service for local HTTP backend lifecycles and scoped SQLite stores.

The wrapper reads `~/.claude-code-router/config.json`, preserves the old CCR `Providers` / `Router` format, generates `~/.claude-code-router/gateway.config.json`, and routes Claude Code `POST /v1/messages` requests into the core gateway.

## Provider Deeplink

Supplier websites can open CCR and import a model provider with a custom protocol link:

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&api_key=sk-example&models=example-chat%2Cexample-coder&protocol=openai_chat_completions
```

Supported query parameters:

- `name`: display name for the provider.
- `base_url`: provider API base URL. Aliases: `baseUrl`, `api_base_url`, `url`, `endpoint`.
- `api_key`: optional provider API key. Aliases: `apiKey`, `apikey`, `key`, `token`.
- `models`: comma-separated or newline-separated model list. You can also repeat `model=...`.
- `protocol`: one of `openai_chat_completions`, `openai_responses`, `anthropic_messages`, or `gemini_generate_content`. Aliases such as `openai`, `responses`, `anthropic`, and `gemini` are accepted.

For larger payloads, pass `payload` as URL-encoded JSON or base64url JSON with the same fields:

```json
{
  "name": "Example AI",
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-example",
  "models": ["example-chat", "example-coder"],
  "protocol": "openai_chat_completions"
}
```

CCR always opens a confirmation dialog before writing a provider imported from an external link.

## Plugin Architecture

CCR now has two plugin layers:

- Core gateway plugins: keep using `providerPlugins` and `virtualModelProfiles`. They are passed through to `next-ai/gateway`.
- Wrapper plugins: use top-level `plugins` to extend the Electron wrapper, register local HTTP backends, add gateway routes, and route proxy-mode traffic to plugin backends.

SQLite-backed local backend resources are managed by the wrapper's base backend service. They are not installed as a separate marketplace plugin.

Declarative proxy route to an existing backend:

```json
{
  "plugins": [
    {
      "id": "local-admin-api",
      "enabled": true,
      "proxy": {
        "routes": [
          {
            "id": "admin-api",
            "host": "api.example.com",
            "paths": ["/v1/admin"],
            "upstream": "http://127.0.0.1:4510",
            "stripPathPrefix": false
          }
        ]
      }
    }
  ]
}
```

Executable plugin module paths are resolved from `~/.claude-code-router`; absolute paths and package names are also supported.

Claude Design plugin routing:

The marketplace Claude Design plugin adapts Claude Design chat RPCs into CCR `/v1/messages` calls. Configure upstream APIs through CCR `Providers` as usual, then set Claude Design model routing from the Extensions page with the plugin's configure button. Routes created by the plugin are also shown on the Routing page as plugin-owned rows; they are read-only there and must be edited from the extension configuration dialog.

```json
{
  "Providers": [
    {
      "name": "anthropic-main",
      "type": "anthropic_messages",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-...",
      "models": ["claude-sonnet-4-20250514"]
    }
  ],
  "plugins": [
    {
      "id": "claude-design",
      "enabled": true,
      "module": "./plugins/claude-design-plugin.cjs",
      "config": {
        "routing": {
          "enabled": true,
          "default": "anthropic-main,claude-sonnet-4-20250514",
          "rules": [
            {
              "id": "design-opus",
              "name": "Claude Design Opus",
              "type": "model",
              "model": "claude-opus-4-8",
              "target": "anthropic-main,claude-sonnet-4-20250514",
              "enabled": true
            }
          ]
        }
      }
    }
  ]
}
```

Cursor proxy plugin:

The marketplace Cursor Proxy plugin registers proxy-mode routes for all paths on `api*.cursor.sh`, forwards OpenAI/Anthropic/Gemini-compatible JSON LLM requests to the local CCR gateway, and uses the configured CCR API key automatically. For Cursor Agent traffic, it bridges the private protobuf `BidiAppend` + `AgentService/RunSSE` flow into CCR's `/v1/chat/completions` gateway and streams the gateway response back as Cursor `AgentServerMessage` events. It also attempts to decode Cursor native Connect JSON/protobuf LLM RPCs under `aiserver.v1.*` and `agent.v1.*`, preserving decoded system prompts, tools, tool choices, tool calls, and tool results when those fields are present in the native payload.

Cursor often sends Agent requests with `model: "default"` or another Cursor-local model name. Configure Cursor Proxy model routing from the Extensions page with the plugin's configure button, or set `config.routing` manually. Route targets use the same provider/model selector format as Claude Design plugin routing. The plugin rewrites Cursor's source model to the selected CCR target model before forwarding it to the gateway, so the core gateway does not need a model literally named `default`.

```json
{
  "Providers": [
    {
      "name": "openrouter",
      "type": "openai_chat_completions",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-...",
      "models": ["anthropic/claude-sonnet-4.5", "google/gemini-3-pro-preview"]
    }
  ],
  "proxy": {
    "enabled": true,
    "mode": "gateway"
  },
  "plugins": [
    {
      "id": "cursor-proxy",
      "enabled": true,
      "module": "./plugins/cursor-proxy-plugin.cjs",
      "config": {
        "routing": {
          "enabled": true,
          "default": "openrouter,anthropic/claude-sonnet-4.5",
          "rules": [
            {
              "id": "cursor-default",
              "name": "Cursor default",
              "type": "model",
              "model": "default",
              "target": "openrouter,anthropic/claude-sonnet-4.5",
              "enabled": true
            }
          ]
        }
      }
    }
  ]
}
```

Other unsupported native Cursor RPC traffic is passed through to Cursor by default; set `"fallbackToCursor": false` to fail unsupported requests instead. Set `paths` only if you intentionally want to restrict which Cursor paths the plugin captures.

`cursorBidiProto`, `cursorConnectJson`, and `cursorNativeProto` are enabled by default. Set them to `false` only when you want Cursor's private Agent protobuf, Connect JSON, or generic native LLM RPC traffic to pass through untouched. `bidiWaitMs`, `bidiSessionTtlMs`, and `gatewayTimeoutMs` can be tuned for slow clients or slow upstream providers.
Generic native RPC decoding is intentionally limited to Cursor methods that look like generation or streaming LLM calls. Metadata and status calls such as model pickers, repository sync, analytics, dashboards, and file sync are passed through to Cursor. If a new Cursor LLM method is not detected yet, add its method name or full RPC path to `cursorNativeLlmMethods`.

If Cursor sends an OpenAI-compatible `*/chat/completions` request that already includes `system` messages or `tools`, Cursor Proxy and the CCR gateway preserve them. Some Cursor custom-provider flows send only user messages; the proxy cannot recover system/tool context that is not present in the incoming request. For those flows, configure fallback context explicitly:

```json
{
  "plugins": [
    {
      "id": "cursor-proxy",
      "config": {
        "systemPrompt": "You are Cursor in agent mode.",
        "tools": [
          {
            "name": "read_file",
            "description": "Read a file from the workspace.",
            "input_schema": {
              "type": "object",
              "properties": {
                "path": { "type": "string" }
              },
              "required": ["path"]
            }
          }
        ],
        "toolChoice": "auto"
      }
    }
  ]
}
```

The plugin does not define a separate provider format. Configure upstream APIs through CCR's existing `Providers`, `Router`, `providerPlugins`, and `virtualModelProfiles`; Cursor Proxy only adapts Cursor-compatible request paths and forwards them to the local CCR gateway. Legacy `targetProvider`, `targetProviders`, and `targetModel` are still accepted and converted into a routing target when `routing.default` is not set, but `config.routing` is preferred:

```json
{
  "Providers": [
    {
      "name": "anthropic-main",
      "type": "anthropic_messages",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-...",
      "models": ["claude-sonnet-4-20250514"]
    }
  ],
  "Router": {
    "default": "anthropic-main,claude-sonnet-4-20250514"
  },
  "plugins": [
    {
      "id": "cursor-proxy",
      "module": "./plugins/cursor-proxy-plugin.cjs",
      "config": {
        "routing": {
          "enabled": true,
          "default": "anthropic-main,claude-sonnet-4-20250514"
        }
      }
    }
  ]
}
```

Local plugin directories can declare dependencies in `plugin.json`, `ccr-plugin.json`, `.ccr-plugin/plugin.json`, `.codex-plugin/plugin.json`, or under `ccr.dependencies` / `ccrPlugin.dependencies` in `package.json`:

```json
{
  "id": "my-plugin",
  "module": "./index.cjs",
  "dependencies": [
    "claude-design",
    { "id": "local-helper", "module": "../local-helper/index.cjs" }
  ]
}
```

Dependencies declared by ID are resolved from the marketplace; dependencies with `module`, `path`, or `modulePath` are installed from that local path.

Plugin modules export a function or object with `setup(ctx)`. The context supports:

- `ctx.registerGatewayRoute({ method, path, auth, handler })`
- `ctx.registerHttpBackend({ id, host, port, handler })`
- `ctx.registerProxyRoute({ host, paths, upstream, stripPathPrefix, rewritePathPrefix, headers })`
- `ctx.openSqliteStore({ filename, migrate })`
- `ctx.registerCoreGatewayProviderPlugin(plugin)`
- `ctx.registerCoreGatewayVirtualModelProfile(profile)`

`ctx.registerHttpBackend` and `ctx.openSqliteStore` are backed by the wrapper's base backend service, so plugin modules do not need to ship or install a SQLite backend plugin.

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm run build:assets
npm run build:app
```

`npm run build:assets` compiles the Electron main process and renderer assets into `dist/`.

`npm run build` packages the app for the current platform and writes installer artifacts to `release/`.

`npm run build:app` packages both macOS and Windows artifacts with `electron-builder --mac --win`. You can also run `npm run build:app:mac` or `npm run build:app:win` for a single platform. Cross-building Windows installers from macOS may require Wine; otherwise run the Windows build command on Windows.

## Online Updates

Packaged builds check GitHub Releases for updates through `electron-updater`. The builder config publishes update metadata for `musistudio/claude-code-router`; attach the generated installer artifacts and `latest*.yml` files to each release. macOS builds include both `dmg` and `zip` targets because the updater requires the zip artifact.

For local update feed testing, set `CCR_UPDATE_FEED_URL` to a generic electron-updater feed URL before starting the app. `CCR_UPDATE_ALLOW_PRERELEASE=1` enables prerelease updates.
