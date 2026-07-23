---
title: Claude Code Router
pageTitle: Documentation
eyebrow: Product Documentation
lead: Use CCR to connect Claude Code, Codex, Grok CLI, ZCode, and compatible API clients to the model providers you choose. If this is your first visit, get one routed request working before diving into routing, Fusion, Bots, and observability.
---

## Get One Routed Request Working

Start with the shortest successful path:

1. Choose desktop, npm CLI, or Docker from [Install and launch CCR](guides/install/).
2. Open **Providers**, add a preset or custom endpoint, enter an API key, and select at least one model.
3. Open **Agent Profiles**, choose the default model and entry mode for Claude Code, Codex, Grok CLI, or ZCode.
4. Start the local gateway service. The default endpoint is `http://127.0.0.1:3456`.
5. Send one request from your agent, then open **Logs** to confirm the resolved provider, model, status, tokens, and errors.

| Entry | Best for | Next step |
| --- | --- | --- |
| [Desktop app](guides/install/) | Full tray, login import, app launching, and local configuration | Download the app, then finish provider and Agent Profile onboarding |
| [npm CLI](guides/cli/) | Running the gateway and browser management UI without Electron | Run `ccr ui`, then open `http://127.0.0.1:3458` |
| [Docker](guides/docker/) | Containerized or remote-host deployment | Confirm auth and exposed ports before configuring providers |

## Common Next Steps

- Requests are not reaching CCR: start with [Q&A](troubleshooting/) and [Logs & Observability](guides/observability/).
- Route by model, header, or body conditions: read [Routing](configuration/routing/).
- Add vision, web search, or MCP tools to a model: open [Fusion](configuration/fusion-models/).
- Relay an agent through IM or a Bot: start with [Bot setup](configuration/bot-setup/).

## Documentation Structure

The top navigation is split into four standalone pages:

| Page | Contents |
| --- | --- |
| [Documentation](./) | Product positioning, architecture overview, and reading path |
| [Quick Start](guides/) | Desktop, CLI, and Docker installation plus provider and Agent Profile setup |
| [Detailed Configuration](configuration/overview/) | Overview dashboard, API keys, server, providers, routing, Agent Profiles, Fusion, Bots, tray, and config database location |
| [Q&A](troubleshooting/) | Request logs, observability panel, and common questions |

Bot platform guides are child pages under Detailed Configuration. Each platform has its own page so platform dashboard fields, callback URLs, signatures, and FAQs can be expanded independently.
