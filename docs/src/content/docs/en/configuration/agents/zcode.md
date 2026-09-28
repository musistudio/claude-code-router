---
title: ZCode setup and configuration
pageTitle: ZCode
eyebrow: Detailed configuration
lead: "Connect ZCode to CCR. ZCode is App-only in CCR."
---

## Who this is for

ZCode is a coding agent that runs as a desktop app. In CCR it is **App only**.

Use this page to route ZCode to any CCR provider or Fusion model, or to attach an IM bot.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. The ZCode desktop app is installed and logged in on this machine.
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **ZCode**.
2. Enter a **Config name** (for example `ZCode - Work`).
3. Confirm **Provider ID**, **Provider name**, and **ZCode model**.
4. Adjust advanced settings only if your local setup needs them.
5. If you use AgentClaw, bind a **Bot**.
6. **Save**, then open ZCode from CCR with the play button.

## Configuration reference

ZCode is fixed to **App only**, so the entry mode is not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **ZCode** | Creates a ZCode App launch entry in CCR. |
| Config name | Free text, e.g. `ZCode - Work` | Identifies the profile. Desktop commands use `ccr-app "<name>" app`; CLI commands use `ccr "<name>" app`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Keeps the profile limited to CCR launches, or makes it the system-default ZCode profile. Only one enabled system-default ZCode profile is allowed. |
| Provider ID | Default `claude-code-router` | Provider reference for this ZCode profile. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in ZCode. |
| ZCode model | A provider model or Fusion model | Default model when ZCode App opens. |
| Config file | Path | Used for the system-default ZCode profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |
| Bot | Select a saved Bot | Binds an AgentClaw IM bot to the ZCode App entry. |

## Open and use

Click the play button on the profile card to open ZCode with this profile's model and provider. Reopening the same profile activates the existing window.

Desktop App command copied from the profile card:

```text
ccr-app "ZCode - Work" app
```

For CLI, run:

```text
ccr "ZCode - Work" app
```

## Multi-instance

Create separate ZCode profiles when you want different models or providers.

## AgentClaw (Bot)

With a Bot bound and ZCode opened from CCR, ZCode can relay conversations through the selected IM channel. Closing ZCode App immediately takes the relay offline. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open ZCode from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened ZCode from CCR; reopen it from CCR if it was already running.
- **Wrong model in the App:** confirm the **ZCode model** field.
- **Relay (Bot) went offline:** ZCode App must stay open — closing it takes the relay offline immediately.
