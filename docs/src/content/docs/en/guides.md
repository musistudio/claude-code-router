---
title: Claude Code Router Quick Start
pageTitle: Quick Start
eyebrow: Getting Started
lead: Start from installation, connect a provider, let agents send requests through CCR, and confirm the path through logs and observability.
---

## Install And Start CCR

### Download And Install

1. Open the [GitHub Releases](https://github.com/musistudio/claude-code-router/releases) page.
2. Download the package for your system: `.dmg` or `.zip` for macOS, `.exe` for Windows, and `.AppImage` for Linux.
3. Install and open **Claude Code Router** like a normal desktop app.

### Start The Service

Open the **Server** page and click **Start**. After the page shows Running, CCR listens on the default local address `http://localhost:8080`.

If you want the service to start when the app opens, enable **Auto start** on the Server page.

## Add A Provider

A provider is the upstream model service CCR forwards requests to, such as OpenRouter, DeepSeek, Z.AI, or any service compatible with the OpenAI, Anthropic, or Gemini protocols.

### Add The Provider

1. Open **Providers** and click **Add Provider**.
2. Choose a built-in preset under **Preset providers**. Presets fill common Base URLs, protocols, and icons automatically.
3. If the service is not listed, choose **Other / custom API endpoint**.
4. Fill in **Name**, **Base URL**, **Protocol**, **API Key**, and **Models**.

### Choose A Protocol

| Protocol | Best For |
| --- | --- |
| OpenAI Chat Completions | Most OpenAI-compatible services |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic official or Anthropic-compatible services |
| Gemini Generate Content | Gemini official or Gemini-compatible services |

If you are unsure, run protocol probing in the app first, then use the model connectivity check to confirm.

### Check These Before Saving

1. **Protocol probing**: confirm which protocols the Base URL supports.
2. **Model connectivity check**: send test requests to one or two models.
3. **Account usage test**: if you want balance or quota display, confirm the usage API and field mapping.

Save the provider after these checks pass.

### Multiple Keys And Usage Panel

For teams or high-frequency usage, add multiple credentials in the provider form and configure priority, weight, and limits. After saving, filter request logs by credential to verify rotation.

If you want the overview to show balance or remaining quota, open the provider's **Account / Usage** section, configure the usage integration, and test field mapping.

## Connect Agent Config

Agent Config lets Claude Code, Codex, Grok CLI, ZCode, and other agents use CCR's providers, routing, and model selection.

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

ZCode mainly uses model, Provider ID, Provider Name, and whether it is launched from CCR. It uses the App surface and does not need Codex CLI path fields.

### Reuse A Locally Logged-In Agent

If Claude Code, Codex, Grok CLI, or ZCode is already logged in on this machine, import it as a **Local Agent Provider** from **Providers** to reuse the existing authorization without applying for another key.

## Logs & Observability

### Enable The Switches

Open **Settings → Logs & Observability**:

1. Enable **Request logs**.
2. Enable **Agent observability**.

### View The Observability Panel

The observability panel is for inspecting an agent's execution trace and performance: when each step happened, which tool it called, what result the tool returned, how long it took, whether it failed, and how the following steps continued.

It helps diagnose stuck agents, unexpected tool results, slow steps, or context flow that does not match expectations. Request logs provide request bodies, response bodies, and error details for individual model requests.

### Request Logs

Request logs record model request details passing through CCR, including request time, request ID, client, path, requested model, final provider and model, credential, status code, duration, tokens, cost estimate, request body, response body, and errors.

The Logs page supports filtering by status, provider, model, credential, request ID, model name, request body, or response body. A single record shows the main request and response fields, including `request model`, `resolved provider`, `resolved model`, status code, response body, errors, duration, tokens, and cost estimate.

Regular request logs are kept locally for the current day. When the local date changes, the next request-log read or write cleans up the previous day's regular logs.
