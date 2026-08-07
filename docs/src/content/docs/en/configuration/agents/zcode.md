---
title: ZCode setup and configuration
pageTitle: ZCode
eyebrow: Detailed configuration
lead: "Connect ZCode to CCR. ZCode is App-only in CCR. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

ZCode is a coding agent that runs as a desktop app. In CCR it is **App only**: CCR writes the ZCode CLI config, v2 config, and model cache, then starts the App with this profile's model, provider, and an isolated user-data directory.

Use this page to route ZCode to any CCR provider or Fusion model, or to attach an IM bot.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. The ZCode desktop app is installed and logged in on this machine.
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects ZCode

When you save a ZCode profile, CCR:

- Writes the ZCode **CLI config** (`~/.zcode/cli/config.json` by default), plus the ZCode v2 config and model cache, based on ZCode home or your custom config file.
- Generates a **middleware launcher** that sets `ZCODE_HOME`/`ZCODE_STORAGE_DIR`, the provider, model, and model catalog, then hands off to the App.
- Starts the App with the current profile's model, provider, and a separate user-data directory.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **ZCode**.
2. Enter a **Config name** (for example `ZCode - Work`).
3. Confirm **Provider ID**, **Provider name**, and **ZCode model**.
4. Adjust the **Config file** and environment variables as needed.
5. If you use AgentClaw, bind a **Bot**.
6. **Save**, then open ZCode from CCR with the play button.

## Configuration reference

ZCode is fixed to **App only**, so the entry mode is not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **ZCode** | Tells CCR to write the ZCode config and start the App. |
| Config name | Free text, e.g. `ZCode - Work` | Identifies the profile and is used in `ccr-app "<name>" app`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Isolated CCR-managed config vs. the real ZCode home config. Only one enabled system-default ZCode profile is allowed. |
| Provider ID | Default `claude-code-router` | The provider reference CCR writes into the ZCode config. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in ZCode. |
| ZCode model | A provider model or Fusion model | Default model when ZCode App opens. |
| Config file | Path, default `~/.zcode/cli/config.json` | CCR also writes the ZCode v2 config and model cache alongside it. |
| Environment variables | Key/value rows | Injected into the ZCode App and the middleware launcher. |
| Bot | Select a saved Bot | Binds an AgentClaw IM bot to the ZCode App entry. |

> **Show all sessions** and **CCR managed compact** are not exposed for ZCode.

## Environment variables

- Any rows are injected into the ZCode App and the middleware launcher.
- Variables CCR manages itself (`ZCODE_HOME`, `ZCODE_STORAGE_DIR`, the `CCR_ZCODE_*` and `CODEXL_ZCODE_*` variables, `CCR_PROFILE_SURFACE`) are reserved — setting them manually has no effect.

## Open and use

Click the play button on the profile card to open ZCode with this profile's model, provider, and isolated user-data directory. Reopening the same profile activates the existing window.

You can also copy the App command from the card:

```text
ccr-app "ZCode - Work" app
```

## Multi-instance

Each profile has its own `id` and a separate user-data directory, so multiple ZCode profiles can run at once with different models or providers.

## AgentClaw (Bot)

With a Bot bound and ZCode opened from CCR, the Codex-compatible companion worker exposes native Session discovery, Project/Session browsing and continuation, queueing, cancellation, model settings, usage, attachments, and diagnostics. Closing ZCode App immediately takes the relay offline. See [AgentClaw](/en/agentclaw/).

## Verify

1. Open ZCode from CCR.
2. Send one message and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you opened ZCode from CCR; reopen it from CCR if it was already running.
- **Wrong model in the App:** confirm the **ZCode model** field.
- **Relay (Bot) went offline:** ZCode App must stay open — closing it takes the relay offline immediately.
