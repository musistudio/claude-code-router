---
title: Claude Code Router
pageTitle: Documentation
eyebrow: Product Documentation
lead: Claude Code Router (CCR) is a local gateway that sits between coding agents and model providers. It manages credentials, routes requests according to configurable rules, provides observability, and supports multi-model fusion and IM bot relay — all through a single control plane.
---

## Architecture Overview

CCR operates as a local HTTP server (default port `8080`). It receives LLM API requests from coding agents and forwards them to configured model providers. All traffic passes through a single process, making routing, credential management, and observability accessible in one place.

```
Agent (Claude Code / Codex / ZCode / …)
        │
        ▼
   CCR (localhost:8080)
        │
        ├──► Provider A (e.g. Anthropic)
        ├──► Provider B (e.g. OpenAI)
        └──► Provider C (e.g. custom OpenAI-compatible endpoint)
```

CCR supports the following provider protocols:

| Protocol | Use case |
|---|---|
| Anthropic Messages API | Anthropic models through native protocol |
| OpenAI-compatible | OpenAI, third-party providers, and self-hosted models that expose an `/v1/chat/completions` endpoint |

Fusion models, described later in this document, allow a base model to be augmented with tools such as web search, vision, or custom MCP tools.

## Prerequisites

Before installing CCR, verify the following:

- **Operating system**: macOS 12+, Windows 10/11, or Linux (x86_64, arm64)
- **Network**: Outbound HTTPS access to model provider APIs (Anthropic, OpenAI, or custom endpoints)
- **Port**: TCP `8080` available on localhost (configurable)
- **Memory**: ~200 MB RAM for the CCR process under typical load
- **Node.js** (optional): Required only when running CCR via CLI (`npx`). The desktop application bundles its own runtime.

## Installation

### Desktop Application

Download the installer for your platform from the [releases page](https://github.com/musistudio/claude-code-router/releases).

- **macOS**: `.dmg` for Intel, `.dmg` for Apple Silicon
- **Windows**: `.exe` installer
- **Linux**: `.AppImage`

After installation, launch CCR. The **Server** page displays the process status. Enable **Auto start** on that page if the process should launch at login.

### Headless / CLI (Alternative)

For server or CI/CD environments, CCR can be installed via npm:

```bash
npm install -g claude-code-router
ccr start
```

When running headless, configuration is managed through the config file (see [Configuration File Format](#configuration-file-format)).

### Configuration File Format

CCR stores its configuration as a JSON file. The default location is:

- **macOS**: `~/Library/Application Support/claude-code-router/config.json`
- **Windows**: `%APPDATA%/claude-code-router/config.json`
- **Linux**: `~/.config/claude-code-router/config.json`

The file is maintained by the desktop UI and can also be edited directly when running headless. Back up this file to version control or a secrets manager for team deployment.

## Quick Start

A minimal working configuration requires three steps:

1. **Add a provider** with valid credentials
2. **Set a default route** pointing to that provider
3. **Point an agent** at `http://localhost:8080`

An agent that sends a request to `http://localhost:8080` will reach the provider selected by the routing rules.

## Configuration

### Providers

A provider is an upstream model service that CCR forwards requests to. CCR needs at least one provider configured.

**Adding a provider:**

1. Open **Providers** from the sidebar.
2. Click **Add Provider**.
3. Select a protocol preset from the dropdown. Presets auto-fill the Base URL for common services:
   - Anthropic (Messages API)
   - OpenAI (`/v1` compatible)
4. Enter the provider URL if not using a preset.
5. (Optional) Add a custom name.

After the provider entry is created, supply credentials.

#### Credentials

Navigate to the **Credentials** tab for the provider. Enter at least one API key.

CCR checks each credential against the provider endpoint and shows a green indicator when the key validates. Validation covers:

- Network reachability of the provider URL
- API key format and authentication response
- Protocol compatibility (HTTP status / JSON structure)

Save only after all listed checks show green.

**Multiple keys**: Add more than one credential to enable round-robin or fallback across keys. CCR cycles through keys on rate-limit responses and provider errors.

**Account page**: The **Account** tab on a provider shows quota and usage when the provider exposes that information through its API. Availability depends on the provider implementation.

#### Provider Options Reference

| Option | Required | Description |
|---|---|---|
| Protocol | Yes | Anthropic Messages or OpenAI-compatible |
| Base URL | Yes | Provider endpoint URL |
| API Key | Yes | Authentication key for the provider |
| Custom Name | No | Display name in the UI and routing rules |

### Routing

Routing rules determine which provider handles each request. CCR evaluates rules in order; the first matching rule wins. If no rule matches, the **Default** route is used.

**Default route** — the fallback model used when no other rule applies. Setting a Default is sufficient for a single-provider setup.

**Rule types:**

| Rule type | Matches on | Example use |
|---|---|---|
| Model name | Exact or prefix match on the `model` field | Route `claude-sonnet-4-*` to Anthropic, `gpt-*` to OpenAI |
| Agent | The agent profile that originated the request | Use a cheaper model for a documentation agent, a larger model for a coding agent |
| Tool | Match requests coming from a specific MCP tool | Route search-tool requests to a provider with web-search capability |
| Fusion | Route based on whether a Fusion model is in use | Direct vision-augmented requests to a multimodal provider |

**Evaluation order**: Rules are evaluated top-to-bottom. Reorder rules by dragging. The Default route is always evaluated last.

**Verification**: After saving a routing configuration, send a request from any connected agent. Open **Logs** and confirm the request appears with the expected provider and model.

### Profiles

A Profile packages an agent's connection settings — endpoint URL, API key, and optional capabilities such as Bot relay.

**Supported agents:**

- **Claude Code**: Set the environment variable `ANTHROPIC_BASE_URL=http://localhost:8080` before launching Claude Code. CCR provides a one-click import that writes this configuration.
- **Codex (OpenAI Codex CLI)**: Set `OPENAI_BASE_URL=http://localhost:8080` and `OPENAI_API_KEY=ccr` (or any non-empty value — CCR authenticates by credential, not by agent key).
- **ZCode**: Configure the base URL to `http://localhost:8080` in ZCode settings.
- **Generic OpenAI-compatible agent**: Any tool that accepts a custom base URL and API key.

**Profile options:**

| Option | Description |
|---|---|
| Base URL | Must point to `http://localhost:8080` (or the host/port where CCR is listening) |
| API Key | For CCR, any non-empty value. CCR does not authenticate agents by this key — credentials are managed on the provider side |
| Bot | Enable to relay agent messages to IM platforms |

After applying a Profile, launch the agent through CCR's **Open Agent** button. This ensures Bot and other CCR-managed capabilities are injected correctly.

## Observability

### Overview

The **Overview** page displays aggregate metrics for traffic passing through CCR:

| Widget | What it shows |
|---|---|
| Request volume | Total requests, grouped by time window |
| Latency distribution | P50 / P95 / P99 response times per provider |
| Token usage | Input and output token counts, per provider and model |
| Error rate | Percentage of non-2xx responses, per provider |
| Cost estimate | Approximate spend based on provider pricing tables |

Overview widgets are intended for monitoring trends and spotting anomalies. For investigating a single failed request, use Logs.

### Logs

The **Logs** page records every request and response that passes through CCR. Each entry includes:

- Timestamp
- Agent that sent the request
- Provider and model that served it
- Request payload (truncatable)
- Response payload (truncatable)
- HTTP status code
- Latency in milliseconds

**Filtering**: Filter by time range, agent, provider, model, or status code.

**Network capture**: Enable **Capture network** in Logs settings to record raw HTTP exchanges. This is useful for debugging protocol-level issues with custom providers. Disable capture when not actively debugging — captured payloads include API keys in headers.

## Fusion Models

A Fusion model combines a base model with one or more tool capabilities to create a new model option that appears in the routing model picker.

**Available augmentations:**

| Augmentation | Description |
|---|---|
| Vision | Adds image understanding via screen capture or file attachment |
| Web search | Adds live web search results to model context |
| MCP tool | Attaches a custom MCP server tool to the model |

**Creating a Fusion model:**

1. Open **Fusion** from the sidebar.
2. Select a base model — the provider and model that will handle the core request.
3. Add one or more augmentations.
4. Name the resulting Fusion model.
5. Save.

The Fusion model appears as a selectable model in routing rules. When an agent requests that model, CCR invokes the base model with the attached tools, combining outputs into a single response.

**Validation**: Test a Fusion model with a dedicated Profile before using it in production routing. For vision Fusion, verify with a screenshot. For web search, verify with a query whose answer depends on current information.

## Bots (IM Relay)

Bots forward agent messages to instant-messaging platforms and can hand off active tasks to a mobile device when the desktop is idle.

### Modes

| Mode | Behavior |
|---|---|
| **Forward** | Every agent message is forwarded to the configured IM channel |
| **Handoff** | Messages are forwarded only after the desktop has been idle for the configured duration (see **Idle seconds** in Profile settings) |

### Setup

1. Open **Bots** from the sidebar.
2. Click **Add Bot** and select the target platform.
3. Provide the required credentials for that platform.
4. Save the Bot.
5. Open the target Agent Profile, enable **Bot**, select the Bot, and choose Forward or Handoff.
6. Reopen the agent from CCR.

### Supported Platforms

CCR supports the following IM platforms for Bot relay. Each requires platform-specific setup described in its dedicated page:

- [DingTalk](relay-agents-in-im-with-bots/dingtalk)
- [Discord](relay-agents-in-im-with-bots/discord)
- [Feishu (Lark)](relay-agents-in-im-with-bots/feishu)
- [LINE](relay-agents-in-im-with-bots/line)
- [Slack](relay-agents-in-im-with-bots/slack)
- [Telegram](relay-agents-in-im-with-bots/telegram)
- [WeCom (Enterprise WeChat)](relay-agents-in-im-with-bots/wecom)
- [Weixin (iLink)](relay-agents-in-im-with-bots/weixin-ilink)

Each platform page covers: required credentials, where to obtain them in the platform's developer console, and common troubleshooting steps.

## Troubleshooting

### Diagnostic Entry Points

When a request does not behave as expected, investigate in the following order:

1. **Logs** — confirm the request reached CCR, identify the provider and model it was routed to, and check the HTTP status code
2. **Overview** — check error rate and latency for the provider to see if the issue is systemic
3. **Network capture** — enable for raw request/response inspection when Logs do not contain enough detail

### Common Symptoms

| Symptom | Likely cause | Check |
|---|---|---|
| Agent cannot connect to CCR | CCR process not running, port conflict, or firewall | Confirm the Server page shows "Running". Verify port `8080` is not in use by another process. Check firewall rules. |
| Request reaches CCR but returns 5xx | Provider credentials invalid or expired | Open the provider's **Credentials** tab and verify the key validates (green indicator). Rotate the key if needed. |
| Request returns 4xx | Model name not recognized by provider, or protocol mismatch | Verify the model name in the request matches a model the provider supports. Confirm the provider protocol is correct. |
| Request routed to unexpected provider | Routing rule order or Default route misconfigured | Open **Routing** and review rule order. Check that no higher-priority rule matches the request unintentionally. |
| High latency | Provider overloaded, network path, or large payload | Check latency distribution in **Overview**. Test the provider directly (outside CCR) to isolate the issue. |
| Bot does not receive messages | Bot credentials invalid, platform-side configuration incomplete, or agent not reopened after Bot toggle | Verify Bot fields in **Bots** page. Revisit the platform-specific setup guide. Reopen the agent from CCR. |
| Fusion model error | Base model does not support the augmentation, or augmentation tool unavailable | Test the base model directly first. For web search, verify the search service is reachable. For MCP Fusion, confirm the MCP server is running. |
| Handoff does not trigger | Idle detection not working, or Handoff selected but Forward intended | Verify **Idle seconds** is set. Confirm Handoff vs Forward setting in the Profile. |
| Rate limiting from provider | Too many concurrent requests on a single key | Add additional credentials to the provider for CCR to cycle through. |

### Network Capture

Network capture records every HTTP request and response at the wire level. Enable it in **Logs settings** → **Capture network**.

**Security note**: Captured data includes API keys in request headers. Delete capture files after debugging and do not commit them to version control.

## Operational Best Practices

- **Rotate API keys regularly.** Use provider dashboards to issue new keys and retire old ones. Update CCR credentials immediately.
- **Test routing changes with a dedicated Profile** before modifying the Default route or rules used by production agents.
- **Review Logs periodically** even when nothing is broken — it surfaces slow providers, unexpected model usage, and credential issues before they escalate.
- **Maintain spare credentials.** Having a second key for each provider prevents a single key rotation from blocking all traffic.
- **Back up the config file.** The config JSON contains all provider entries, routing rules, and Bot configurations. Store it securely.
- **Audit Fusion and Bot configurations** after CCR upgrades. New versions may introduce additional capabilities or change default behavior.

## Reference

### Configuration File Format

CCR stores its configuration as a JSON file at the OS-specific path listed in [Configuration File Format](#configuration-file-format). The file is structured as follows:

```json
{
  "version": 3,
  "port": 8080,
  "providers": [
    {
      "id": "uuid",
      "name": "Anthropic",
      "protocol": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "credentials": [
        { "key": "sk-ant-...", "label": "primary" }
      ]
    }
  ],
  "routing": {
    "default": "claude-sonnet-4-20250514",
    "rules": []
  },
  "profiles": [],
  "bots": [],
  "fusionModels": []
}
```

When editing the file directly, restart CCR for changes to take effect. The desktop UI writes changes back to this file on every **Save** or **Apply** action.

### Environment Variables

| Variable | Purpose |
|---|---|
| `CCR_PORT` | Override the default listen port (default: `8080`) |
| `CCR_CONFIG_PATH` | Override the config file location |
| `CCR_LOG_LEVEL` | Set log verbosity: `debug`, `info`, `warn`, `error` (default: `info`) |

### Supported Model Providers

CCR is compatible with any provider that exposes an Anthropic Messages API or OpenAI-compatible `/v1/chat/completions` endpoint. This includes, but is not limited to:

- Anthropic
- OpenAI
- Azure OpenAI
- Google Vertex AI (via OpenAI-compatible adapter)
- AWS Bedrock (via OpenAI-compatible adapter)
- OpenRouter
- Self-hosted models (vLLM, Ollama, llama.cpp server)

### Version

This documentation applies to CCR v3.0.0 and later. Refer to the [GitHub releases page](https://github.com/musistudio/claude-code-router/releases) for changelogs and upgrade notes.
