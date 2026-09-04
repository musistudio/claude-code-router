---
title: Grok CLI setup and configuration
pageTitle: Grok CLI
eyebrow: Detailed configuration
lead: "Connect Grok CLI to CCR. Grok CLI is CLI-only and always scoped to CCR-launched sessions."
---

## Who this is for

Grok CLI is xAI's coding agent. In CCR it is **CLI only** and always uses **Only opened from CCR**.

Use this page to route Grok CLI to any CCR provider or Fusion model, or to run several separate Grok CLI sessions.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Grok CLI is installed (available as `grok` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Grok CLI**.
2. Enter a **Config name** (for example `Grok - Work`).
3. Select a **Model**.
4. Leave advanced environment settings empty unless you have a specific local setup need.
5. **Save**, then copy and run the command from the profile card.

## Configuration reference

Grok CLI is fixed to **Only opened from CCR** and **CLI only**, so those two fields are not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Grok CLI** | Creates a Grok CLI launch entry in CCR. |
| Config name | Free text, e.g. `Grok - Work` | Identifies the profile. Desktop commands use `ccr-app "<name>"`; CLI commands use `ccr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Model | A provider model or Fusion model | The model Grok CLI uses at startup. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |

## Open and use

Desktop command copied from the profile card:

```text
ccr-app "Grok - Work"
```

For CLI, run:

```text
ccr "Grok - Work"
```

Inside Grok CLI, use `/model` to switch among the provider and Fusion models CCR returns; switched requests still go through CCR.

## Multi-instance

Create separate Grok CLI profiles when you want separate launch entries with different models.

## Verify

1. Run the desktop `ccr-app` command copied from the profile card, or the CLI `ccr` command.
2. Send one message in Grok CLI and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.
4. Run `/model` and confirm the CCR-exposed models appear.

## Common issues

- **Grok uses your xAI account instead of CCR:** confirm you launched Grok from the CCR profile card.
- **`grok` not found:** make sure Grok CLI is installed and available from the same shell environment used to start CCR Desktop.
- **`/model` shows no CCR models:** confirm a provider + model is configured in CCR.
