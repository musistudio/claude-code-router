---
title: Claude Code setup and configuration
pageTitle: Claude Code
eyebrow: Detailed configuration
lead: "Connect Claude Code (CLI and App) to CCR so every request runs through your providers, routing, and Fusion models."
---

## Who this is for

Claude Code is Anthropic's coding agent. CCR supports both of its surfaces:

- **Claude Code CLI** — the terminal agent.
- **Claude App** — the desktop app.

Use this page when you want to route Claude Code to a non-Anthropic provider, pin a specific model, run several separate Claude Code instances, or attach an IM bot.

> New to CCR? Add a provider and model first, then come back here. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running and at least one provider + model is configured.
2. Claude Code is installed and logged in on this machine, or you will open it from CCR.
3. You are on the **Agent Config** page and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Claude Code**.
2. Enter a **Config name** (for example `Claude Code - Work`).
3. Choose **Effect scope** and **Entry mode**.
4. Select a **Model** (or leave it empty to keep the Claude Code default).
5. Optionally fill in model aliases and advanced settings.
6. If the entry mode includes App and you use AgentClaw, bind a **Bot**.
7. **Save**, then open Claude Code from CCR (terminal button for CLI, play button for App).

## Configuration reference

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Claude Code** | Creates Claude Code launch entries in CCR. |
| Config name | Free text, e.g. `Claude Code - Work` | Identifies the profile in CCR. Desktop commands use `ccr-app "<name>"`; CLI commands use `ccr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and are not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Keeps changes limited to CCR launches, or makes this the system-default Claude Code profile. Only one enabled system-default Claude Code profile is allowed. |
| Entry mode | `CLI & APP` / `CLI only` / `App only` | `CLI & APP` exposes both the terminal command and the App button; `CLI only` only generates a CLI command; `App only` only exposes the App. |
| Model | A provider model or Fusion model, e.g. `Moonshot/kimi-k3` | Default model for this profile. Leave it empty to keep Claude Code's own default model. |
| Fable model | Optional model selector | Overrides the model Claude Code uses for the Fable tier. |
| Opus model | Optional model selector | Overrides the Opus tier. |
| Sonnet model | Optional model selector | Overrides the Sonnet tier. |
| Haiku model | Optional model selector | Overrides the small/fast tier. |
| Settings file | Path | Used for the system-default Claude Code profile. |
| CCR managed compact | Toggle | Lets CCR manage context compaction for this profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |
| Bot | Select a saved Bot (App entry only) | Binds an AgentClaw IM bot to the Claude App entry. CLI does not forward bot messages. |

### Model aliases

Claude Code picks a model per tier. The **Model** field sets the default. The optional **Fable / Opus / Sonnet / Haiku model** fields override each tier individually, so you can, for example, run a strong provider model for Opus while keeping a cheaper one for Haiku. Leave a tier empty to let Claude Code choose it.

### CLI vs App model lists

| Entry | Model list source | Notes |
| --- | --- | --- |
| Claude Code CLI | CCR gateway model discovery | Use `/model` in the CLI to see and switch models exposed by CCR, including Fusion models. |
| Claude App | CCR model list | Open Claude App from CCR to use the model list for this profile. |

## Open and use

- **CLI:** click the terminal button on the desktop profile card and run the copied command:
  ```text
  ccr-app "Claude Code - Work"
  ```
  For CLI, run:
  ```text
  ccr "Claude Code - Work"
  ```
  Inside Claude Code, run `/model` to view and switch the models CCR exposes.
- **App:** click the play button. CCR opens Claude App with this profile. Reopening the same profile activates the existing window.

## Multi-instance

Create separate Claude Code profiles when you want different models, scopes, or bots.

## AgentClaw (Bot)

If you bind a Bot and open Claude App from CCR, Claude App can relay conversations through the selected IM channel. See [AgentClaw](/en/agentclaw/) for the full IM setup.

## Verify

1. Open Claude Code from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the CCR gateway (and which provider/model it used).
4. In the CLI, run `/model` and confirm the CCR-exposed models appear.

## Common issues

- **Requests do not reach CCR:** confirm the profile is **Enabled** and you opened Claude Code from CCR (not from the system). A directly-opened Claude Code is not affected unless the scope is **System default**.
- **`/model` shows no CCR models:** confirm a provider + model is configured.
- **Claude App did not pick up the config:** Claude App is already running — reopen it from CCR, or restart it when prompted.
- **Model aliases have no effect:** aliases only change which provider model a Claude Code tier uses; the value must be a valid `Provider/model` or Fusion model that CCR can serve.
