---
sidebar_position: 3
---

# Quick Start

Get up and running with Claude Code Router in 5 minutes.

## 1. Configure the Router

Before using Claude Code Router, you need to configure your LLM providers. You can either:

### Option A: Edit Configuration File Directly

Edit `~/.claude-code-router/config.json`:

```json
{
  "HOST": "0.0.0.0",
  "PORT": 8080,
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "your-api-key-here",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### Option B: Use Web UI

```bash
ccr ui
```

This will open the web interface where you can configure providers visually.

## 2. Start the Router

```bash
ccr start
```

The router will start on `http://localhost:8080` by default.

## 3. Use Claude Code

Now you can use Claude Code normally:

```bash
ccr code
```

Your requests will be routed through Claude Code Router to your configured provider.

## Restart After Configuration Changes

If you modify the configuration file or make changes through the Web UI, restart the service:

```bash
ccr restart
```

Or restart directly through the Web UI.

## What's Next?

- [Basic Configuration](/docs/cli/config/basic) - Learn about configuration options
- [Routing](/docs/cli/config/routing) - Configure smart routing rules
- [CLI Commands](/docs/category/cli-commands) - Explore all CLI commands
