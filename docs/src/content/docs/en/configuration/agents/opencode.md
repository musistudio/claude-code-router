---
title: OpenCode setup and configuration
pageTitle: OpenCode
eyebrow: Detailed configuration
lead: "Connect OpenCode (CLI and App) to CCR."
---

## Who this is for

OpenCode is a coding agent with an OpenAI-compatible provider model. CCR supports both surfaces:

- **OpenCode CLI** — the terminal agent.
- **OpenCode App** — the desktop app.

Use this page to route OpenCode to any CCR provider or Fusion model, or to attach an IM bot to the App.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. OpenCode CLI is installed (available as `opencode` on `PATH`); for App mode, the OpenCode Desktop app is installed.
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **OpenCode**.
2. Enter a **Config name** (for example `OpenCode - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Confirm **Provider ID**, **Provider name**, and **OpenCode model**.
5. Adjust advanced settings only if your local setup needs them.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open OpenCode from CCR (terminal button for CLI, play button for App).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **OpenCode** | Creates OpenCode launch entries in CCR. |
| Config name | Free text, e.g. `OpenCode - Work` | Identifies the profile. Desktop commands use `ccr-app "<name>"`; CLI commands use `ccr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Keeps changes limited to CCR launches, or makes this the system-default OpenCode profile. Only one enabled system-default OpenCode profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | Which launch entries (terminal command and/or App) are exposed. |
| Provider ID | Default `claude-code-router` | Provider reference for this OpenCode profile. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in OpenCode. |
| OpenCode model | A provider model or Fusion model | Default model OpenCode uses through CCR. |
| Config file | Path | Used for the system-default OpenCode profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the OpenCode App entry. |

## Open and use

- **CLI:** click the terminal button in the desktop app and run the copied command:
  ```text
  ccr-app "OpenCode - Work"
  ```
  For CLI, run:
  ```text
  ccr "OpenCode - Work"
  ```
- **App:** click the play button to open OpenCode Desktop with this profile. OpenCode Desktop is single-instance, so CCR switches the active profile for you.

## Multi-instance

Create separate OpenCode profiles when you want different models or providers. The App itself is single-instance, so switch profiles from CCR rather than launching a second App.

## AgentClaw (Bot)

With a Bot bound and the App opened from CCR, OpenCode can relay conversations through the selected IM channel. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open OpenCode from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened OpenCode from CCR; a directly-opened OpenCode is unaffected unless the scope is **System default**.
- **`opencode` not found:** make sure OpenCode CLI is installed and available from the same shell environment used to start CCR Desktop.
- **App did not switch profiles:** OpenCode Desktop is single-instance — switch profiles from CCR.
