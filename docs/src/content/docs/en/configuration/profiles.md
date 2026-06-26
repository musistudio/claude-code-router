---
title: Agent Config
pageTitle: Agent Config
eyebrow: Detailed Configuration
lead: Create reusable launch configurations for Claude Code, Codex, and ZCode, and open separate agent instances from different configs.
---

## What Agent Config Is

Agent Config is the desktop app capability for managing Claude Code, Codex, and ZCode launch entries. It is not a provider or a routing rule; it is the full entry point for one agent launch: agent type, entry mode, model, effect scope, config file location, and optional Bot binding.

This page exists in Detailed Configuration to explain which config opens which agent instance, rather than provider, routing, or Fusion fields.

## Multi-Instance Mechanism

Every Agent Config has its own `id` and name. When CCR opens an agent, it finds the enabled config by name or `id`, then builds the launch plan for that config.

| Mechanism | Actual behavior |
| --- | --- |
| Separate config files | With **Only opened from CCR**, Claude Code and Codex write CCR-managed config files in directories separated by config `id` |
| Separate launchers | Claude Code uses a separate launch wrapper; Codex and ZCode use separate middleware launchers; filenames are also separated by config `id` or name |
| Separate app data directories | When opening App mode, Claude App, Codex App, and ZCode App use user-data directories separated by config `id` |
| Runtime state | CCR tracks running app instances by entry mode and config `id`; reopening the same config activates the existing window, while a different config can open a separate instance |

This lets you create multiple configs for the same agent, such as "Claude Code - Work Project", "Claude Code - Test Model", or "Codex - Fusion Vision". They can use different models, scopes, and Bots, then open as separate agent instances.

## Common Options

| Option | Description |
| --- | --- |
| Agent | Claude Code, Codex, or ZCode |
| Config name | Identifies the config in CCR and can be used as the `ccr <config-name>` launch target |
| Effect scope | **Only opened from CCR** uses CCR-managed isolated config; **System default** writes the agent's default config |
| Entry mode | `CLI & APP`, `CLI only`, or `App only`; ZCode supports App only |
| Model | Default model for the opened agent, either a provider model or Fusion model |
| Bot | App entry can bind a Bot for IM forwarding or handoff |

## Agent Differences

### Claude Code

Claude Code config writes a settings file. With **Only opened from CCR**, CCR creates an isolated settings file under its own config directory and opens Claude Code through a separate launch wrapper.

When opening Claude App from the desktop app, CCR also prepares a separate user-data directory for that config. Different Agent Config entries use different directories, so multiple Claude App instances can run at the same time.

### Codex

Codex config writes `config.toml` and a model catalog file. With **Only opened from CCR**, CCR stores those files in a directory separated by config `id`.

Codex supports CLI and App. CLI opens through the launcher for the selected config; App uses a separate user-data directory and passes the selected model and provider into Codex App.

### ZCode

ZCode supports App only. CCR writes ZCode CLI config, v2 config, and model cache based on ZCode home or a custom config file, then starts the App with the current Agent Config's model, provider, and separate user-data directory.

## Multi-Instance Suggestions

1. Create one Agent Config for each agent instance that should run independently.
2. While testing, prefer **Only opened from CCR** to avoid changing the system default agent.
3. To keep desktop windows side by side, use `App only` or `CLI & APP`, then open the App from CCR.
4. If the same config is already running, opening it again activates the existing window. Create another Agent Config when you need a second instance.
