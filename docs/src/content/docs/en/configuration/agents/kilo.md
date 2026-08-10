---
title: Kilo Code setup and configuration
pageTitle: Kilo Code
eyebrow: Detailed configuration
lead: "Connect Kilo Code to CCR. Kilo Code is CLI-only in CCR. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Kilo Code is a coding agent with an OpenAI-compatible provider model. In CCR it is **CLI only**: CCR writes a managed gateway provider into Kilo's JSONC config and opens the CLI through a wrapper that points Kilo at CCR.

Use this page to route Kilo Code to any CCR provider or Fusion model.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Kilo Code is installed (available as `kilo` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects Kilo Code

When you save a Kilo Code profile, CCR:

- Writes a managed gateway provider into the Kilo **config file** (`kilo.jsonc`) that points Kilo at the CCR gateway with this profile's token and selected model.
- Generates a launch **wrapper** that sets `KILO_CONFIG` (and an inline `KILO_CONFIG_CONTENT`) to the managed config, then runs Kilo.

With **Only opened from CCR**, the config lives in an isolated CCR-managed directory keyed by the profile `id`. With **System default**, CCR writes the real `~/.config/kilo/kilo.jsonc`.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Kilo Code**.
2. Enter a **Config name** (for example `Kilo - Work`).
3. Choose **Effect scope**.
4. Confirm **Provider ID**, **Provider name**, and **Kilo model**.
5. Adjust the **Config file** and environment variables as needed.
6. **Save**, then copy and run the command from the profile card.

## Configuration reference

Kilo Code is fixed to **CLI only**, so the entry mode is not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Kilo Code** | Tells CCR to write the Kilo gateway config and wrapper. |
| Config name | Free text, e.g. `Kilo - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Effect scope | `Only opened from CCR` / `System default` | Isolated CCR-managed config vs. the real `~/.config/kilo/kilo.jsonc`. Only one enabled system-default Kilo profile is allowed. |
| Provider ID | Default `claude-code-router` | The provider reference CCR writes into the Kilo config. |
| Provider name | Free text; default `Claude Code Router` | Display name shown in Kilo. |
| Kilo model | A provider model or Fusion model | Default model Kilo uses through CCR. |
| Config file | Path, default `~/.config/kilo/kilo.jsonc` | Used in **System default** scope; **Only opened from CCR** writes into CCR-managed directories. |
| Environment variables | Key/value rows | Exported into the wrapper. See below. |

> **Show all sessions** is not exposed for Kilo Code; it is forced off.

## Environment variables

- `CCR_KILO_BIN` / `KILO_BIN` — absolute path to the real `kilo` executable, if it is not on `PATH` in the CCR Desktop process.
- Any other rows are exported into the launch wrapper.
- Variables CCR manages itself (`KILO_CONFIG`, `KILO_CONFIG_CONTENT`, `CCR_PROFILE_SURFACE`) are reserved — setting them manually has no effect.

## Open and use

Click the terminal button on the profile card and run the copied command:

```text
ccr-app "Kilo - Work"
```

## Multi-instance

Each profile has its own `id`. With **Only opened from CCR**, Kilo gets an isolated config file and wrapper, so several Kilo profiles can run at once with different models or providers.

## Verify

1. Run the `ccr-app` command copied from the profile card.
2. Send one message in Kilo and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Requests bypass CCR:** confirm the profile is **Enabled** and you launched via `ccr-app`; a directly-opened Kilo is unaffected unless the scope is **System default**.
- **`kilo` not found:** set `CCR_KILO_BIN` to the real executable path.
- **Wrong model:** confirm the **Kilo model** field resolves to a model CCR can serve.
