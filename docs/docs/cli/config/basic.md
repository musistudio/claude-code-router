---
title: Basic Configuration
---

# Basic Configuration

CLI uses the same configuration file as Server: `~/.claude-code-router/config.json`

## Configuration Methods

You can configure Claude Code Router in two ways:

### Option 1: Edit Configuration File Directly

Edit `~/.claude-code-router/config.json` with your favorite editor:

```bash
nano ~/.claude-code-router/config.json
```

### Option 2: Use Web UI

Open the web interface and configure visually:

```bash
ccr ui
```

## Restart After Configuration Changes

After modifying the configuration file or making changes through the Web UI, you must restart the service:

```bash
ccr restart
```

Or restart directly through the Web UI.

## Configuration File Location

```bash
~/.claude-code-router/config.json
```

## Minimal Configuration Example

```json5
{
  // API key (optional, used to protect service)
  "APIKEY": "your-api-key-here",

  // LLM providers
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  // Default routing
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

## Environment Variables

Configuration supports environment variable interpolation:

```json5
{
  "Providers": [
    {
      "apiKey": "$OPENAI_API_KEY"  // Read from environment variable
    }
  ]
}
```

Set in `.bashrc` or `.zshrc`:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Common Configuration Options

### HOST and PORT

```json5
{
  "HOST": "127.0.0.1",  // Listen address
  "PORT": 3456          // Listen port
}
```

### Logging Configuration

```json5
{
  "LOG": true,          // Enable logging
  "LOG_LEVEL": "info"   // Log level
}
```

### Routing Configuration

```json5
{
  "Router": {
    "default": "openai,gpt-4",
    "background": "openai,gpt-3.5-turbo",
    "think": "openai,gpt-4",
    "longContext": "anthropic,claude-3-opus"
  }
}
```

## Configuration Validation

Configuration file is automatically validated. Common errors:

- **Missing Providers**: Must configure at least one provider
- **Missing API Key**: If Providers are configured, must provide API Key
- **Model doesn't exist**: Ensure model is in provider's models list

## Configuration Backup

Configuration is automatically backed up on each update:

```
~/.claude-code-router/config.backup.{timestamp}.json
```

## Apply Configuration Changes

After modifying the configuration file or making changes through the Web UI, restart the service:

```bash
ccr restart
```

Or restart directly through the Web UI by clicking the "Save and Restart" button.

## View Current Configuration

```bash
# View via API
curl http://localhost:3456/api/config

# Or view configuration file
cat ~/.claude-code-router/config.json
```

## Example Configurations

### OpenAI

```json5
{
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

### Anthropic

```json5
{
  "Providers": [
    {
      "name": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    }
  ],
  "Router": {
    "default": "anthropic,claude-3-5-sonnet-20241022"
  }
}
```

### Multiple Providers

```json5
{
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    },
    {
      "name": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "apiKey": "$ANTHROPIC_API_KEY",
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4",
    "think": "anthropic,claude-3-5-sonnet-20241022",
    "background": "openai,gpt-3.5-turbo"
  }
}
```
