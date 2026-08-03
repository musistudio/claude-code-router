---
title: Kimi CLI setup and configuration
pageTitle: Kimi CLI
eyebrow: Detailed configuration
lead: "Connect Kimi CLI to CCR. Kimi CLI is CLI-only and always scoped to CCR-launched sessions. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Kimi CLI is Moonshot's coding agent. In CCR it is **CLI only** and always uses **Only opened from CCR**: CCR does not rewrite your original `~/.kimi-code/config.toml`. Instead it generates a profile-specific Kimi home whose `config.toml` registers a private CCR provider and one model entry per selection, so `/model` switching always stays routed through CCR.

Use this page to route Kimi CLI to any CCR provider or Fusion model, expose several switchable models, or run isolated Kimi CLI sessions.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Kimi CLI is installed (available as `kimi` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects Kimi CLI

When you save a Kimi CLI profile, CCR:

- Creates a profile-specific `KIMI_CODE_HOME` directory under its config tree.
- Generates a `config.toml` in that home defining a private OpenAI-compatible CCR provider (`base_url` = gateway `/v1`, API key = the profile token) and a `[models.<model>]` entry for the default model and every available model, including context window, capabilities, reasoning efforts, and display name.
- Generates a launch **wrapper** that points `KIMI_CODE_HOME` at this home, clears any single-model override variables, then runs Kimi.

The original `~/.kimi-code/config.toml` is never rewritten. CCR reuses available sessions, skills, plugins, MCP configuration, and credentials from the source Kimi home by linking them into the profile home. If CCR Desktop is not running, the wrapper starts a shared temporary gateway and stops it after the last managed Kimi session exits.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Kimi CLI**.
2. Enter a **Config name** (for example `Kimi - Work`).
3. Choose a **Kimi model** (the default) and one or more **Available models**.
4. Add environment variables only if you need a non-default Kimi binary, source home, or custom headers.
5. **Save**, then copy and run the command from the profile card.

## Configuration reference

Kimi CLI is fixed to **Only opened from CCR** and **CLI only**, so those two fields are not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Kimi CLI** | Tells CCR to generate the Kimi home, `config.toml`, and wrapper. |
| Config name | Free text, e.g. `Kimi - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Kimi model | A provider model or Fusion model | The default model (`default_model`). At least one model is required. |
| Available models | One or more provider/Fusion models | Each becomes a `[models.<model>]` entry exposed by Kimi's `/model`. The default model is always included. |
| Environment variables | Key/value rows | Exported into the wrapper. See below. |

## Environment variables

- `CCR_KIMI_BIN` / `KIMI_BIN` — absolute path to the real `kimi` executable, if it is not on `PATH`.
- `CCR_KIMI_SOURCE_HOME` / `KIMI_CODE_HOME` — set the **source** Kimi home CCR reuses sessions/skills/plugins/credentials from (defaults to `~/.kimi-code`).
- `KIMI_CODE_CUSTOM_HEADERS` — newline-separated `Key: Value` lines sent as custom headers on every CCR request from this profile.
- CCR also adds the gateway host to `NO_PROXY`/`no_proxy` automatically; you do not configure this.

> Variables CCR manages itself (`KIMI_CODE_HOME` and the single-model override variables) are reserved — setting them manually has no effect because the wrapper sets or clears them.

## Open and use

Click the terminal button on the profile card and run the copied command:

```text
ccr-app "Kimi - Work"
```

Inside Kimi CLI, use `/model` to switch among the default and available models. Every selection stays routed through CCR's providers, routing, and Fusion.

## Multi-instance

Each profile has its own `id` and its own `KIMI_CODE_HOME`, so multiple Kimi CLI profiles can run at once with different default models or model sets, all without changing your original Kimi configuration.

## Verify

1. Run the `ccr-app` command copied from the profile card.
2. Send one message in Kimi CLI and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.
4. Run `/model` and confirm the default plus available models appear.

## Common issues

- **`/model` is empty or missing models:** add at least one **Available model** (the default counts); confirm a provider + model is configured in CCR.
- **Profile cannot be saved:** Kimi CLI requires both a default model and at least one available model.
- **`kimi` not found:** set `CCR_KIMI_BIN` to the real executable path.
- **Sessions/credentials not reused:** if your Kimi home is not `~/.kimi-code`, set `CCR_KIMI_SOURCE_HOME` (or `KIMI_CODE_HOME`) to the correct source home.
