---
title: Connect Agent Config
pageTitle: Connect Agent Config
eyebrow: Quick Start
lead: Let Claude Code, Codex, Grok CLI, ZCode, and other agents use CCR's providers, routing, and model selection.
---

## General Guidance

- During trial, prefer **Only opened from CCR** so only agents launched from CCR are affected.
- After it is stable, consider **System default** if you want the agent's default config changed.
- After applying, launch the agent from CCR's **Open Agent** action when possible.

## Claude Code

In **Agent Config**, choose Claude Code, set the model, small fast model, and settings file, then click Apply.

Open Claude Code from CCR and send one request to verify it in request logs.

## Codex

In **Agent Config**, choose Codex and confirm Provider ID, Provider Name, model, and config file.

Only fill Codex CLI path and Codex home when you need a specific CLI or home directory.

## Grok CLI

Choose Grok CLI, select a model, and run the copied `ccr-app <profile-name>` command. When the CCR Desktop gateway is not running, the command starts a shared temporary gateway service that remains available until the last concurrent Grok session exits. Use `/model` inside Grok to switch among models exposed by CCR.

## ZCode

ZCode mainly uses model, Provider ID, Provider Name, and whether it is launched from CCR. It uses the App surface and does not need Codex CLI path fields.

## Reuse A Locally Logged-In Agent

If Claude Code, Codex, Grok CLI, or ZCode is already logged in on this machine, import it as a **Local Agent Provider** from **Providers** to reuse the existing authorization without applying for another key.
