---
title: Agent Profiles
pageTitle: Agent Profiles
eyebrow: Detailed Configuration
lead: Create reusable launch configurations for Claude Code, Codex, Grok CLI, Kimi CLI, Pi, and ZCode, and open separate agent instances from different configs.
---

## Configuration Flow

1. Add at least one usable provider and model in **Provider Config**, or create the Fusion model you want to use.
2. Open **Agent Profiles** and click **Add profile**.
3. Choose the agent type, name the config, then choose the effect scope and entry mode.
4. Select a model. The value is usually `Provider name/model name`, and Fusion models can be selected too.
5. If the entry mode includes App, optionally bind a Bot and choose whether to forward agent messages or enable handoff.
6. Save the config, then open it from the Agent Profiles card: the terminal button copies the CLI command, and the play button starts the App instance.

During trial, prefer **Only opened from CCR** and always open the agent from CCR. That keeps the config limited to CCR-launched instances and avoids changing the Claude Code, Codex, Grok CLI, Kimi CLI, Pi, or ZCode setup you open directly from the system.

## Multi-Instance Mechanism

Every Agent Profiles has its own `id` and name. When CCR opens an agent, it finds the enabled config by name or `id`, then builds the launch plan for that config.

| Mechanism | Actual behavior |
| --- | --- |
| Separate config files | With **Only opened from CCR**, Claude Code, Codex, OpenCode, Kimi CLI, and Pi write CCR-managed config or home files in directories separated by config `id` |
| Separate launchers | Claude Code, Grok CLI, Kimi CLI, Pi, and OpenCode use separate launch wrappers; Codex and ZCode use separate middleware launchers; filenames are also separated by config `id` or name |
| Separate app data directories | When opening App mode, Claude App, ChatGPT (the renamed Codex desktop app), and ZCode App use user-data directories separated by config `id` |
| Runtime state | CCR tracks running app instances by entry mode and config `id`; reopening the same config activates the existing window, while a different config can open a separate instance |

This lets you create multiple configs for the same agent, such as "Claude Code - Work Project", "Claude Code - Test Model", or "Codex - Fusion Vision". They can use different models, scopes, and Bots, then open as separate agent instances.

## Common Options

| Option | Applies to | Description |
| --- | --- | --- |
| Agent | All | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, Pi, or ZCode. Grok CLI, Kimi CLI, and Pi support CLI only; ZCode supports App only. |
| Config name | All | Identifies the config in CCR and can be used as the `ccr-app <config-name>` launch target. Names can contain spaces; copied commands are quoted automatically. |
| Enabled | All | Disabled configs are not exposed as active launch entries and are not applied as effective startup configs. |
| Effect scope | All | **Only opened from CCR** uses CCR-managed isolated config; **System default** writes the agent's default config. Only one enabled system-default config is allowed per agent. |
| Entry mode | Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, Pi | `CLI & APP` exposes both CLI and App entry points; `CLI only` only generates a CLI command; `App only` only exposes the App entry point. Grok CLI, Kimi CLI, and Pi are fixed to `CLI only`. |
| Model | All | Default model for the opened agent, either a provider model or Fusion model. Claude Code requires this value. |
| Available models | Kimi CLI | Models exposed by Kimi's `/model` command. The default model is always included. |
| Bot | App entry | Bot forwarding only works for App mode opened from CCR. CLI does not forward Bot messages yet. |
| Environment variables | All | Extra environment variables injected into this config. Claude Code includes `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` by default so gateway model discovery is enabled. |

## Per-Agent Options

### Claude Code

| Option | What it does |
| --- | --- |
| Default model | Required. Writes `ANTHROPIC_MODEL` for Claude Code. |
| Fable / Opus / Sonnet / Haiku models | Writes Claude Code model aliases through `ANTHROPIC_DEFAULT_FABLE_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and `ANTHROPIC_DEFAULT_HAIKU_MODEL`. Leave any alias empty to keep the Claude Code default. Existing `smallFastModel` configs are migrated to the Haiku alias. |
| Settings file | System-default mode uses the Claude Code default settings file; Only opened from CCR creates an isolated settings file under CCR's config directory, separated by Agent Profiles `id`. |
| Environment variables | Merged into the Claude Code settings `env`. CCR also writes the gateway endpoint, API key helper, and launch wrapper. |
| Bot | Applies only to the Claude App entry. Select a saved Bot, then choose message forwarding or handoff. |

After Claude Code CLI is opened from CCR, it uses CCR gateway model discovery. In Claude Code CLI, enter `/model` to view and switch the models exposed by CCR, including normal provider models and visible Fusion models.

Claude App is **zero-config**: when CCR opens Claude App from the desktop app, CCR automatically writes the Claude App gateway config, API key, model discovery list, and isolated user-data directory. No extra user action is required; opening Claude App from CCR automatically completes all necessary configuration. If Claude App is already running, restart it or reopen it from CCR when prompted.

Claude App and Claude Code CLI use different model-list adapters:

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | CCR gateway model discovery | Use `/model` in the CLI to view the list; selected requests still go through CCR providers, routing, and Fusion. |
| Claude App | CCR-generated Claude App inference models | Claude App needs Claude-compatible model names. CCR maps `Provider/model` and Fusion models into model entries Claude App can recognize, while display labels keep the real model meaning visible. |

### OpenCode

| Option | What it does |
| --- | --- |
| Provider ID | Writes the OpenCode provider reference, defaulting to `claude-code-router`. |
| Provider name | Display name shown in OpenCode, defaulting to `Claude Code Router`. |
| OpenCode model | Default model for OpenCode CLI and App. It can be a provider model or Fusion model. |
| Config file | System-default mode uses OpenCode's default config; Only opened from CCR writes a profile-specific config under CCR's config directory. |
| Environment variables | Injected into OpenCode CLI, OpenCode App, and its Bot worker. |
| Bot | Applies to the OpenCode App entry opened from CCR. Incoming Bot messages run through OpenCode CLI and replies are sent back to the same Bot conversation. |

CCR keeps one OpenCode Bot worker next to the OpenCode App process. The worker stores a project and optional session for each Bot conversation. Send `/project list|current|use` to select an Agent project, then use `/session list|current|new|use|reset` to manage sessions inside that project. Selecting another project clears the previous session, and sessions from another project cannot be selected. Only these slash-command domains are intercepted; removed `/task` and legacy flat commands are not supported.

The OpenCode CLI must be available as `opencode` in the CCR Desktop process environment. If it is installed elsewhere, set `CCR_OPENCODE_BIN` in the Agent Profiles environment variables. Bot sessions default to the filesystem root used by a fresh OpenCode Desktop workspace; set `CCR_OPENCODE_BOT_CWD` to the same project directory currently opened in OpenCode App when using another workspace. CCR passes that directory explicitly through `opencode run --dir`, so the resulting session appears under the matching App project. Permissions are not auto-approved by default; `CCR_OPENCODE_BOT_AUTO_APPROVE=true` enables OpenCode's dangerous `--auto` mode and should be used only in a trusted environment.

### Codex

| Option | What it does |
| --- | --- |
| Provider ID | Writes Codex `model_provider`, defaulting to `claude-code-router`. Keep it stable and use only letters, numbers, dots, underscores, or hyphens. |
| Provider name | Display name shown in Codex, defaulting to `Claude Code Router`. |
| Codex model | Default Codex model. It can be a provider model or Fusion model; if left empty, CCR uses the first available default model. |
| Show all sessions | Lets Codex show all sessions. ZCode does not expose this option. |
| Config file | Defaults to `~/.codex/config.toml`. Only opened from CCR writes into CCR-managed isolated config directories. |
| Environment variables | Injected into Codex CLI or ChatGPT. Claude Code-specific model discovery variables are not passed to Codex. |
| Bot | Applies only to the ChatGPT app entry. |

After saving, use the terminal button on the config card to copy the Codex CLI command, for example `ccr-app "Codex - Work"`. Use the play button to open ChatGPT. Following the CodexL launch model, CCR starts the Electron executable inside the ChatGPT app bundle directly, gives it an isolated user-data directory, and points `CODEX_CLI_PATH` at the CCR middleware. The middleware forwards app-server traffic to ChatGPT's bundled Codex CLI and only adapts the account display. Each profile reads ChatGPT login state only from its own Codex home. A profile without credentials reports a local non-OpenAI compatibility identity so current ChatGPT builds do not enter a repeated authentication and attestation loop. Shared login is opt-in: set `CCR_CODEX_CHATGPT_AUTH_FILE` (or the legacy `CODEXL_CODEX_CHATGPT_AUTH_FILE`) to a valid `auth.json` when a profile should bridge that token in memory without copying it. To make the native app-server select its official API marketplace, CCR creates the exact `ccr-local-profile` bootstrap only during process startup and removes it after the first native response; it is also cleaned after startup or abnormal exit and is never retained as login state. Every other authentication file is preserved. Older `Codex.app` installations remain supported.

Model and public plugin listings are not synthesized by the middleware. The native Codex app-server reads the generated `model_catalog_json` and handles `model/list` plus public `plugin/list` requests unchanged. This lets Codex refresh the official public [`openai/plugins`](https://github.com/openai/plugins) Git marketplace over the network. In a virtual workspace, only account-private marketplace requests are answered with an explicit empty result because the native service requires real ChatGPT authentication for those sections; they are never replaced with local plugins. Any downloaded Git checkout is owned only by Codex as its normal last-known-good data, not used by CCR as a replacement catalog.

### Grok CLI

Grok CLI profiles are fixed to **Only opened from CCR** and **CLI only**. After saving, copy and run the card command, for example `ccr-app "Grok - Work"`.

The generated wrapper sets Grok's model base URL and model-list URL to CCR's `/v1` gateway, supplies the profile-specific CCR API key, and sets the selected CCR model as the default. If the CCR Desktop gateway is not running, `ccr-app` starts a shared temporary service for Grok sessions and cleans it up after the last session exits. Grok CLI does not expose a separate user-config-file option, so CCR points `GROK_HOME` at a profile-specific directory. Its `config.toml` starts as a private copy of the user's config and can change independently, while `auth.json` is excluded to prevent a local xAI OAuth token from overriding the CCR key. Plugins, skills, and sessions remain shared with the original Grok home. Inside Grok CLI, use `/model` to switch among the provider and Fusion models returned by CCR; switched requests continue through CCR.

### Kimi CLI

Kimi CLI profiles are fixed to **Only opened from CCR** and **CLI only**. Select one default model and one or more available models. The generated wrapper points `KIMI_CODE_HOME` at a profile-specific directory whose `config.toml` defines a private OpenAI-compatible CCR provider and a model entry for every selection. Kimi's `/model` command can therefore switch models without bypassing CCR. CCR preserves non-provider settings from the source config and reuses available sessions, skills, plugins, MCP configuration, and credentials without rewriting the original `~/.kimi-code/config.toml`. If CCR Desktop is not running, the launcher starts a shared temporary gateway and stops it after the last managed Kimi session exits.

### Pi

| Option | What it does |
| --- | --- |
| Pi model | Optional default model passed to Pi. If left empty, CCR uses the first available gateway model. |
| Environment variables | Injected into the Pi wrapper. Use `CCR_PI_BIN` or `PI_BIN` when the real Pi executable is not available as `pi`. CCR manages `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, and `PI_SKIP_VERSION_CHECK`. |

Pi profiles are fixed to **Only opened from CCR** and **CLI only**. CCR writes a profile-specific `models.json` under `PI_CODING_AGENT_DIR`, with a provider that uses the local CCR `/v1` gateway as an OpenAI Responses endpoint and the profile-specific CCR API key. The generated wrapper sets `PI_CODING_AGENT_DIR` and `PI_CODING_AGENT_SESSION_DIR`, then launches Pi with `--provider` and `--model` so requests stay routed through CCR. If CCR Desktop is not running, the launcher starts the same shared temporary gateway used by other CLI-only profiles.

### ZCode

| Option | What it does |
| --- | --- |
| Provider ID | Writes the ZCode provider reference, defaulting to `claude-code-router`. |
| Provider name | Display name shown in ZCode, defaulting to `Claude Code Router`. |
| ZCode model | Default model when ZCode App opens. It can be a provider model or Fusion model. |
| Config file | Defaults to `~/.zcode/cli/config.json`; CCR also writes ZCode v2 config and model cache. |
| Environment variables | Injected into ZCode App and the middleware launcher. |
| Bot | Applies only to the ZCode App entry. |

ZCode supports App only, so its entry mode is fixed to `App only`. The `Show all sessions` option is hidden for ZCode.

## CLI And App Modes

| Mode | How to open | Best for | Key differences |
| --- | --- | --- | --- |
| CLI | Click the terminal button to copy the command, then run `ccr-app <config-name>` in a terminal | Working inside a project directory, shell workflows, scripting | Uses the config-specific wrapper or middleware launcher; usually stays in the terminal without opening a desktop window; Bot forwarding support is pending. |
| App | Click the play button in the CCR desktop app | Desktop windows, Bot forwarding, handoff | Reopening the same config activates the existing window. Multi-instance behavior depends on the Agent; OpenCode Desktop is single-instance, so CCR stops the managed instance before switching OpenCode profiles. |
| CLI & APP | One config exposes both CLI and App entry points | Reusing the same model config in both terminal and desktop App workflows | Both entries share the config name, model, effect scope, and environment variables, but launch differently. |

## Agent Differences

### Claude Code

Claude Code CLI config writes a settings file. With **Only opened from CCR**, CCR creates an isolated settings file under its own config directory and opens Claude Code through a separate launch wrapper.

When opening Claude App from the desktop app, CCR also prepares a separate user-data directory for that config. Different Agent Profiles entries use different directories, so multiple Claude App instances can run at the same time.

With a Bot bound, Claude App's companion worker exposes Projects/Sessions, streaming replies, attachments, Session usage, and native permission/Ask User requests to IM. The worker stops with the App.

### Codex

Codex config writes `config.toml` and a model catalog file. With **Only opened from CCR**, CCR stores those files in a directory separated by config `id`.

Codex supports CLI and App. CLI opens through the launcher for the selected config; App launches ChatGPT, uses a separate user-data directory, and passes the selected model and provider into the app.

With a Bot bound, the Codex App companion worker uses native Codex rollout Sessions for Project/Session browsing and continuation, queueing, cancellation, model settings, usage, attachments, and diagnostics. It exists only alongside the managed App.

### OpenCode

OpenCode config writes a JSON/JSONC config that routes the selected provider and model through CCR. CLI opens through a profile-specific wrapper; App launches the installed OpenCode Desktop executable with the same effective config.

When a Bot is selected and the App is opened from CCR, CCR starts a companion worker using OpenCode-native Sessions and the same Project/Session, queue, media, settings, and diagnostics contract as the other Apps. The worker stops when the managed OpenCode App exits or the profile is switched.

### Grok CLI

Grok CLI supports CLI only. CCR opens it through a profile-specific wrapper that injects the CCR model gateway, model discovery endpoint, API key, and default model. A profile-specific Grok home excludes xAI OAuth credentials so inference reliably uses the CCR key without rewriting the user's original Grok home.

### Kimi CLI

Kimi CLI supports CLI only. CCR opens it through a profile-specific wrapper and generated Kimi home containing the selected default model plus every available model. All generated model entries use the CCR gateway and profile API key, so `/model` switches remain routed through CCR; the user's original Kimi configuration remains untouched.

### Pi

Pi supports CLI only. CCR opens it through a profile-specific wrapper, generated `PI_CODING_AGENT_DIR`, and generated `models.json`. The Pi provider uses CCR's OpenAI Responses gateway and the profile API key; the wrapper passes the selected provider and model to the real Pi executable without importing Pi login state.

### ZCode

ZCode supports App only. CCR writes ZCode CLI config, v2 config, and model cache based on ZCode home or a custom config file, then starts the App with the current Agent Profiles's model, provider, and separate user-data directory.

With a Bot bound, ZCode uses the Codex-compatible companion worker and native Session discovery. Closing ZCode App immediately takes the relay offline.

## Multi-Instance Suggestions

1. Create one Agent Profiles for each agent instance that should run independently.
2. While testing, prefer **Only opened from CCR** to avoid changing the system default agent.
3. To keep desktop windows side by side, use `App only` or `CLI & APP`, then open the App from CCR.
4. If the same config is already running, opening it again activates the existing window. Create another Agent Profiles when you need a second instance.
