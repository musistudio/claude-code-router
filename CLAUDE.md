# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Build:** `npm run build` (compiles the project)
- **Start Router:** `ccr start` (starts the Claude Code Router server)
- **Run Claude Code with Router:** `ccr code` (starts Claude Code using the router)
- **Restart Router:** `ccr restart` (restarts the router service after config changes)
- **UI Mode:** `ccr ui` (opens a web-based interface for config management)

## High-Level Architecture

The Claude Code Router acts as a proxy between Claude Code and various LLM providers. Its core functionalities include:

- **Model Routing:** Directs requests to different LLM models based on configured rules (e.g., `default`, `background`, `think`, `longContext`, `webSearch`). This can be customized via `config.json` or a `CUSTOM_ROUTER_PATH` JavaScript file.
- **Multi-Provider Support:** Integrates with various LLM providers (OpenRouter, DeepSeek, Ollama, Gemini, etc.) defined in the `Providers` array in `config.json`.
- **Request/Response Transformation:** Uses `transformers` to adapt request and response payloads for compatibility with different provider APIs. Transformers can be global per provider or model-specific, and custom transformers can be loaded.
- **CLI Interface:** Provides `ccr` and `ccr-dev` commands for managing the router, starting Claude Code with the router, and accessing the UI.
- **Configuration Management:** Relies on `~/.claude-code-router/config.json` for all settings, including API keys (with environment variable interpolation), provider details, and routing rules.
- **Subagent Routing:** Allows specific subagent tasks to be directed to designated models by including `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` at the beginning of the subagent's prompt.
- **Logging:** Utilizes two separate logging systems for server-level and application-level logs.
- **GitHub Actions Integration:** Designed for use in CI/CD pipelines, allowing automated Claude Code tasks.