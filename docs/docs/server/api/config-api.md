---
title: Configuration API
---

# Configuration API

## GET /api/config

Get current server configuration.

### Request Example

```bash
curl http://localhost:3456/api/config \
  -H "x-api-key: your-api-key"
```

### Response Example

```json
{
  "HOST": "0.0.0.0",
  "PORT": 3456,
  "APIKEY": "sk-xxxxx",
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  },
  "transformers": [
    "anthropic"
  ]
}
```

## POST /api/config

Update server configuration. Old configuration is automatically backed up before updating.

### Request Example

```bash
curl -X POST http://localhost:3456/api/config \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{
    "HOST": "0.0.0.0",
    "PORT": 3456,
    "Providers": [
      {
        "name": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "$OPENAI_API_KEY",
        "models": ["gpt-4"]
      }
    ],
    "Router": {
      "default": "openai,gpt-4"
    }
  }'
```

### Configuration Object Structure

#### Basic Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `HOST` | string | No | Listen address (default 127.0.0.1) |
| `PORT` | integer | No | Listen port (default 3456) |
| `APIKEY` | string | No | API key |
| `LOG` | boolean | No | Enable logging (default true) |
| `LOG_LEVEL` | string | No | Log level (debug/info/warn/error) |

#### Providers Configuration

```json
{
  "Providers": [
    {
      "name": "provider-name",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "your-api-key",
      "models": ["model-1", "model-2"]
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Provider name |
| `baseUrl` | string | Yes | API base URL |
| `apiKey` | string | Yes | API key |
| `models` | array | Yes | List of supported models |

#### Router Configuration

```json
{
  "Router": {
    "default": "provider,model",
    "longContextThreshold": 100000,
    "routes": {
      "background": "lightweight-model",
      "think": "powerful-model",
      "longContext": "long-context-model",
      "webSearch": "search-model",
      "image": "vision-model"
    }
  }
}
```

#### Transformers Configuration

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "provider": "provider-name",
      "models": ["model-1"],
      "options": {}
    }
  ]
}
```

### Response Example

Success:

```json
{
  "success": true,
  "message": "Config saved successfully"
}
```

### Configuration Backup

Every time configuration is updated, old configuration is automatically backed up to:

```
~/.claude-code-router/config.backup.{timestamp}.json
```

Keeps the last 3 backups.

## GET /api/transformers

Get list of all transformers loaded by the server.

### Request Example

```bash
curl http://localhost:3456/api/transformers \
  -H "x-api-key: your-api-key"
```

### Response Example

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "endpoint": null
    },
    {
      "name": "openai",
      "endpoint": null
    },
    {
      "name": "gemini",
      "endpoint": "https://generativelanguage.googleapis.com"
    }
  ]
}
```

### Transformer List

Built-in transformers:

- `anthropic` - Anthropic Claude format
- `openai` - OpenAI format
- `deepseek` - DeepSeek format
- `gemini` - Google Gemini format
- `openrouter` - OpenRouter format
- `groq` - Groq format
- `maxtoken` - Adjust max_tokens parameter
- `tooluse` - Tool use conversion
- `reasoning` - Reasoning mode conversion
- `enhancetool` - Enhance tool functionality

## Environment Variable Interpolation

Configuration supports environment variable interpolation:

```json
{
  "Providers": [
    {
      "apiKey": "$OPENAI_API_KEY"
    }
  ]
}
```

Or use `${VAR_NAME}` format:

```json
{
  "baseUrl": "${API_BASE_URL}"
}
```
