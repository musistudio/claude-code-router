---
title: Connect Agent Config
pageTitle: Connect Agent Config
eyebrow: Quick Start
lead: Let Claude Code, Codex, Grok CLI, Kimi CLI, ZCode, and other agents use CCR's providers, routing, and model selection.
---

## General Guidance

- During trial, prefer **Only opened from CCR** so routing and model overrides affect only agents launched from CCR. For Claude Code, keep **Isolated CCR configuration** unless you intentionally want to share an existing configuration directory.
- After it is stable, consider **System default** if you want the agent's default config changed.
- After applying, launch the agent from CCR's **Open Agent** action when possible.

## Claude Code

In **Agent Config**, choose Claude Code, set the model and small fast model, then choose a configuration mode. Keep **Isolated CCR configuration** for a separate CCR-managed setup. Choose **Reuse existing Claude configuration** with **Only opened from CCR** and `CLI only` to load plugins, hooks, statusline, skills, agents, and sessions from an existing configuration directory. The native default `~/.claude/settings.json` keeps native config resolution. A custom file must also be named `settings.json`; CCR uses its parent directory as `CLAUDE_CONFIG_DIR`. Routing, authentication, model, and environment overrides apply only to that launch.

Open Claude Code from CCR and send one request to verify it in request logs.

## Codex

In **Agent Config**, choose Codex and confirm Provider ID, Provider Name, model, and config file.

Only fill Codex CLI path and Codex home when you need a specific CLI or home directory.

## Grok CLI

Choose Grok CLI, select a model, and run the copied `ccr-app <profile-name>` command. When the CCR Desktop gateway is not running, the command starts a shared temporary gateway service that remains available until the last concurrent Grok session exits. Use `/model` inside Grok to switch among models exposed by CCR.

## Kimi CLI

Choose Kimi CLI, select a default model and one or more available CCR models, then run the copied `ccr-app <profile-name>` command. CCR launches Kimi with a profile-specific `KIMI_CODE_HOME` whose generated `config.toml` registers every selected model against the local CCR gateway. Use `/model` inside Kimi to switch among them. The original `~/.kimi-code/config.toml` is not changed, while sessions, skills, plugins, MCP configuration, and credentials are reused from the source Kimi home when available. The wrapper can also start the same managed temporary gateway when CCR Desktop is not running.

## ZCode

ZCode mainly uses model, Provider ID, Provider Name, and whether it is launched from CCR. It uses the App surface and does not need Codex CLI path fields.

## Reuse A Locally Logged-In Agent

If Claude Code, Codex, Grok CLI, Kimi CLI, or ZCode is already logged in on this machine, import it as a **Local Agent Provider** from **Providers** to reuse the existing authorization without applying for another key. Kimi CLI imports both managed OAuth logins and API-key providers from `~/.kimi-code/config.toml`.
