---
title: Claude Code Router Detailed Configuration
pageTitle: Detailed Configuration
eyebrow: Detailed Configuration
lead: "Separate main app pages from settings pages while following the app's actual order: main pages cover overview, providers, Agent Profiles, routing, Fusion, API keys, logs and observability, server, and extensions; settings pages cover ToolHub, Bots, data, and tray."
---

## Page Structure

Detailed configuration docs are split into standalone pages. Every left-sidebar item opens a page; the right outline is reserved for headings inside the current page. Main pages follow the app's left navigation order. Settings pages are grouped separately and follow the settings dialog order.

## Main Pages

| Page | Covers |
| --- | --- |
| Overview Dashboard | System status, account balance, usage widgets, layout editing, and share cards |
| Provider Config | Upstream services, protocol, Base URL, model list, and credentials |
| One click import | Provider deeplink protocol, manifest import, one-click import buttons, and security boundaries |
| Agent Profiles | Agent launch method, model, scope, multi-instance launching, and Bot binding |
| Routing Config | Default routing, conditional rules, fallback, and request rewrites |
| Fusion Models | Combine a base model with vision, search, or MCP tools into a new selectable model |
| API Keys | Client access keys, expiration, and local limits |
| Logs & Observability | Request logs, Agent execution traces, tool calls, and tool results |
| Server | Host, port, proxy mode, system proxy, network capture, and CA certificate |
| Extension Mechanism | Wrapper plugins, core gateway plugins, custom extension creation, and debugging |

## Settings Pages

| Page | Covers |
| --- | --- |
| ToolHub | Collapse many MCP servers into one dynamic tool resolution entry point for agents |
| Bots And IM Agent Relay | Bot forwarding, handoff mode, and platform pages |
| Config Database Location | SQLite config database location maintained by the desktop app |
| Tray Configuration | Tray icon, balance progress, and tray window widgets |

## Content Relationships

Overview Dashboard shows system status and usage. Provider Config and One click import cover how upstream model services enter CCR. Agent Profiles covers Claude Code, Codex, and ZCode launch, multi-instance usage, and model selection. Routing determines where model requests go. Fusion covers vision, web search, and MCP tools. API Keys control client access to CCR. Logs & Observability cover request logs and agent execution traces. Server controls the local gateway listener and proxy features. Extension Mechanism covers local plugin creation, installation, and debugging. ToolHub, Bots, Config Database Location, and Tray Configuration match the corresponding settings pages in the settings dialog.
