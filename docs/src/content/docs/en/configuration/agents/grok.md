---
title: Grok CLI setup and configuration
pageTitle: Grok CLI
eyebrow: Detailed configuration
lead: "Connect Grok CLI to CCR. Grok CLI is CLI-only and always scoped to CCR-launched sessions. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Grok CLI is xAI's coding agent. In CCR it is **CLI only** and always uses **Only opened from CCR**: CCR does not rewrite your global Grok config. Instead it generates a launch wrapper and an isolated Grok home for each profile, so inference always uses the CCR key and model gateway.

Use this page to route Grok CLI to any CCR provider or Fusion model, or to run several isolated Grok CLI sessions.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Grok CLI is installed (available as `grok` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects Grok CLI

When you save a Grok CLI profile, CCR generates a launch **wrapper** in its `bin` directory that exports:

- `GROK_MODELS_BASE_URL` and `GROK_MODELS_LIST_URL` → the CCR gateway `/v1` endpoints.
- `XAI_API_KEY` → this profile's CCR API key.
- `GROK_DEFAULT_MODEL` → your selected model.
- `GROK_HOME` → a profile-specific directory.

It also points `GROK_HOME` at a profile-specific home. That home starts as a private copy of your source Grok home's `config.toml`, while `auth.json` is excluded so a local xAI OAuth token cannot override the CCR key. Plugins, skills, sessions, and other home entries stay linked to the original Grok home.

If the CCR Desktop gateway is not running when you launch, `ccr-app` starts a shared temporary gateway service and stops it after the last concurrent Grok session exits.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Grok CLI**.
2. Enter a **Config name** (for example `Grok - Work`).
3. Select a **Model**.
4. Add environment variables only if you need a non-default Grok binary or source home.
5. **Save**, then copy and run the command from the profile card.

## Configuration reference

Grok CLI is fixed to **Only opened from CCR** and **CLI only**, so those two fields are not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Grok CLI** | Tells CCR to generate the Grok wrapper and isolated home. |
| Config name | Free text, e.g. `Grok - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Model | A provider model or Fusion model | Writes `GROK_DEFAULT_MODEL`, the model Grok CLI uses at startup. |
| Environment variables | Key/value rows | Exported into the wrapper. See below. |

## Environment variables

- `CCR_GROK_BIN` — absolute path to the real `grok` executable, if it is not on `PATH` in the CCR Desktop process.
- `GROK_HOME` / `GROK_STORAGE_DIR` / `GROK_CONFIG_DIR` — set the **source** Grok home CCR copies `config.toml` from (defaults to `~/.grok`). Use this only when your Grok home lives somewhere non-standard.
- CCR also adds the gateway host to `NO_PROXY`/`no_proxy` automatically so Grok talks to the local gateway directly; you do not configure this.

> Variables CCR manages itself (`GROK_MODELS_BASE_URL`, `GROK_MODELS_LIST_URL`, `GROK_DEFAULT_MODEL`, `GROK_HOME`, `XAI_API_KEY`, etc.) are reserved — setting them manually in the profile env has no effect because the wrapper overwrites them.

## Open and use

Click the terminal button on the profile card and run the copied command:

```text
ccr-app "Grok - Work"
```

Inside Grok CLI, use `/model` to switch among the provider and Fusion models CCR returns; switched requests still go through CCR.

## Multi-instance

Each profile has its own `id` and its own isolated `GROK_HOME`, so multiple Grok CLI profiles can run at once with different models or separate session histories, all without touching your original `~/.grok`.

## Verify

1. Run the `ccr-app` command copied from the profile card.
2. Send one message in Grok CLI and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.
4. Run `/model` and confirm the CCR-exposed models appear.

## Common issues

- **Grok uses your xAI account instead of CCR:** the profile home excludes `auth.json` by design; confirm you launched via `ccr-app` and not a directly-opened `grok`.
- **`grok` not found:** set `CCR_GROK_BIN` to the real executable path.
- **`/model` shows no CCR models:** confirm a provider + model is configured in CCR, and that the gateway is reachable (the temp gateway starts only while a managed session is running).
- **Wrong source config copied:** if your Grok home is not `~/.grok`, set `GROK_HOME` (or `GROK_STORAGE_DIR` / `GROK_CONFIG_DIR`) to the correct source home.
