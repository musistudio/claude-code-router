# ccr-next

An enhanced fork of [claude-code-router](https://github.com/musistudio/claude-code-router) with additional features for dynamic provider configuration.

## Features

- Route Claude Code requests to different LLM providers
- Configure providers and transformers via command line
- Support for multiple LLM providers (OpenRouter, DeepSeek, Ollama, Gemini, etc.)
- Custom routing rules based on request context
- Background processing for non-critical tasks

## Installation

```bash
npm install -g ccr-next
```

## Quick Start

1. Start the router service:
```bash
ccr start
```

2. Configure providers on the fly:
```bash
ccr start --provider openrouter https://openrouter.ai/api/v1/chat/completions sk-xxx claude-3.5-sonnet,gpt-4
ccr start --transformer openrouter openrouter
```

3. Use Claude Code with the router:
```bash
ccr code "Write a Hello World program"
```

## Command Line Options

### Start Server with Provider Configuration

```bash
ccr start --provider <name> <url> <key> <models> --transformer <provider> <transformer>
```

Options:
- `--provider`: Add or update a provider
  - `name`: Provider name (e.g., openrouter, deepseek)
  - `url`: API base URL
  - `key`: API key
  - `models`: Comma-separated list of model names
- `--transformer`: Set transformer for a provider
  - `provider`: Provider name
  - `transformer`: Transformer name

Examples:
```bash
# Add OpenRouter provider
ccr start --provider openrouter https://openrouter.ai/api/v1/chat/completions sk-xxx claude-3.5-sonnet

# Add DeepSeek provider with transformer
ccr start --provider deepseek https://api.deepseek.com/chat/completions sk-xxx deepseek-chat --transformer deepseek deepseek

# Add multiple providers
ccr start \
  --provider openrouter https://openrouter.ai/api/v1/chat/completions sk-xxx claude-3.5-sonnet \
  --provider deepseek https://api.deepseek.com/chat/completions sk-xxx deepseek-chat
```

### Other Commands

- `ccr stop`: Stop the router service
- `ccr restart`: Restart the service (supports same options as start)
- `ccr status`: Show service status
- `ccr code "<prompt>"`: Execute Claude command through the router
- `ccr -v`: Show version
- `ccr -h`: Show help

## Configuration

The router uses a configuration file at `~/.claude-code-router/config.json`. You can either:
1. Edit this file directly
2. Use command line options to configure providers dynamically

See [config.example.json](https://github.com/yourusername/ccr-direct/blob/main/config.example.json) for configuration examples.

## License

MIT