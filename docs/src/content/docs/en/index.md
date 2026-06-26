---
title: Claude Code Router
pageTitle: Documentation
eyebrow: Product Documentation
lead: Learn what CCR is for, where its boundaries are, and how the docs are organized. Start with Quick Start when you want to configure it; use Detailed Configuration for fields, Bots, or Fusion.
---

## What CCR Can Do

**Claude Code Router (CCR) is a local model gateway.** It sits between agents such as Claude Code, Codex, and ZCode and upstream model services, then centralizes model management, API keys, routing rules, logs, observability, and Bot relay.

CCR is useful when:

- you do not want to maintain the same models and keys separately in every agent.
- you want different tasks to automatically use different models: fast models for lightweight background work, stronger models for complex tasks, and Fusion for image or web-search work.
- you need request logs showing which provider and model handled a request, whether it succeeded, how long it took, and roughly how much it cost.
- you want to forward long-running agent messages to Slack, Telegram, Feishu, WeCom, or other IM platforms.

CCR listens on the local default address `http://localhost:8080`. Once an agent points to this address, CCR can take over the request and forward it to upstream providers according to routing rules.

## Documentation Structure

The top navigation is split into four standalone pages:

| Page | Contents |
| --- | --- |
| [Documentation](./) | Product positioning, architecture overview, and reading path |
| [Quick Start](guides/) | From installation and provider setup to connecting an agent |
| [Detailed Configuration](configuration/) | Providers, routing, Agent Config, Fusion, Bots, and config file location |
| [Q&A](troubleshooting/) | Request logs, observability panel, and common questions |

Bot platform guides are child pages under Detailed Configuration. Each platform has its own page so platform dashboard fields, callback URLs, signatures, and FAQs can be expanded independently.

## Reading Path

If this is your first time using CCR:

1. Start with [Quick Start](guides/) to connect a provider and Agent Config.
2. Use the app's request logs to confirm whether requests are passing through CCR.
3. Open [Detailed Configuration](configuration/) for vision, web search, MCP tools, and IM relay.
4. Use [Q&A](troubleshooting/) for 401, 404, timeout, wrong-routing, or Bot delivery questions.
