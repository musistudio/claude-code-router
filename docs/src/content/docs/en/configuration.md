---
title: Claude Code Router detailed configuration
pageTitle: Detailed configuration
eyebrow: Detailed configuration
lead: Detailed configuration is split into standalone pages that follow the app's own order, covering the overview dashboard, providers, Agent Config, API keys, logs and observability, and server, plus the config database and tray pages under settings. AgentClaw, Fusion, ToolHub, routing, import, and extensions are documented as standalone top-level sections.
---

## Page structure

Detailed configuration docs are split into standalone pages. Every left-sidebar item opens a page; the right outline is reserved for headings inside the current page. Main pages follow the app's left navigation order. Settings pages are grouped separately and follow the settings dialog order.

## Main pages

| Page | Covers |
| --- | --- |
| Overview dashboard | System status, account balance, usage widgets, layout editing, and share cards |
| Provider config | Upstream services, protocol, Base URL, model list, and credentials |
| Agent Config | Agent launch method, model, scope, multi-instance launching, and Bot binding |
| API keys | Client access keys, expiration, and local limits |
| Logs and observability | Request logs, Agent execution traces, tool calls, and tool results |
| Server | Host, port, proxy mode, system proxy, network capture, and CA certificate |

## Settings pages

| Page | Covers |
| --- | --- |
| Config database location | SQLite config database location maintained by the desktop app |
| Tray configuration | Tray icon, balance progress, and tray window widgets |

## Content relationships

The overview dashboard shows system status and usage. Provider config covers how upstream model services enter CCR. Agent Config covers launching, multi-instance use, and model selection for Claude Code, Codex, OpenCode, Grok CLI, Kimi CLI, and ZCode. API keys control client access to CCR. Logs and observability cover request logs and agent execution traces. Server controls the local gateway listener and proxy features. Config database location and tray configuration match the corresponding pages in the settings dialog. For featured capabilities, open [AgentClaw](/en/agentclaw/), [Fusion](/en/fusion/), [ToolHub](/en/toolhub/), [Routing](/en/routing/), [Import](/en/provider-import/), or [Extensions](/en/extensions/).
