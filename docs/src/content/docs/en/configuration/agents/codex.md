---
title: Codex setup and configuration
pageTitle: Codex
eyebrow: Detailed configuration
lead: "Connect Codex (CLI and the ChatGPT desktop app) to CCR."
---

## Who this is for

Codex is OpenAI's coding agent. CCR supports both surfaces:

- **Codex CLI** — the terminal agent.
- **ChatGPT app** — the desktop app (the renamed Codex desktop app).

Use this page to route Codex to a non-OpenAI provider, pin a model, or run separate Codex/ChatGPT instances.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Codex CLI is installed (available as `codex` on `PATH`), or the ChatGPT desktop app is installed.
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Codex**.
2. Enter a **Config name** (for example `Codex - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Confirm **Provider ID**, **Provider name**, and **Codex model**.
5. Adjust advanced settings only if your local setup needs them.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open Codex from CCR (terminal button for CLI, play button for ChatGPT).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Codex** | Creates Codex launch entries in CCR. |
| Config name | Free text, e.g. `Codex - Work` | Identifies the profile. Desktop commands use `ccr-app "<name>"`; CLI commands use `ccr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Keeps changes limited to CCR launches, or makes this the system-default Codex profile. Only one enabled system-default Codex profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | Which launch entries (terminal command and/or ChatGPT app) are exposed. |
| Provider ID | Alphanumerics, `.`, `_`, `-`; default `claude-code-router` | Provider reference for this Codex profile. Keep it stable. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in Codex. |
| Codex model | Provider model or Fusion model | Default Codex model. If left empty, CCR uses the first available default model. |
| Show all sessions | Toggle | Writes `show_all_sessions` so Codex lists all sessions. |
| Config file | Path | Used for the system-default Codex profile. |
| Codex CLI path | Optional absolute path to the `codex` binary | Fill only when Codex is not on `PATH`. |
| Codex home | Optional directory | Sets `CODEX_HOME`. Fill only when you need a specific home directory. |
| Remote frontend mode | `app` / `cli` / `claude-code` | Leave default unless you have a specific reason. |
| CCR managed compact | Toggle | Lets CCR manage context compaction for this profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the ChatGPT app entry. |

## Open and use

- **CLI:** click the terminal button in the desktop app and run the copied command:
  ```text
  ccr-app "Codex - Work"
  ```
  For CLI, run:
  ```text
  ccr "Codex - Work"
  ```
- **App:** click the play button to open ChatGPT with this profile's model and provider. Reopening the same profile activates the existing window.

## Multi-instance

Create separate Codex profiles when you want different models or providers.

## AgentClaw (Bot)

With a Bot bound and ChatGPT opened from CCR, ChatGPT can relay conversations through the selected IM channel. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open Codex from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.
4. In the CLI, confirm the configured model is the one in use.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened Codex from CCR; a directly-opened Codex is unaffected unless the scope is **System default**.
- **ChatGPT keeps asking to sign in:** sign in to ChatGPT normally, then reopen it from CCR.
- **Provider ID rejected:** use only letters, numbers, dots, underscores, or hyphens, and keep it stable across saves.
- **Wrong model in the app:** confirm the **Codex model** field; if left empty, CCR falls back to the first available default model.
