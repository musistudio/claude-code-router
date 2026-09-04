---
title: Kilo Code setup and configuration
pageTitle: Kilo Code
eyebrow: Detailed configuration
lead: "Connect Kilo Code to CCR. Kilo Code is CLI-only in CCR."
---

## Who this is for

Kilo Code is a coding agent with an OpenAI-compatible provider model. In CCR it is **CLI only**.

Use this page to route Kilo Code to any CCR provider or Fusion model.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Kilo Code is installed (available as `kilo` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Kilo Code**.
2. Enter a **Config name** (for example `Kilo - Work`).
3. Choose **Effect scope**.
4. Confirm **Provider ID**, **Provider name**, and **Kilo model**.
5. Adjust advanced settings only if your local setup needs them.
6. **Save**, then copy and run the command from the profile card.

## Configuration reference

Kilo Code is fixed to **CLI only**, so the entry mode is not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Kilo Code** | Creates a Kilo Code launch entry in CCR. |
| Config name | Free text, e.g. `Kilo - Work` | Identifies the profile. Desktop commands use `ccr-app "<name>"`; CLI commands use `ccr "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Keeps changes limited to CCR launches, or makes this the system-default Kilo profile. Only one enabled system-default Kilo profile is allowed. |
| Provider ID | Default `claude-code-router` | Provider reference for this Kilo profile. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in Kilo. |
| Kilo model | A provider model or Fusion model | Default model Kilo uses through CCR. |
| Config file | Path | Used for the system-default Kilo profile. |
| Environment variables | Key/value rows | Optional advanced overrides; leave empty for normal use. |

## Open and use

Desktop command copied from the profile card:

```text
ccr-app "Kilo - Work"
```

For CLI, run:

```text
ccr "Kilo - Work"
```

## Multi-instance

Create separate Kilo profiles when you want different models or providers.

## Verify

1. Run the desktop `ccr-app` command copied from the profile card, or the CLI `ccr` command.
2. Send one message in Kilo and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you launched through the CCR profile command; a directly-opened Kilo is unaffected unless the scope is **System default**.
- **`kilo` not found:** make sure Kilo Code is installed and available from the same shell environment used to start CCR Desktop.
- **Wrong model:** confirm the **Kilo model** field resolves to a model CCR can serve.
