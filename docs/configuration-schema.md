# Configuration Schema Documentation

This document describes the configuration schema for Claude Code Router with all available options and validation rules.

## Configuration File Location

The configuration file is located at: `~/.claude-code-router/config.json`

The file supports JSON5 format, which allows:
- Comments (// and /* */)
- Trailing commas
- Unquoted keys
- Single quotes
- Multiline strings

## Schema Overview

```json5
{
  // Proxy configuration (optional)
  "PROXY_URL": "http://127.0.0.1:7890",
  
  // Logging configuration (optional)
  "LOG": true,
  "LOG_LEVEL": "info", // error, warn, info, debug
  
  // Security configuration (optional)
  "APIKEY": "your-secret-key",
  "HOST": "127.0.0.1", // Restricted to 127.0.0.1 without APIKEY
  "PORT": 3456,
  
  // API timeout configuration (optional)
  "API_TIMEOUT_MS": 600000, // 10 minutes max
  
  // Hot reload configuration (optional)
  "HOT_RELOAD": true, // Enable config hot reload
  
  // Custom router path (optional)
  "CUSTOM_ROUTER_PATH": "$HOME/.claude-code-router/custom-router.js",
  
  // Providers configuration (required)
  "Providers": [
    {
      "name": "provider-name",
      "api_base_url": "https://api.example.com/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": ["model-1", "model-2"],
      "transformer": {
        "use": ["transformer-name"],
        "model-1": {
          "use": ["specific-transformer"]
        }
      }
    }
  ],
  
  // Router configuration (required)
  "Router": {
    "default": "provider,model",
    "background": "provider,model",
    "think": "provider,model",
    "longContext": "provider,model",
    "longContextThreshold": 60000,
    "webSearch": "provider,model",
    "fallback": "provider,model" // Fallback when primary fails
  },
  
  // Custom transformers (optional)
  "transformers": [
    {
      "path": "$HOME/.claude-code-router/plugins/custom.js",
      "options": {}
    }
  ]
}
```

## Field Descriptions

### Global Settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `PROXY_URL` | string (URI) | No | - | HTTP proxy URL for API requests |
| `LOG` | boolean | No | false | Enable logging to file |
| `LOG_LEVEL` | string | No | "info" | Logging verbosity level |
| `APIKEY` | string | No | - | API key for authentication (min 10 chars) |
| `HOST` | string | No | "127.0.0.1" | Server host address |
| `PORT` | number | No | 3456 | Server port (1-65535) |
| `API_TIMEOUT_MS` | number | No | 600000 | API timeout in milliseconds |
| `HOT_RELOAD` | boolean | No | true | Enable configuration hot reload |
| `CUSTOM_ROUTER_PATH` | string | No | - | Path to custom router script |

### Providers

Each provider in the `Providers` array must have:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique provider identifier |
| `api_base_url` | string (URI) | Yes | API endpoint URL |
| `api_key` | string | Yes | Authentication key |
| `models` | string[] | Yes | List of available models |
| `transformer` | object | No | Transformation configuration |

#### Transformer Configuration

```json5
{
  "transformer": {
    // Global transformers for all models
    "use": ["transformer1", "transformer2"],
    
    // Model-specific transformers
    "model-name": {
      "use": ["specific-transformer"]
    }
  }
}
```

Transformers with options:
```json5
{
  "use": [
    ["maxtoken", { "max_tokens": 16384 }],
    "enhancetool"
  ]
}
```

### Router Configuration

| Field | Type | Required | Pattern | Description |
|-------|------|----------|---------|-------------|
| `default` | string | Yes | `provider,model` | Default routing |
| `background` | string | No | `provider,model` | Background tasks |
| `think` | string | No | `provider,model` | Reasoning tasks |
| `longContext` | string | No | `provider,model` | Long context handling |
| `longContextThreshold` | number | No | - | Token threshold (default: 60000) |
| `webSearch` | string | No | `provider,model` | Web search tasks |
| `fallback` | string | No | `provider,model` | Fallback when primary fails |

## Validation Rules

1. **Provider References**: All providers referenced in Router must exist in Providers list
2. **Model Existence**: Models referenced should exist in the provider's model list (warning if not)
3. **Security**: If HOST is not localhost, APIKEY must be set
4. **File Paths**: Custom router and transformer paths must exist
5. **Format**: Router entries must follow `provider,model` format

## Error Handling

The configuration validator will:
- Show clear error messages for invalid configurations
- Provide warnings for potential issues
- Suggest fixes for common problems
- Support hot reload with validation

## Migration

Old configuration formats are automatically migrated:
- Missing `LOG_LEVEL` defaults to "info"
- Missing `PORT` defaults to 3456
- Legacy fields are preserved

## Example Valid Configuration

```json5
{
  "LOG": true,
  "LOG_LEVEL": "info",
  "APIKEY": "my-secure-api-key-123",
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": ["anthropic/claude-3.5-sonnet"],
      "transformer": {
        "use": ["openrouter"]
      }
    }
  ],
  "Router": {
    "default": "openrouter,anthropic/claude-3.5-sonnet",
    "fallback": "openrouter,anthropic/claude-3.5-sonnet"
  }
}
```