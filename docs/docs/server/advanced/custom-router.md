---
sidebar_position: 1
---

# Custom Router

Write your own routing logic in JavaScript.

## Creating a Custom Router

Create a JavaScript file that exports a routing function:

```javascript
// custom-router.js
module.exports = function(config, context) {
  const { scenario, projectId, tokenCount, request } = context;

  // Your custom logic here
  if (scenario === 'background') {
    return 'groq,llama-3.3-70b-versatile';
  }

  if (tokenCount > 100000) {
    return 'gemini,gemini-1.5-pro';
  }

  // Check request content
  if (request && request.system && request.system.includes('code')) {
    return 'deepseek,deepseek-coder';
  }

  // Default
  return 'deepseek,deepseek-chat';
};
```

## Context Object

The router function receives a context object with:

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | string | Detected scenario (background, think, webSearch, image, etc.) |
| `projectId` | string | Project ID from Claude Code |
| `tokenCount` | number | Estimated token count of the request |
| `request` | object | Full request object |

## Configuration

Set the environment variable to use your custom router:

```bash
export CUSTOM_ROUTER_PATH="/path/to/custom-router.js"
```

Or set it in your shell configuration:

```bash
# ~/.bashrc or ~/.zshrc
export CUSTOM_ROUTER_PATH="/path/to/custom-router.js"
```

## Return Format

The router function should return a string in the format:

```
{provider-name},{model-name}
```

Example:

```
deepseek,deepseek-chat
```

## Error Handling

If your router function throws an error or returns an invalid format, the router will fall back to the default routing configuration.

## Example: Time-Based Routing

```javascript
module.exports = function(config, context) {
  const hour = new Date().getHours();

  // Use faster models during work hours
  if (hour >= 9 && hour <= 18) {
    return 'groq,llama-3.3-70b-versatile';
  }

  // Use more capable models outside work hours
  return 'deepseek,deepseek-chat';
};
```

## Example: Cost Optimization

```javascript
module.exports = function(config, context) {
  const { tokenCount } = context;

  // Use cheaper models for large requests
  if (tokenCount > 50000) {
    return 'groq,llama-3.3-70b-versatile';
  }

  // Use default for smaller requests
  return 'deepseek,deepseek-chat';
};
```

## Testing Your Router

Test your custom router by checking the logs:

```bash
tail -f ~/.claude-code-router/claude-code-router.log
```

Look for routing decisions to see which model is being selected.

## Next Steps

- [Agents](/docs/advanced/agents) - Extend functionality with agents
- [Presets](/docs/advanced/presets) - Use predefined configurations
