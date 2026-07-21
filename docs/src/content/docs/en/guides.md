---
title: Claude Code Router quick start
pageTitle: Quick start
eyebrow: Getting started
lead: "The first-run path for CCR: install and start the service, connect a provider, point an agent at the CCR gateway, then confirm requests in logs and on the Observability page."
---

## Install and start CCR

CCR is available as a desktop app, a Node.js 22+ npm CLI, and a single-entrypoint Docker deployment.

| Distribution | Start entry | Default management | Default model gateway |
| --- | --- | --- | --- |
| Desktop | App UI / `ccr-app` | In-app window | `http://127.0.0.1:3456` |
| npm CLI | `ccr ui` / `ccr serve` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | `docker compose up -d --build` | Shared `http://127.0.0.1:3458` | Shared Nginx endpoint |

Use the [installation page](install/) to choose a distribution. See the [CLI reference](cli/) for terminal commands and [Docker deployment](docker/) for container ports, authentication, persistence, and upgrades.

## Add a provider

A provider is the upstream model service CCR forwards requests to, such as OpenRouter, DeepSeek, Z.AI, or any service compatible with the OpenAI, Anthropic, or Gemini protocols.

### Add the provider

1. Open **Providers** and click **Add Provider**.
2. Choose a built-in preset under **Preset providers**. Presets fill common Base URLs, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint**.
4. Fill in **Name**, **Base URL**, **Protocol**, **API Key**, and **Models**.

### Choose a protocol

| Protocol | Best for |
| --- | --- |
| OpenAI Chat Completions | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate Content | Gemini official or Gemini-compatible services |

If you are unsure, run protocol probing in the app first, then use the model connectivity check to confirm.

### Run these checks before saving

1. **Protocol probing**: confirm which protocols the Base URL supports.
2. **Model connectivity check**: send test requests to one or two models.
3. **Account usage test**: if you want balance or quota display, confirm the usage API and field mapping.

Save the provider after these checks pass.

### Multiple keys and the usage panel

For teams or high-frequency usage, add multiple credentials in the provider form and configure priority, weight, and limits. After saving, filter request logs by credential to verify rotation.

If you want the overview to show balance or remaining quota, open the provider's **Account / Usage** section, configure the usage integration, and test field mapping.

## Connect Agent Config

Agent Config lets Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, ZCode, and other agents use CCR's providers, routing, and model selection.

General guidance:

- During trial, prefer **Only opened from CCR** so only agents launched from CCR are affected.
- After it is stable, consider **System default** if you want the agent's default config changed.
- After applying, launch the agent from CCR's **Open Agent** action when possible.

### Claude Code

In **Agent Config**, choose Claude Code, set the model, small fast model, and settings file, then click Apply. Open Claude Code from CCR and send one request to verify it in request logs.

### Codex

In **Agent Config**, choose Codex and confirm Provider ID, Provider Name, model, and config file. Only fill Codex CLI path and Codex home when you need a specific CLI or home directory.

### Grok CLI

Choose Grok CLI and select a default model, then run the copied `ccr-app <profile-name>` command. The command starts a shared temporary gateway service when CCR Desktop is not already serving one; concurrent Grok sessions keep it alive until the last session exits. CCR points Grok model discovery and inference at the local gateway; use `/model` inside Grok to switch CCR models.

### ZCode

ZCode mainly uses model, Provider ID, Provider Name, and whether it is launched from CCR. It launches as an app rather than a CLI and does not need Codex CLI path fields.

### Reuse a locally logged-in agent

If Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, or ZCode is already logged in on this machine, import it as a **Local Agent Provider** from **Providers** to reuse the existing authorization without applying for another key.

## Logs and observability

Open **Settings → Logs & Observability** and enable **Request logs** and **Agent observability**, then send one request to verify: request logs record the request body, response body, resolved model, and errors of each model request, and the Observability page shows the agent's execution trace, tool calls, and timing.

See [Enable logging and observability](guides/observability/) for the full first-run verification steps, and the [logs and observability configuration reference](configuration/observability/) for all switches and page capabilities.
