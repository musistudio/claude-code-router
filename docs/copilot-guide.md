# GitHub Copilot Integration Guide

Use GitHub Copilot models with Claude Code Router (CCR) - no Anthropic account required.

## Overview

This integration allows you to use GitHub Copilot's models (including GPT-4o, Claude Sonnet, Claude Opus) through CCR's routing system. The Copilot API is exposed as an OpenAI-compatible provider.

**What you get:**
- Access to Copilot models via `ccr` command
- OpenAI-compatible API endpoint
- Automatic token management and refresh
- Support for individual, business, and enterprise Copilot accounts

---

## Quick Start

### Step 1: Authenticate with GitHub Copilot

```bash
# Individual account
ccr auth copilot --account-type individual

# Business account
ccr auth copilot --account-type business

# Enterprise account
ccr auth copilot --account-type enterprise
```

**Authentication flow:**
1. A device code is displayed (e.g., `CF4B-9F9D`)
2. Go to `https://github.com/login/device` in your browser
3. Enter the code and authorize
4. Token is saved to `~/.claude-code-router/copilot-token.json`

---

### Step 2: Configure Copilot Provider

Edit `~/.claude-code-router/config.json`:

```json
{
  "Providers": [
    {
      "name": "copilot",
      "api_base_url": "https://api.githubcopilot.com",
      "api_key": "unused",
      "models": [
        "gpt-4o",
        "gpt-4.1",
        "claude-sonnet-4-20250514",
        "claude-sonnet-4.5",
        "claude-opus-4.5",
        "claude-sonnet-4.6"
      ],
      "transformer": {
        "use": ["copilot"]
      }
    }
  ],
  "Router": {
    "default": "copilot,claude-sonnet-4.6"
  }
}
```

---

### Step 3: Start the Server

```bash
ccr start
```

---

### Step 4: Use with Claude Code

```bash
# Use default router (copilot if configured)
claude code "Hello"

# Specify model explicitly
claude code --model claude-sonnet-4.6 "Hello"
```

---

## Configuration Reference

### Provider Configuration

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Provider identifier | `"copilot"` |
| `api_base_url` | Copilot API base URL | `"https://api.githubcopilot.com"` |
| `api_key` | Placeholder (token managed separately) | `"unused"` |
| `models` | Available models | `["gpt-4o", "claude-sonnet-4.6"]` |
| `transformer.use` | Must include `"copilot"` | `["copilot"]` |

### Account Types

| Account Type | Base URL |
|--------------|----------|
| `individual` | `https://api.githubcopilot.com` |
| `business` | `https://api.business.githubcopilot.com` |
| `enterprise` | `https://api.enterprise.githubcopilot.com` |

### Router Configuration

```json
{
  "Router": {
    "default": "copilot,claude-sonnet-4.6",
    "background": "copilot,gpt-4o",
    "think": "copilot,claude-sonnet-4.6",
    "longContext": "copilot,claude-sonnet-4.6",
    "webSearch": "copilot,claude-sonnet-4.6",
    "image": "copilot,gpt-4o"
  }
}
```

---

## Available Models

GitHub Copilot provides access to these models:

| Model | Description |
|-------|-------------|
| `gpt-4o` | GPT-4 Optimized |
| `gpt-4.1` | GPT-4.1 |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 |
| `claude-sonnet-4.5` | Claude Sonnet 4.5 |
| `claude-opus-4.5` | Claude Opus 4.5 |
| `claude-sonnet-4.6` | Claude Sonnet 4.6 |

---

## Token Management

### Token Storage

Tokens are stored in: `~/.claude-code-router/copilot-token.json`

```json
{
  "githubToken": "gho_xxxxxxxxxxxx",
  "copilotToken": "eyJhbGc...",
  "expiresAt": 1709567890,
  "refreshIn": 840,
  "accountType": "individual"
}
```

### Auto-Refresh

- Copilot tokens expire after ~15 minutes
- Token is automatically refreshed before expiry (60-second buffer)
- Refresh happens on-demand when a request detects expiring token
- GitHub OAuth token (`gho_xxx`) does not expire unless revoked

### Re-authenticate

```bash
# Force re-authentication
ccr auth copilot --force
```

---

## Usage Examples

### Basic Chat

```bash
ccr start
claude code "Write a hello world function in Python"
```

### Using Specific Model

```bash
# In your Claude Code session
/model copilot,claude-sonnet-4.6
```

### Check Server Status

```bash
ccr status
```

### View Logs

```bash
# Logs are in ~/.claude-code-router/logs/
tail -f ~/.claude-code-router/logs/ccr-*.log
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Client                        │
└────────────────────────────┬────────────────────────────────┘
                             │ POST /v1/messages
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              CCR Server (Fastify)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              CopilotTransformer                        │  │
│  │  • Load token from storage                             │  │
│  │  • Auto-refresh if expiring                            │  │
│  │  • Inject Copilot headers                              │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ Authorization: Bearer <token>
                             │ copilot-integration-id: vscode-chat
                             ▼
                  ┌───────────────────────┐
                  │  GitHub Copilot API   │
                  │  api.githubcopilot.com│
                  └───────────────────────┘
```

---

## Troubleshooting

### "Copilot not authenticated"

```bash
# Re-run authentication
ccr auth copilot --account-type individual
```

### Token Expired

Token should auto-refresh. If issues persist:

```bash
# Delete stored token and re-authenticate
rm ~/.claude-code-router/copilot-token.json
ccr auth copilot --account-type individual
```

### Wrong Account Type

```bash
# Check your token
cat ~/.claude-code-router/copilot-token.json | grep accountType

# Re-authenticate with correct type
ccr auth copilot --account-type business
```

### Models Not Available

Check your Copilot plan at: https://github.com/settings/copilot

Free plan has limited messages per month. Business/Enterprise have higher limits.

### Check Logs

```bash
# Enable debug logging in config.json
{
  "LOG": true,
  "LOG_LEVEL": "debug"
}

# View latest log
tail -f ~/.claude-code-router/logs/ccr-$(date +%Y%m%d)*.log
```

---

## What Was Implemented

### Files Created

**Core Package (`packages/core/src/`):**
- `services/copilot/api-config.ts` - API configuration and headers
- `services/copilot/github-auth.ts` - OAuth device flow
- `services/copilot/token.ts` - Token management
- `services/copilot/api.ts` - Copilot API client
- `transformer/copilot.transformer.ts` - CCR transformer

**CLI Package (`packages/cli/src/`):**
- `services/copilot/*.ts` - Auth services (copied for CLI)
- `utils/auth-copilot.ts` - Auth command handler
- `cli.ts` - Added `auth copilot` command

### Features

- [x] GitHub OAuth device flow authentication
- [x] Copilot token exchange and storage
- [x] Automatic token refresh before expiry
- [x] Support for individual/business/enterprise accounts
- [x] OpenAI-compatible endpoint (`/v1/chat/completions`)
- [x] Proper Copilot headers injection
- [x] Image/vision request support
- [x] Agent/user request differentiation

---

## FAQ

**Q: Do I need a separate copilot-api server?**
A: No! The Copilot integration is now built into CCR.

**Q: Can I use both Copilot and other providers?**
A: Yes! Configure multiple providers in `config.json` and use the router to switch between them.

**Q: How often does the token refresh?**
A: Copilot tokens last ~15 minutes. They refresh automatically when a request detects the token is expiring soon (<60 seconds).

**Q: What if I switch account types?**
A: Run `ccr auth copilot --account-type <type>` with the new type. Tokens are stored per account type.

**Q: Can I use this with Claude Code desktop app?**
A: Yes! Point Claude Code to `http://localhost:3456` as your API endpoint.
