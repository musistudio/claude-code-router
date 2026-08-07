---
title: Codex setup and configuration
pageTitle: Codex
eyebrow: Detailed configuration
lead: "Connect Codex (CLI and the ChatGPT desktop app) to CCR. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Codex is OpenAI's coding agent. CCR supports both surfaces:

- **Codex CLI** — the terminal agent. CCR writes a managed provider into Codex's `config.toml` and opens the CLI through a middleware launcher.
- **ChatGPT app** — the desktop app (the renamed Codex desktop app). CCR launches it with an isolated user-data directory and routes its app-server traffic through the CCR middleware.

Use this page to route Codex to a non-OpenAI provider, pin a model, or run isolated Codex/ChatGPT instances.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Codex CLI is installed (available as `codex` on `PATH`), or the ChatGPT desktop app is installed.
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects Codex

When you save a Codex profile, CCR writes managed blocks into the Codex **config file** (`config.toml`):

- `model_provider`, `model`, and a `model_catalog_json` pointer at the top level.
- A `[model_providers.<providerId>]` table with the CCR gateway `/v1` base URL, a bearer token, and `wire_api = "responses"`.
- A separate `<providerId>.config.toml` profile file (Codex's separate-profile-files format).
- A model catalog file (`ccr-model-catalog.json`) the native app-server reads for `model/list`.
- A CLI **middleware launcher** that sets `CODEX_HOME`, the provider/model, and the entry mode, then runs Codex.

With **Only opened from CCR**, these files live in an isolated CCR-managed directory keyed by the profile `id`. With **System default**, CCR writes `~/.codex/config.toml`.

For the **ChatGPT app**, CCR starts the Electron executable inside the app bundle directly, gives it an isolated user-data directory, and points `CODEX_CLI_PATH` at the CCR middleware. The middleware forwards app-server traffic to ChatGPT's bundled Codex CLI and only adapts the account display; it does not synthesize model or plugin listings.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Codex**.
2. Enter a **Config name** (for example `Codex - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Confirm **Provider ID**, **Provider name**, and **Codex model**.
5. Adjust **Show all sessions**, **Config file**, and environment variables as needed.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open Codex from CCR (terminal button for CLI, play button for ChatGPT).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Codex** | Tells CCR to apply the Codex `config.toml` mechanism. |
| Config name | Free text, e.g. `Codex - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Isolated CCR-managed files vs. the real `~/.codex/config.toml`. Only one enabled system-default Codex profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | Which launch entries (terminal command and/or ChatGPT app) are exposed. |
| Provider ID | Alphanumerics, `.`, `_`, `-`; default `claude-code-router` | Writes Codex `model_provider` and the provider table key. Keep it stable. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in Codex. |
| Codex model | Provider model or Fusion model | Default Codex model. If left empty, CCR uses the first available default model. |
| Show all sessions | Toggle | Writes `show_all_sessions` so Codex lists all sessions. |
| Config file | Path, default `~/.codex/config.toml` | Used in **System default** scope; **Only opened from CCR** writes into CCR-managed directories. |
| Codex CLI path | Optional absolute path to the `codex` binary | Used by the middleware launcher. Fill only when Codex is not on `PATH`. |
| Codex home | Optional directory | Sets `CODEX_HOME`. Fill only when you need a specific home directory. |
| Remote frontend mode | `app` / `cli` / `claude-code` | How the middleware presents the Codex frontend. Leave default unless you have a specific reason. |
| CCR managed compact | Toggle | Lets CCR manage context compaction for this profile. |
| Environment variables | Key/value rows | Injected into Codex CLI / ChatGPT. See below. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the ChatGPT app entry. |

## Environment variables

- `CCR_CODEX_CHATGPT_AUTH_FILE` (legacy `CODEXL_CODEX_CHATGPT_AUTH_FILE`) — path to a valid `auth.json`. Set it only when a profile should share a ChatGPT login token in memory (without copying it). By default each profile reads login state only from its own Codex home.
- Claude Code-specific model-discovery variables are **not** passed to Codex.
- Any other rows are exported into the middleware launcher.

> Each profile without shared credentials reports a local non-OpenAI compatibility identity so current ChatGPT builds do not enter a repeated authentication/attestation loop. CCR creates a short-lived `ccr-local-profile` bootstrap only during process startup and removes it after the first native response; it is never retained as login state.

## Open and use

- **CLI:** click the terminal button and run the copied command:
  ```text
  ccr-app "Codex - Work"
  ```
- **App:** click the play button to open ChatGPT with this profile's model, provider, and isolated user-data directory. Reopening the same profile activates the existing window.

## Multi-instance

Each profile has its own `id`. With **Only opened from CCR**, Codex gets isolated config files and a middleware launcher, and ChatGPT gets an isolated user-data directory, so several Codex profiles can run at once with different models or providers.

## AgentClaw (Bot)

With a Bot bound and ChatGPT opened from CCR, the companion worker uses native Codex rollout Sessions for Project/Session browsing and continuation, queueing, cancellation, model settings, usage, attachments, and diagnostics. It exists only alongside the managed app. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open Codex from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.
4. In the CLI, confirm the configured model is the one in use.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened Codex from CCR; a directly-opened Codex is unaffected unless the scope is **System default**.
- **ChatGPT keeps asking to sign in:** this is expected for a profile without shared credentials — it uses a local compatibility identity. Share a token only if you intentionally set `CCR_CODEX_CHATGPT_AUTH_FILE`.
- **Provider ID rejected:** use only letters, numbers, dots, underscores, or hyphens, and keep it stable across saves.
- **Wrong model in the app:** confirm the **Codex model** field; if left empty, CCR falls back to the first available default model.
