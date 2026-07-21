---
title: Claude Code Router
pageTitle: Claude Code Router documentation
eyebrow: Product Documentation
lead: "Covers what CCR does, how the docs are organized, and the recommended reading order. Start here if you are new to CCR."
---

## What CCR can do

CCR is a model gateway that runs locally (or on your own server): it receives requests from agents like Claude Code and Codex, forwards them to any provider according to your routing config, and logs everything. Core capabilities:

- **Connect any provider**: OpenRouter, DeepSeek, Z.AI, or any service compatible with the OpenAI, Anthropic, or Gemini APIs, with multi-key rotation and usage tracking.
- **Smart routing**: pick models with conditional rules, rewrite requests, retry on failure, and fall back to backup models; Claude Code Subagents and Workflows can pick different models automatically.
- **Fusion models**: combine a text model with vision, web search, image generation, video generation, or custom MCP tools into a new model.
- **ToolHub**: collapse many MCP servers into one dynamic tool-resolution entry point.
- **AgentClaw**: turn an agent on your machine into a bot reachable from Slack, Discord, Weixin, and other IM platforms.
- **Logs and observability**: request logs record the provider, model, latency, tokens, and cost of every request; the Observability page shows each agent's execution trace.

## Documentation structure

The top-level nav holds Quick start, Detailed configuration, the featured capabilities (Fusion, ToolHub, Routing, One-click import, Extensions, AgentClaw), and Q&A; click the site logo to return to this home page:

| Page | Contents |
| --- | --- |
| [Documentation](./) | What CCR does, the doc structure, and the reading path |
| [Quick start](guides/) | Desktop, CLI, and Docker installation, plus provider and Agent Config setup |
| [Detailed configuration](configuration/overview/) | Overview dashboard, providers, Agent Config, API keys, logs and observability, server, tray, and config database location |
| [Fusion](fusion/) | Combine a base model with vision, web search, MCP tools, image generation, or video generation into a new model |
| [ToolHub](toolhub/) | Collapse many MCP servers into one dynamic tool-resolution entry point |
| [Routing](routing/) | Control every request with built-in routes, conditional rules, rewrites, retries, and fallback |
| [One-click import](provider-import/) | Import providers through provider deeplinks, manifests, or embeddable buttons |
| [Extensions](extensions/) | Build wrapper plugins and core gateway plugins for local routes, providers, and gateway capabilities |
| [AgentClaw](agentclaw/) | IM access for local agents with an interface styled after [OpenClaw](https://openclaw.ai) (an open-source personal AI assistant that runs on your own machine and interacts through IM platforms); configure the IM bot, handoff modes, Project/Session commands, and platform credentials |
| [Q&A](troubleshooting/) | Common questions grouped by symptom: onboarding and observability, connection and auth errors, routing and cost, Fusion and tool calls, and Bot messaging |

AgentClaw platform guides are child pages under the AgentClaw section — one page per platform, each covering platform dashboard fields, permissions, event subscriptions, long-connection/Socket/QR login, and FAQs.

## Reading path

New to CCR? Read in this order:

1. [Install and start CCR](guides/install/): choose between the desktop app, npm CLI, and Docker; see the [CLI reference](guides/cli/) for commands and [Docker deployment](guides/docker/) for containers.
2. [Add a provider](guides/provider/): add at least one provider and verify it with protocol detection and connectivity checks.
3. [Connect Agent Config](guides/agent-profile/): point agents like Claude Code at CCR.
4. [Enable logging and observability](guides/observability/): confirm in the request log that traffic actually goes through CCR.
5. Then go deeper as needed: [Detailed configuration](configuration/overview/) covers every settings page; [Routing](routing/), [Fusion](fusion/), and [AgentClaw](agentclaw/) cover the featured capabilities; [Q&A](troubleshooting/) collects common issues like 401, 404, timeouts, and unexpected routing.
