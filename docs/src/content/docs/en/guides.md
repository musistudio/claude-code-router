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
2. Choose a built-in preset under **Select preset provider**. Presets fill common API endpoints, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint** and enter a **Name** and **API endpoint**.
4. In the **Add credentials** step, enter the **API key**.

After you enter the API endpoint and key, CCR automatically detects the protocols and models the endpoint supports.

### Protocols

| Protocol | Best for |
| --- | --- |
| OpenAI Chat | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate | Gemini official or Gemini-compatible services |

If auto-detection misses the mark, turn it off in Advanced settings, choose a protocol manually, and confirm with a connectivity check.

### Verify connectivity

Once credentials and models are in place, click **Check Connection** to send a real request that confirms the API endpoint, key, protocol, and models all work. Select only the models you need to confirm to avoid unnecessary usage.

### Multiple keys and usage

For teams or high-frequency usage, switch to the **Credential pool** tab, add multiple upstream keys, and configure priority, weight, and limits. After saving, filter request logs by credential to verify rotation.

If you want the overview to show balance or remaining quota, turn on **Fetch usage** in the form, choose a usage mode, and test the field mapping.

### Reuse a locally logged-in agent

If Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, or ZCode is already logged in on this machine, import it as a **Local Agent Provider** from **Providers** to reuse the existing authorization without applying for another key.

For the full walkthrough and field reference, see [Add a provider](provider/).

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

Choose ZCode and set the **ZCode model**, **Provider ID**, and **Provider Name**. ZCode is a desktop-app agent with entry fixed to **App only**; open it from the play button on the profile card.

## Logs and observability

Open **Settings → Logs & Observability** and enable **Request logs** and **Agent observability**, then send one request to verify: request logs record the request body, response body, resolved model, and errors of each model request, and the Observability page shows the agent's execution trace, tool calls, and timing.

See [Enable logging and observability](observability/) for the full first-run verification steps, and the [logs and observability configuration reference](../configuration/observability/) for all switches and page capabilities.
