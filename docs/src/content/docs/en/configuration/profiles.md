---
title: Agent Config
pageTitle: Agent Config
eyebrow: Detailed Configuration
lead: Create reusable launch configurations for Claude Code, Codex, and ZCode, and open separate agent instances from different configs.
---

## Configuration Flow

1. Add at least one usable provider and model in **Provider Config**, or create the Fusion model you want to use.
2. Open **Agent Config** and click **Add profile**.
3. Choose the agent type, name the config, then choose the effect scope and entry mode.
4. Select a model. The value is usually `Provider name/model name`, and Fusion models can be selected too.
5. If the entry mode includes App, optionally bind a Bot and choose whether to forward agent messages or enable handoff.
6. Save the config, then open it from the Agent Config card: the terminal button copies the CLI command, and the play button starts the App instance.

During trial, prefer **Only opened from CCR** and always open the agent from CCR. That keeps the config limited to CCR-launched instances and avoids changing the Claude Code, Codex, or ZCode setup you open directly from the system.

## Multi-Instance Mechanism

Every Agent Config has its own `id` and name. When CCR opens an agent, it finds the enabled config by name or `id`, then builds the launch plan for that config.

| Mechanism | Actual behavior |
| --- | --- |
| Separate config files | With **Only opened from CCR**, Claude Code and Codex write CCR-managed config files in directories separated by config `id` |
| Separate launchers | Claude Code uses a separate launch wrapper; Codex and ZCode use separate middleware launchers; filenames are also separated by config `id` or name |
| Separate app data directories | When opening App mode, Claude App, ChatGPT (the renamed Codex desktop app), and ZCode App use user-data directories separated by config `id` |
| Runtime state | CCR tracks running app instances by entry mode and config `id`; reopening the same config activates the existing window, while a different config can open a separate instance |

This lets you create multiple configs for the same agent, such as "Claude Code - Work Project", "Claude Code - Test Model", or "Codex - Fusion Vision". They can use different models, scopes, and Bots, then open as separate agent instances.

## Common Options

| Option | Applies to | Description |
| --- | --- | --- |
| Agent | All | Claude Code, Codex, or ZCode. ZCode supports App only. |
| Config name | All | Identifies the config in CCR and can be used as the `ccr <config-name>` launch target. Names can contain spaces; copied commands are quoted automatically. |
| Enabled | All | Disabled configs are not exposed as active launch entries and are not applied as effective startup configs. |
| Effect scope | All | **Only opened from CCR** uses CCR-managed isolated config; **System default** writes the agent's default config. Only one enabled system-default config is allowed per agent. |
| Entry mode | Claude Code, Codex | `CLI & APP` exposes both CLI and App entry points; `CLI only` only generates a CLI command; `App only` only exposes the App entry point. |
| Model | All | Default model for the opened agent, either a provider model or Fusion model. For Claude Code, leaving it empty keeps the Claude Code default. |
| Bot | App entry | Bot forwarding only works for App mode opened from CCR. CLI does not forward Bot messages yet. |
| Environment variables | All | Extra environment variables injected into this config. Claude Code includes `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` by default so gateway model discovery is enabled. |

## Per-Agent Options

### Claude Code

| Option | What it does |
| --- | --- |
| Model override | Writes `ANTHROPIC_MODEL` for Claude Code. Leave it empty to keep Claude Code's own default model. |
| Small fast model | Writes `ANTHROPIC_SMALL_FAST_MODEL` for Claude Code lightweight tasks. Leave it empty to keep the Claude Code default. |
| Settings file | System-default mode uses the Claude Code default settings file; Only opened from CCR creates an isolated settings file under CCR's config directory, separated by Agent Config `id`. |
| Environment variables | Merged into the Claude Code settings `env`. CCR also writes the gateway endpoint, API key helper, and launch wrapper. |
| Bot | Applies only to the Claude App entry. Select a saved Bot, then choose message forwarding or handoff. |

After Claude Code CLI is opened from CCR, it uses CCR gateway model discovery. In Claude Code CLI, enter `/model` to view and switch the models exposed by CCR, including normal provider models and visible Fusion models.

Claude App is **zero-config**: when CCR opens Claude App from the desktop app, CCR automatically writes the Claude App gateway config, API key, model discovery list, and isolated user-data directory. No extra user action is required; opening Claude App from CCR automatically completes all necessary configuration. If Claude App is already running, restart it or reopen it from CCR when prompted.

Claude App and Claude Code CLI use different model-list adapters:

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | CCR gateway model discovery | Use `/model` in the CLI to view the list; selected requests still go through CCR providers, routing, and Fusion. |
| Claude App | CCR-generated Claude App inference models | Claude App needs Claude-compatible model names. CCR maps `Provider/model` and Fusion models into model entries Claude App can recognize, while display labels keep the real model meaning visible. |

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

After saving, use the terminal button on the config card to copy the Codex CLI command, for example `ccr "Codex - Work"`. Use the play button to open ChatGPT. Following the CodexL launch model, CCR starts the Electron executable inside the ChatGPT app bundle directly, gives it an isolated user-data directory, and points `CODEX_CLI_PATH` at the CCR middleware. The middleware forwards app-server traffic to ChatGPT's bundled Codex CLI and only adapts the account display: an existing valid ChatGPT token is shown as the real ChatGPT account, while a profile without credentials uses a tokenless ChatGPT-shaped workspace identity so the desktop renderer keeps model selection available without storing a real user login. To make the native app-server select its official API marketplace, CCR creates the exact `ccr-local-profile` bootstrap only during process startup and removes it after the first native response; it is also cleaned after startup or abnormal exit and is never retained as login state. Every other authentication file is preserved. Older `Codex.app` installations remain supported.

Model and public plugin listings are not synthesized by the middleware. The native Codex app-server reads the generated `model_catalog_json` and handles `model/list` plus public `plugin/list` requests unchanged. This lets Codex refresh the official public [`openai/plugins`](https://github.com/openai/plugins) Git marketplace over the network. In a virtual workspace, only account-private marketplace requests are answered with an explicit empty result because the native service requires real ChatGPT authentication for those sections; they are never replaced with local plugins. Any downloaded Git checkout is owned only by Codex as its normal last-known-good data, not used by CCR as a replacement catalog.

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
| CLI | Click the terminal button to copy the command, then run `ccr <config-name>` in a terminal | Working inside a project directory, shell workflows, scripting | Uses the config-specific wrapper or middleware launcher; usually stays in the terminal without opening a desktop window; Bot forwarding support is pending. |
| App | Click the play button in the CCR desktop app | Desktop windows, side-by-side instances, Bot forwarding, handoff | Uses a separate user-data directory per Agent Config; reopening the same config activates the existing window, while different configs can run in parallel. |
| CLI & APP | One config exposes both CLI and App entry points | Reusing the same model config in both terminal and desktop App workflows | Both entries share the config name, model, effect scope, and environment variables, but launch differently. |

## Agent Differences

### Claude Code

Claude Code CLI config writes a settings file. With **Only opened from CCR**, CCR creates an isolated settings file under its own config directory and opens Claude Code through a separate launch wrapper.

When opening Claude App from the desktop app, CCR also prepares a separate user-data directory for that config. Different Agent Config entries use different directories, so multiple Claude App instances can run at the same time.

### Codex

Codex config writes `config.toml` and a model catalog file. With **Only opened from CCR**, CCR stores those files in a directory separated by config `id`.

Codex supports CLI and App. CLI opens through the launcher for the selected config; App launches ChatGPT, uses a separate user-data directory, and passes the selected model and provider into the app.

### ZCode

ZCode supports App only. CCR writes ZCode CLI config, v2 config, and model cache based on ZCode home or a custom config file, then starts the App with the current Agent Config's model, provider, and separate user-data directory.

## Multi-Instance Suggestions

1. Create one Agent Config for each agent instance that should run independently.
2. While testing, prefer **Only opened from CCR** to avoid changing the system default agent.
3. To keep desktop windows side by side, use `App only` or `CLI & APP`, then open the App from CCR.
4. If the same config is already running, opening it again activates the existing window. Create another Agent Config when you need a second instance.
