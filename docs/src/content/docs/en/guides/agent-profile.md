---
title: Connect Agent Config
pageTitle: Connect Agent Config
eyebrow: Quick start
lead: "The interactive panel at the top of this page connects to your running CCR to set a default model for Claude Code / Codex. The steps below cover adding a profile in Agent Config, picking a model, opening the agent from CCR, and verifying it in request logs."
---

## General guidance

- In **Agent Config**, click **Add Profile**, choose your agent, and enter a **Profile name**.
- During trial, prefer **Only opened from CCR** (the default) so only agents launched from CCR are affected; switch to **System default** once it is stable.
- Claude Code and Codex let you choose an **Entry mode** (CLI & APP / CLI only / App only); Grok CLI and Kimi CLI are CLI-only, and ZCode and WorkBuddy are App-only.
- After saving, launch the agent from the buttons on its profile card (the terminal button opens the CLI, the play button opens the app), then verify with one request in **Request logs**.
- Command names differ by distribution: the desktop app copies `ccr-app ...`; CLI uses `ccr ...` with the same profile name and optional `cli` / `app` suffix.

## Claude Code

Supports both CLI and App.

1. **Add Profile** → choose **Claude Code**, enter a **Profile name**, and pick a **Scope** and **Entry mode**.
2. Choose a **Model** (leave blank to keep Claude Code's default).
3. **Save**, then open the CLI with the terminal button or the Claude App with the play button.
4. Send a message to confirm it replies, and check **Request logs** to verify the request went through the gateway; use `/model` in the CLI to list and switch CCR-exposed models.

For tier models and advanced settings, see [Claude Code setup and configuration](../../configuration/agents/claude-code/).

## Codex

Supports both Codex CLI and the ChatGPT desktop app.

1. **Add Profile** → choose **Codex**, enter a **Profile name**, and pick a **Scope** and **Entry mode**.
2. Confirm the **Provider ID**, **Provider Name**, and **Codex model**.
3. **Save**, then open the CLI with the terminal button or ChatGPT with the play button.
4. Send a message to confirm it replies, and check **Request logs** to verify the request went through the gateway.

For Codex-specific fields, see [Codex setup and configuration](../../configuration/agents/codex/).

## Grok CLI

CLI-only, always scoped to **Only opened from CCR** — your global Grok config is left untouched.

1. **Add Profile** → choose **Grok CLI**, enter a **Profile name**.
2. Choose a **Model**.
3. **Save**, then run the profile command: desktop card `ccr-app "<profile-name>"`, or CLI `ccr "<profile-name>"`.
4. Send a message in Grok to confirm it replies, and check **Request logs** to verify the request went through the gateway; use `/model` to switch CCR-exposed models.

For all fields, see [Grok CLI setup and configuration](../../configuration/agents/grok/).

## Kimi CLI

CLI-only, always scoped to **Only opened from CCR**.

1. **Add Profile** → choose **Kimi CLI**, enter a **Profile name**.
2. Choose a **Kimi model** (the default) and one or more **Available models**.
3. **Save**, then run the profile command: desktop card `ccr-app "<profile-name>"`, or CLI `ccr "<profile-name>"`.
4. Send a message in Kimi to confirm it replies, and check **Request logs** to verify the request went through the gateway; use `/model` to switch between the default and available models.

For all fields, see [Kimi CLI setup and configuration](../../configuration/agents/kimi/).

## ZCode

App-only (entry fixed to **App only**).

1. **Add Profile** → choose **ZCode**, enter a **Profile name**.
2. Confirm the **ZCode model**, **Provider ID**, and **Provider Name**.
3. **Save**, then open ZCode with the play button (opening again activates the existing window).
4. Send a message to confirm it replies, and check **Request logs** to verify the request went through the gateway.

For a field-by-field reference and advanced topics like multiple instances and bot binding, see [ZCode setup and configuration](../../configuration/agents/zcode/).

## WorkBuddy

App-only (entry fixed to **App only**).

1. **Add Profile** → choose **WorkBuddy**, enter a **Profile name**.
2. Confirm the **WorkBuddy model**, **Provider ID**, and **Provider Name**.
3. Optionally restrict **Allowed model list**. Leave it empty to make every CCR model available in WorkBuddy.
4. **Save**, then open WorkBuddy with the play button.
5. Send a message to confirm it replies, and check **Request logs** to verify the request went through the gateway.

For APP_PATH, multiple profiles, and bot binding, see [WorkBuddy setup and configuration](../../configuration/agents/workbuddy/).

## OpenCode

Supports both OpenCode CLI and the desktop app.

1. **Add Profile** → choose **OpenCode**, enter a **Profile name**, and pick a **Scope** and **Entry mode**.
2. Confirm the **Provider ID**, **Provider Name**, and **OpenCode model**.
3. **Save**, then open the CLI with the terminal button, or open the OpenCode desktop app via CCR Desktop with the play button.
4. Send a message to confirm it replies, and check **Request logs** to verify the request went through the gateway.

For OpenCode-specific fields, see [OpenCode setup and configuration](../../configuration/agents/opencode/).
