---
title: Claude Code setup and configuration
pageTitle: Claude Code
eyebrow: Detailed configuration
lead: "Connect Claude Code (CLI and App) to CCR so every request runs through your providers, routing, and Fusion models. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Claude Code is Anthropic's coding agent. CCR supports both of its surfaces:

- **Claude Code CLI** — the terminal agent. CCR rewrites its settings so it talks to the CCR gateway, and opens it through a launch wrapper.
- **Claude App** — the desktop app. CCR opens it with a zero-config gateway, API key, model discovery list, and an isolated user-data directory.

Use this page when you want to route Claude Code to a non-Anthropic provider, pin a specific model, run several isolated Claude Code instances, or attach an IM bot.

> New to CCR? Add a provider and model first, then come back here. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running and at least one provider + model is configured.
2. Claude Code is installed and logged in on this machine, or you will open it from CCR.
3. You are on the **Agent Config** page and click **Add profile**.

## How CCR connects Claude Code

When you save (apply) a Claude Code profile, CCR writes a managed block into the Claude Code **settings file**:

- Sets `apiKeyHelper` to a CCR-generated helper script that returns this profile's CCR API key.
- Sets the gateway endpoint into `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_BASE_URL`, and `CLAUDE_AGENT_API_BASE_URL`.
- Removes any conflicting `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` so the key comes from CCR, not a stored token.
- Writes your selected model and model aliases (see below).
- Generates a launch **wrapper** that sets the entry mode, remote-sync (for App), bot environment, and tool/MCP config, then runs Claude Code.

With **Only opened from CCR**, these files live in an isolated CCR-managed directory keyed by the profile `id`, so the Claude Code you open directly from the system is untouched. With **System default**, CCR writes the real `~/.claude/settings.json`.

Claude App is **zero-config**: opening it from CCR automatically writes the App gateway config, API key, model discovery list, and a separate user-data directory. If Claude App is already running, reopen it from CCR when prompted.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Claude Code**.
2. Enter a **Config name** (for example `Claude Code - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Select a **Model** (or leave it empty to keep the Claude Code default).
5. Optionally fill in model aliases, the settings file, and environment variables.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open Claude Code from CCR (terminal button for CLI, play button for App).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Claude Code** | Tells CCR to apply the Claude Code settings-file mechanism. |
| Config name | Free text, e.g. `Claude Code - Work` | Identifies the profile in CCR and is used in the `ccr-app "<name>"` command. Spaces are allowed and auto-quoted. |
| Enabled | Toggle on/off | Disabled profiles are not applied and are not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | `Only opened from CCR` uses an isolated CCR-managed settings file; `System default` writes `~/.claude/settings.json`. Only one enabled system-default Claude Code profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | `CLI & APP` exposes both the terminal command and the App button; `CLI only` only generates a CLI command; `App only` only exposes the App. |
| Model | A provider model or Fusion model, e.g. `Moonshot/kimi-k3` | Writes `ANTHROPIC_MODEL`. Leave it empty to keep Claude Code's own default model. |
| Fable model | Optional model selector | Writes `ANTHROPIC_DEFAULT_FABLE_MODEL`, the model Claude Code uses for the Fable tier. |
| Opus model | Optional model selector | Writes `ANTHROPIC_DEFAULT_OPUS_MODEL`. |
| Sonnet model | Optional model selector | Writes `ANTHROPIC_DEFAULT_SONNET_MODEL`. |
| Haiku model | Optional model selector | Writes `ANTHROPIC_DEFAULT_HAIKU_MODEL` (also the small/fast model). |
| Settings file | Path, default `~/.claude/settings.json` | Used in **System default** scope. In **Only opened from CCR** this is ignored in favor of an isolated CCR-managed file. |
| CCR managed compact | Toggle | Lets CCR manage context compaction for this profile. |
| Environment variables | Key/value rows | Merged into the Claude Code settings `env`. See below. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the Claude App entry. CLI does not forward bot messages. |

### Model aliases

Claude Code picks a model per internal tier. The **Model** field sets the default (`ANTHROPIC_MODEL`). The optional **Fable / Opus / Sonnet / Haiku model** fields override each tier individually, so you can, for example, run a strong provider model for Opus while keeping a cheaper one for Haiku. Leave a tier empty to let Claude Code choose it.

### CLI vs App model lists

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | CCR gateway model discovery | Use `/model` in the CLI to see and switch models exposed by CCR, including Fusion models. |
| Claude App | CCR-generated Claude App inference models | Claude App needs Claude-compatible names, so CCR maps each `Provider/model` and Fusion model into an entry Claude App recognizes, while keeping the real meaning in the label. |

## Environment variables

- `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` — included by default so `/model` can list gateway models. Keep it unless you have a reason to disable discovery.
- `CCR_CLAUDE_CODE_BIN` — absolute path to the real `claude` executable, if it is not on `PATH` in the CCR Desktop process.
- Any other rows are exported into the launch wrapper and merged into settings `env`.
- In a China timezone, CCR also sets `TZ=UTC` automatically to avoid timezone-related tool failures; you do not configure this.

> CCR always writes the gateway endpoint, API key helper, and launch wrapper itself. Do not manually set `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` here — CCR manages them.

## Open and use

- **CLI:** click the terminal button on the profile card and run the copied command:
  ```text
  ccr-app "Claude Code - Work"
  ```
  Inside Claude Code, run `/model` to view and switch the models CCR exposes.
- **App:** click the play button. CCR opens Claude App with the profile's gateway config and isolated user-data directory. Reopening the same profile activates the existing window.

## Multi-instance

Each profile has its own `id`. With **Only opened from CCR**, Claude Code CLI gets an isolated settings file and wrapper, and Claude App gets an isolated user-data directory, so multiple Claude Code profiles can run side by side with different models, scopes, or bots.

## AgentClaw (Bot)

If you bind a Bot and open Claude App from CCR, the companion worker exposes Projects/Sessions, streaming replies, attachments, Session usage, and native permission/Ask User requests to IM. The worker stops when the App closes. See [AgentClaw](/en/agentclaw/) for the full IM setup.

## Verify

1. Open Claude Code from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the CCR gateway (and which provider/model it used).
4. In the CLI, run `/model` and confirm the CCR-exposed models appear.

## Common issues

- **Requests do not reach CCR:** confirm the profile is **Enabled** and you opened Claude Code from CCR (not from the system). A directly-opened Claude Code is not affected unless the scope is **System default**.
- **`/model` shows no CCR models:** keep `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` in the profile env, and confirm a provider + model is configured.
- **Claude App did not pick up the config:** Claude App is already running — reopen it from CCR, or restart it when prompted.
- **Model aliases have no effect:** aliases only change which provider model a Claude Code tier uses; the value must be a valid `Provider/model` or Fusion model that CCR can serve.
