---
sidebar_position: 1
---

# Basic Configuration

Learn how to configure Claude Code Router to suit your needs.

## Configuration File Location

The configuration file is located at:

```
~/.claude-code-router/config.json
```

## Configuration Structure

### Providers

Configure LLM providers to route requests to:

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "MODELS": ["deepseek-chat", "deepseek-coder"]
    },
    {
      "NAME": "groq",
      "HOST": "https://api.groq.com/openai/v1",
      "APIKEY": "your-groq-api-key",
      "MODELS": ["llama-3.3-70b-versatile"]
    }
  ]
}
```

### Router

Configure which model to use by default:

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

Format: `{provider-name},{model-name}`

### Transformers

Apply transformations to requests/responses:

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq"]
    }
  ]
}
```

### Environment Variables

Use environment variables in your configuration:

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "$DEEPSEEK_API_KEY"
    }
  ]
}
```

Both `$VAR_NAME` and `${VAR_NAME}` syntax are supported.

## Complete Example

```json
{
  "port": 8080,
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "$DEEPSEEK_API_KEY",
      "MODELS": ["deepseek-chat", "deepseek-coder"],
      "transformers": ["anthropic"]
    },
    {
      "NAME": "groq",
      "HOST": "https://api.groq.com/openai/v1",
      "APIKEY": "$GROQ_API_KEY",
      "MODELS": ["llama-3.3-70b-versatile"],
      "transformers": ["anthropic"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "longContextThreshold": 100000,
    "background": "groq,llama-3.3-70b-versatile"
  },
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq"]
    }
  ]
}
```

## Editing Configuration

Use the CLI to edit the configuration:

```bash
ccr config edit
```

This will open the configuration file in your default editor.

## Reloading Configuration

After editing the configuration, restart the router:

```bash
ccr restart
```

## Next Steps

- [Providers Configuration](/docs/config/providers) - Detailed provider configuration
- [Routing Configuration](/docs/config/routing) - Configure routing rules
- [Transformers](/docs/config/transformers) - Apply transformations
