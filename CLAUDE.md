# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Development Commands

### Build & Distribution
- `npm run build` - Build TypeScript to `dist/cli.js` using esbuild, includes tiktoken WASM file
- `ccr start` - Start the proxy server (background service on port 3456)
- `ccr stop` - Stop the background service
- `ccr status` - Check service status
- `ccr code` - Execute Claude Code command (auto-starts service if needed)

### Development Testing
- Test CLI commands: `node dist/cli.js [command]`
- Test plugin loading: Place plugins in `~/.claude-code-router/plugins/`
- Debug with logging: Set `"log": true` in config

## Architecture

### Core Components
- **CLI Entry** (`src/cli.ts`): Command-line interface with service management
- **Proxy Server** (`src/server.ts`): Express server that intercepts Claude Code API calls
- **Request Pipeline**: Middleware chain processes and routes requests to different LLM providers

### Middleware Pipeline (src/middlewares/)
1. **rewriteBody**: Modifies request body and loads plugins
2. **router**: Intelligent model selection based on context length and request type
3. **formatRequest**: Converts Anthropic API format to OpenAI format

### Model Routing Logic (src/middlewares/router.ts)
- **Background Tasks**: Routes `claude-3-5-haiku` requests to lightweight models (local Ollama)
- **Long Context**: Routes requests >32K tokens to high-context models (Gemini)
- **Reasoning**: Routes requests with `thinking` parameter to reasoning models (DeepSeek-R1)
- **Token Counting**: Uses tiktoken to estimate context size for routing decisions

### Plugin System
- Plugins are Node.js modules in `~/.claude-code-router/plugins/`
- Loaded dynamically via `usePlugins` config array
- Can modify request/response through middleware pattern
- Examples: `notebook-tools-filter.js` (removes Jupyter tools), `toolcall-improvement.js` (adds tool usage prompts)

### Configuration System
- Primary config: `~/.claude-code-router/config.json`
- Supports multiple providers (OpenRouter, DeepSeek, Ollama, etc.)
- Environment variable support for API keys
- Auto-generates `.claude.json` for Claude Code compatibility

### Service Management
- Background service with PID file tracking (`src/utils/processCheck.ts`)
- Auto-start capability when running `ccr code`
- Process cleanup on SIGINT/SIGTERM
- Reference counting for multiple instances

## Development Patterns

### Adding New Providers
- Add provider configuration to `config.json` Providers array
- Provider instances cached with LRU cache (2-hour TTL)
- Automatic fallback to default provider

### Creating Plugins
```javascript
module.exports = async function handle(req, res) {
  // Modify req.body or req properties
  // Plugin runs before model routing
};
```

### Model Selection Strategy
The router automatically selects models based on:
- **Context length**: >32K tokens → long context model
- **Model type**: claude-3-5-haiku → background model  
- **Reasoning mode**: thinking parameter → reasoning model
- **Explicit model**: `/model provider,model` command

### Testing Integration
- GitHub Actions support with custom workflow
- Docker deployment with environment configuration
- Supports both local development and cloud deployment