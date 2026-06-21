---
sidebar_position: 2
---

# Providers Configuration

Detailed guide for configuring LLM providers.

## Supported Providers

### DeepSeek

```json
{
  "NAME": "deepseek",
  "HOST": "https://api.deepseek.com",
  "APIKEY": "your-api-key",
  "MODELS": ["deepseek-chat", "deepseek-coder"],
  "transformers": ["anthropic"]
}
```

### Groq

```json
{
  "NAME": "groq",
  "HOST": "https://api.groq.com/openai/v1",
  "APIKEY": "your-api-key",
  "MODELS": ["llama-3.3-70b-versatile"],
  "transformers": ["anthropic"]
}
```

### Gemini

```json
{
  "NAME": "gemini",
  "HOST": "https://generativelanguage.googleapis.com/v1beta",
  "APIKEY": "your-api-key",
  "MODELS": ["gemini-1.5-pro"],
  "transformers": ["anthropic"]
}
```

### OpenRouter

```json
{
  "NAME": "openrouter",
  "HOST": "https://openrouter.ai/api/v1",
  "APIKEY": "your-api-key",
  "MODELS": ["anthropic/claude-3.5-sonnet"],
  "transformers": ["anthropic"]
}
```

### Requesty

Requesty is an OpenAI-compatible gateway that uses the same `provider/model` naming as OpenRouter. See [requesty.ai](https://requesty.ai), [docs.requesty.ai](https://docs.requesty.ai), and the [model list](https://app.requesty.ai/router/list).

```json
{
  "NAME": "requesty",
  "HOST": "https://router.requesty.ai/v1",
  "APIKEY": "your-api-key",
  "MODELS": ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-5"],
  "transformers": ["anthropic"]
}
```

## Provider Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `NAME` | string | Yes | Unique provider identifier |
| `HOST` | string | Yes | API base URL |
| `APIKEY` | string | Yes | API authentication key |
| `MODELS` | string[] | No | List of available models |
| `transformers` | string[] | No | List of transformers to apply |

## Model Selection

When selecting a model in routing, use the format:

```
{provider-name},{model-name}
```

For example:

```
deepseek,deepseek-chat
```

## Next Steps

- [Routing Configuration](/docs/config/routing) - Configure how requests are routed
- [Transformers](/docs/config/transformers) - Apply transformations to requests
