---
title: Pi setup and configuration
pageTitle: Pi
eyebrow: Detailed configuration
lead: "Connect Pi to CCR. Pi is CLI-only and always scoped to CCR-launched sessions. This page covers every Agent Config field: how to set it and what effect it has."
---

## Who this is for

Pi is a coding agent that selects its provider and model from the command line. In CCR it is **CLI only** and always uses **Only opened from CCR**: CCR generates a launch wrapper that runs Pi against the CCR gateway with your chosen provider and model.

Use this page to route Pi to any CCR provider or Fusion model, or to run isolated Pi sessions.

> New to CCR? Add a provider and model first. See [Add a provider](/en/guides/provider/) and the [Agent Config overview](/en/configuration/profiles/).

## Prerequisites

1. CCR Desktop is running with at least one provider + model configured.
2. Pi is installed (available as `pi` on `PATH`).
3. You are on **Agent Config** and click **Add profile**.

## How CCR connects Pi

When you save a Pi profile, CCR:

- Writes a managed gateway config under a profile-specific Pi agent directory (`PI_CODING_AGENT_DIR`, by default under `~/.pi/agent`).
- Generates a launch **wrapper** that sets `PI_CODING_AGENT_DIR` and a separate session directory, disables the Pi version check, then runs `pi --provider <provider> --model <model>` against the CCR gateway.

If the CCR Desktop gateway is not running when you launch, `ccr-app` starts a shared temporary gateway service and stops it after the last concurrent Pi session exits.

## Create the profile

1. On **Agent Config**, click **Add profile** and choose **Pi**.
2. Enter a **Config name** (for example `Pi - Work`).
3. Select a **Model**.
4. Add environment variables only if you need a non-default Pi binary or want to re-enable the version check.
5. **Save**, then copy and run the command from the profile card.

## Configuration reference

Pi is fixed to **Only opened from CCR** and **CLI only**, so those two fields are not editable. The fields you configure are:

| Field | How to set it | Effect |
| --- | --- | --- |
| Agent | Choose **Pi** | Tells CCR to generate the Pi agent directory, gateway config, and wrapper. |
| Config name | Free text, e.g. `Pi - Work` | Identifies the profile and is used in `ccr-app "<name>"`. |
| Enabled | Toggle on/off | Disabled profiles are not applied and not offered as launch entries. |
| Model | A provider model or Fusion model | Passed to Pi as `--model`; the model Pi uses for every turn. |
| Environment variables | Key/value rows | Exported into the wrapper. See below. |

## Environment variables

- `CCR_PI_BIN` / `PI_BIN` — absolute path to the real `pi` executable, if it is not on `PATH` in the CCR Desktop process.
- `PI_SKIP_VERSION_CHECK` — defaults to `1` (version check skipped) so the wrapper starts cleanly. Set it to another value only if you intentionally want the check.
- CCR also adds the gateway host to `NO_PROXY`/`no_proxy` automatically so Pi talks to the local gateway directly; you do not configure this.

> Variables CCR manages itself (`PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, `CCR_PROFILE_SURFACE`) are reserved — setting them manually has no effect.

## Open and use

Click the terminal button on the profile card and run the copied command:

```text
ccr-app "Pi - Work"
```

## Multi-instance

Each profile has its own `id` and its own `PI_CODING_AGENT_DIR` and session directory, so multiple Pi profiles can run at once with different models or separate session histories.

## Verify

1. Run the `ccr-app` command copied from the profile card.
2. Send one message in Pi and confirm it replies.
3. Open **Request logs** in CCR and confirm the request passed through the gateway.

## Common issues

- **Pi uses a different model than expected:** confirm the **Model** field; the wrapper always passes it as `--model`.
- **`pi` not found:** set `CCR_PI_BIN` to the real executable path.
- **Version-check prompt on startup:** this is expected to be skipped; if it appears, leave `PI_SKIP_VERSION_CHECK` at its default.
- **`/model` or model list is empty:** Pi does not use a `/model` list — set the exact **Model** you want on the profile.
