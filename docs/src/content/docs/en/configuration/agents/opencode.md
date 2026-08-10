---
title: OpenCode setup and configuration
pageTitle: OpenCode
eyebrow: Detailed configuration
lead: "Connect OpenCode (CLI and App) to CCR. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

OpenCode is a coding agent with an OpenAI-compatible provider model. CCR supports both surfaces:

- **OpenCode CLI** — the terminal agent. CCR writes a managed gateway provider into OpenCode's JSONC config and opens the CLI through a wrapper.
- **OpenCode App** — the desktop app. CCR launches the installed OpenCode Desktop executable with the same effective config.

Use this page to route OpenCode to any CCR provider or Fusion model, or to attach an IM bot to the App.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. OpenCode CLI is installed (available as `opencode` on `PATH`); for App mode, the OpenCode Desktop app is installed.
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects OpenCode

When you save an OpenCode profile, CCR:

- Writes a managed gateway provider into the OpenCode **config file** (`opencode.jsonc`) that points OpenCode at the CCR gateway with this profile's token and selected model.
- Generates a launch **wrapper** that sets `OPENCODE_CONFIG` (and an inline `OPENCODE_CONFIG_CONTENT`) to the managed config and `OPENCODE_CLIENT=cli`, then runs OpenCode.

With **Only opened from CCR**, the config lives in an isolated CCR-managed directory keyed by the profile `id`. With **System default**, CCR writes the real `~/.config/opencode/opencode.jsonc`. The App launches the installed OpenCode Desktop executable with the same effective config.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **OpenCode**.
2. Enter a **Config name** (for example `OpenCode - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Confirm **Provider ID**, **Provider name**, and **OpenCode model**.
5. Adjust the **Config file** and environment variables as needed.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open OpenCode from CCR (terminal button for CLI, play button for App).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **OpenCode** | Tells CCR to write the OpenCode gateway config and wrapper. |
| Config name | Free text, e.g. `OpenCode - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Isolated CCR-managed config vs. the real `~/.config/opencode/opencode.jsonc`. Only one enabled system-default OpenCode profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | Which launch entries (terminal command and/or App) are exposed. |
| Provider ID | Default `claude-code-router` | The provider reference CCR writes into the OpenCode config. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in OpenCode. |
| OpenCode model | A provider model or Fusion model | Default model OpenCode uses through CCR. |
| Config file | Path, default `~/.config/opencode/opencode.jsonc` | Used in **System default** scope; **Only opened from CCR** writes into CCR-managed directories. |
| Environment variables | Key/value rows | Injected into OpenCode CLI, App, and its bot worker. See below. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the OpenCode App entry. |

> **Show all sessions** is not exposed for OpenCode; it is forced off.

## Environment variables

- `CCR_OPENCODE_BIN` / `OPENCODE_BIN` — absolute path to the real `opencode` executable, if it is not on `PATH` in the CCR Desktop process.
- `CCR_OPENCODE_BOT_CWD` — working directory the bot worker runs OpenCode in (it is passed via `opencode run --dir`). Set it to the same project directory currently open in the App when you use a non-default workspace; otherwise the bot defaults to a fresh workspace's filesystem root.
- `CCR_OPENCODE_BOT_AUTO_APPROVE=true` — enables OpenCode's dangerous `--auto` mode for the bot worker. Use only in a trusted environment.
- Variables CCR manages itself (`OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CLIENT`, `CCR_PROFILE_SURFACE`) are reserved — setting them manually has no effect.

## Open and use

- **CLI:** click the terminal button and run the copied command:
  ```text
  ccr-app "OpenCode - Work"
  ```
- **App:** click the play button to open OpenCode Desktop with this profile's config. OpenCode Desktop is single-instance, so CCR stops the managed instance before switching OpenCode profiles.

## Multi-instance

Each profile has its own `id`. With **Only opened from CCR**, OpenCode gets an isolated config file and wrapper. Note the App itself is single-instance, so only one OpenCode App runs at a time; switch profiles from CCR rather than launching a second App.

## AgentClaw (Bot)

With a Bot bound and the App opened from CCR, CCR starts a companion worker next to the App that runs incoming bot messages through the OpenCode CLI and replies in the same conversation. Use `/project list|current|use` to pick a project, then `/session list|current|new|use|reset` to manage sessions. Only these slash-command domains are intercepted. The worker stops when the managed App exits or the profile is switched. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open OpenCode from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened OpenCode from CCR; a directly-opened OpenCode is unaffected unless the scope is **System default**.
- **`opencode` not found:** set `CCR_OPENCODE_BIN` to the real executable path.
- **Bot runs in the wrong directory:** set `CCR_OPENCODE_BOT_CWD` to the project directory open in the App.
- **App did not switch profiles:** OpenCode Desktop is single-instance — switch profiles from CCR, which stops the previous managed instance first.
