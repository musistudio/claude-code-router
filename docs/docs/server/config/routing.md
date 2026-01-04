---
sidebar_position: 3
---

# Routing Configuration

Configure how requests are routed to different models.

## Default Routing

Set the default model for all requests:

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

## Built-in Scenarios

### Background Tasks

Route background tasks to a lightweight model:

```json
{
  "Router": {
    "background": "groq,llama-3.3-70b-versatile"
  }
}
```

### Thinking Mode (Plan Mode)

Route thinking-intensive tasks to a more capable model:

```json
{
  "Router": {
    "think": "deepseek,deepseek-chat"
  }
}
```

### Long Context

Route requests with long context:

```json
{
  "Router": {
    "longContextThreshold": 100000,
    "longContext": "gemini,gemini-1.5-pro"
  }
}
```

### Web Search

Route web search tasks:

```json
{
  "Router": {
    "webSearch": "deepseek,deepseek-chat"
  }
}
```

### Image Tasks

Route image-related tasks:

```json
{
  "Router": {
    "image": "gemini,gemini-1.5-pro"
  }
}
```

## Fallback

When a request fails, you can configure a list of backup models. The system will try each model in sequence until one succeeds:

### Basic Configuration

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "gemini,gemini-2.5-flash"
  },
  "fallback": {
    "default": [
      "aihubmix,Z/glm-4.5",
      "openrouter,anthropic/claude-sonnet-4"
    ],
    "background": [
      "ollama,qwen2.5-coder:latest"
    ],
    "think": [
      "openrouter,anthropic/claude-3.7-sonnet:thinking"
    ],
    "longContext": [
      "modelscope,Qwen/Qwen3-Coder-480B-A35B-Instruct"
    ],
    "webSearch": [
      "openrouter,anthropic/claude-sonnet-4"
    ]
  }
}
```

### How It Works

1. **Trigger**: When a model request fails for a routing scenario (HTTP error response)
2. **Auto-switch**: The system automatically checks the fallback configuration for that scenario
3. **Sequential retry**: Tries each backup model in order
4. **Success**: Once a model responds successfully, returns immediately
5. **All failed**: If all backup models fail, returns the original error

### Configuration Details

- **Format**: Each backup model format is `provider,model`
- **Validation**: Backup models must exist in the `Providers` configuration
- **Flexibility**: Different scenarios can have different fallback lists
- **Optional**: If a scenario doesn't need fallback, omit it or use an empty array

### Use Cases

#### Scenario 1: Primary Model Quota Exhausted

```json
{
  "Router": {
    "default": "openrouter,anthropic/claude-sonnet-4"
  },
  "fallback": {
    "default": [
      "deepseek,deepseek-chat",
      "aihubmix,Z/glm-4.5"
    ]
  }
}
```

Automatically switches to backup models when the primary model quota is exhausted.

#### Scenario 2: Service Reliability

```json
{
  "Router": {
    "background": "volcengine,deepseek-v3-250324"
  },
  "fallback": {
    "background": [
      "modelscope,Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "dashscope,qwen3-coder-plus"
    ]
  }
}
```

Automatically switches to other providers when the primary service fails.

### Log Monitoring

The system logs detailed fallback process:

```
[warn] Request failed for default, trying 2 fallback models
[info] Trying fallback model: aihubmix,Z/glm-4.5
[warn] Fallback model aihubmix,Z/glm-4.5 failed: API rate limit exceeded
[info] Trying fallback model: openrouter,anthropic/claude-sonnet-4
[info] Fallback model openrouter,anthropic/claude-sonnet-4 succeeded
```

### Important Notes

1. **Cost consideration**: Backup models may incur different costs, configure appropriately
2. **Performance differences**: Different models may have varying response speeds and quality
3. **Quota management**: Ensure backup models have sufficient quotas
4. **Testing**: Regularly test the availability of backup models

## Project-Level Routing

Configure routing per project in `~/.claude/projects/<project-id>/claude-code-router.json`:

```json
{
  "Router": {
    "default": "groq,llama-3.3-70b-versatile"
  }
}
```

Project-level configuration takes precedence over global configuration.

## Custom Router

Create a custom JavaScript router function:

1. Create a router file (e.g., `custom-router.js`):

```javascript
module.exports = function(config, context) {
  // Analyze the request context
  const { scenario, projectId, tokenCount } = context;

  // Custom routing logic
  if (scenario === 'background') {
    return 'groq,llama-3.3-70b-versatile';
  }

  if (tokenCount > 100000) {
    return 'gemini,gemini-1.5-pro';
  }

  // Default
  return 'deepseek,deepseek-chat';
};
```

2. Set the `CUSTOM_ROUTER_PATH` environment variable:

```bash
export CUSTOM_ROUTER_PATH="/path/to/custom-router.js"
```

## Token Counting

The router uses `tiktoken` (cl100k_base) to estimate request token count. This is used for:

- Determining if a request exceeds `longContextThreshold`
- Custom routing logic based on token count

## Subagent Routing

Specify models for subagents using special tags:

```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Next Steps

- [Transformers](/docs/config/transformers) - Apply transformations to requests
- [Custom Router](/docs/advanced/custom-router) - Advanced custom routing
