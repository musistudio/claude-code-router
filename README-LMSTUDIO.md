# LM Studio Integration with Claude Code Router

This guide explains how to integrate Claude Code Router (CCR) with LM Studio to use local models with Claude Code.

## Prerequisites

1. [LM Studio](https://lmstudio.ai/) installed and running
2. [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart) installed
3. Claude Code Router installed: `npm install -g @musistudio/claude-code-router`

## Quick Setup

1. **Start LM Studio**:
   - Open LM Studio
   - Load a model (e.g., `google/gemma-3n-e4b`)
   - Start the local server (typically on `http://localhost:1234`)

2. **Configure CCR for LM Studio**:
   ```bash
   ./setup-lmstudio.sh
   ```

3. **Start CCR**:
   ```bash
   ccr start
   ```

4. **Use Claude Code with LM Studio**:
   ```bash
   ccr code "What is the capital of France?"
   ```

## Manual Configuration

If you prefer to configure manually, create `~/.claude-code-router/config.json`:

```json
{
  "Providers": [
    {
      "name": "lmstudio",
      "api_base_url": "http://localhost:1234/v1/chat/completions",
      "api_key": "lm-studio",
      "models": ["your-model-name"]
    }
  ],
  "Router": {
    "default": "lmstudio,your-model-name",
    "background": "lmstudio,your-model-name",
    "think": "lmstudio,your-model-name",
    "longContext": "lmstudio,your-model-name",
    "longContextThreshold": 60000,
    "webSearch": "lmstudio,your-model-name"
  },
  "API_TIMEOUT_MS": 600000,
  "LOG": true
}
```

## Configuration Options

### Model Configuration
Update the `models` array with your loaded LM Studio model:
```json
"models": ["microsoft/DialoGPT-medium", "meta-llama/Llama-2-7b-chat-hf"]
```

### Custom API Endpoint
If LM Studio runs on a different port:
```json
"api_base_url": "http://localhost:8080/v1/chat/completions"
```

### Multiple Models Setup
Configure different models for different tasks:
```json
{
  "Providers": [
    {
      "name": "lmstudio",
      "api_base_url": "http://localhost:1234/v1/chat/completions",
      "api_key": "lm-studio",
      "models": ["google/gemma-3n-e4b", "microsoft/DialoGPT-medium"]
    }
  ],
  "Router": {
    "default": "lmstudio,google/gemma-3n-e4b",
    "background": "lmstudio,microsoft/DialoGPT-medium",
    "think": "lmstudio,google/gemma-3n-e4b"
  }
}
```

## Advanced Configuration

### Adding Transformers
While LM Studio doesn't typically need transformers (it's OpenAI-compatible), you can add them for custom behavior:

```json
{
  "name": "lmstudio",
  "api_base_url": "http://localhost:1234/v1/chat/completions",
  "api_key": "lm-studio",
  "models": ["google/gemma-3n-e4b"],
  "transformer": {
    "use": [
      [
        "maxtoken",
        {
          "max_tokens": 4096
        }
      ]
    ]
  }
}
```

### Custom Router
Create a custom router for LM Studio specific logic:

```javascript
// ~/.claude-code-router/custom-lmstudio-router.js
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find((m) => m.role === "user")?.content;
  
  // Use a specific model for code-related queries
  if (userMessage && userMessage.toLowerCase().includes("code")) {
    return "lmstudio,google/gemma-3n-e4b";
  }
  
  // Default to configured router
  return null;
};
```

Then in your config:
```json
{
  "CUSTOM_ROUTER_PATH": "$HOME/.claude-code-router/custom-lmstudio-router.js"
}
```

## Testing Your Setup

1. **Test basic functionality**:
   ```bash
   ccr code "Hello, how are you?"
   ```

2. **Test with longer context**:
   ```bash
   ccr code "Explain the concept of machine learning in detail"
   ```

3. **Check routing**:
   ```bash
   ccr status
   ```

## Troubleshooting

### Common Issues

1. **Connection refused**: Make sure LM Studio server is running
2. **Model not found**: Ensure the model name in config matches the loaded model in LM Studio
3. **Timeout errors**: Increase `API_TIMEOUT_MS` in config for slower local models

### Debug Mode
Enable logging for troubleshooting:
```json
{
  "LOG": true
}
```

View logs:
```bash
tail -f ~/.claude-code-router.log
```

### Testing LM Studio API Directly
Test the LM Studio API directly with curl (same as your original command):

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-3n-e4b",
    "messages": [
      { "role": "system", "content": "Always answer in rhymes. Today is Thursday" },
      { "role": "user", "content": "What day is it today?" }
    ],
    "temperature": 0.7,
    "max_tokens": -1,
    "stream": false
}'
```

## Benefits of Using CCR with LM Studio

1. **Unified Interface**: Use Claude Code with local models
2. **Routing Logic**: Automatically route different types of requests to appropriate models
3. **Easy Model Switching**: Switch between local and cloud models seamlessly
4. **Cost Effective**: Use local models for development and testing
5. **Privacy**: Keep sensitive code on your local machine

## Example Workflows

### Development Workflow
```bash
# Use local model for quick iterations
ccr code "Review this Python function for bugs"

# Switch to cloud model for complex tasks
/model openrouter,anthropic/claude-3.5-sonnet
```

### Mixed Model Setup
Configure different models for different scenarios in your config.json and let CCR automatically route requests based on context, token count, and task type.