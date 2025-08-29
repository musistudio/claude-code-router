# Claude Code Router - Project Context

## Project Overview

Claude Code Router is a powerful tool that routes Claude Code requests to different LLM models and customizes any request. It allows users to connect Claude Code to various model providers without needing an Anthropic account.

### Key Features
- **Model Routing**: Route requests to different models based on needs (background tasks, thinking, long context)
- **Multi-Provider Support**: Supports providers like OpenRouter, DeepSeek, Ollama, Gemini, Volcengine, SiliconFlow
- **Request/Response Transformation**: Customize requests and responses for different providers using transformers
- **Dynamic Model Switching**: Switch models on-the-fly within Claude Code using the `/model` command
- **GitHub Actions Integration**: Trigger Claude Code tasks in GitHub workflows
- **Plugin System**: Extend functionality with custom transformers
- **Execution Guard**: Advanced traffic control with rate limiting, circuit breaker, deduplication, and queue management

## Project Structure

```
claude-code-router/
├── src/
│   ├── cli.ts              # Command line interface
│   ├── index.ts            # Main application entry point
│   ├── server.ts           # Server initialization
│   ├── constants.ts        # Configuration constants
│   ├── utils/              # Utility functions
│   ├── routes/             # API route handlers
│   ├── middleware/         # Middleware functions
│   └── providers/          # Provider-specific code
├── dist/                   # Compiled JavaScript output
├── scripts/                # Build and utility scripts
├── ui/                     # Web-based user interface
├── package.json            # Project dependencies and scripts
└── README.md              # Project documentation
```

## Core Technologies

- **Language**: TypeScript/JavaScript
- **Runtime**: Node.js
- **Framework**: Fastify (via @musistudio/llms package)
- **Build Tool**: esbuild
- **Dependencies**: 
  - @musistudio/llms (core LLM routing library)
  - tiktoken (token counting)
  - pino-rotating-file-stream (logging)
  - json5 (configuration parsing)

## Building and Running

### Installation
```bash
# Install globally
npm install -g @musistudio/claude-code-router

# Or install locally
npm install @musistudio/claude-code-router
```

### Development Commands
```bash
# Build the project
npm run build

# Start the server
npm run start
# or
ccr start

# Run in development mode
npm run ccr:local

# Start Claude Code with router
npm run code:local
# or
ccr code

# Open the web UI
ccr ui

# Check status
ccr status

# Restart service
ccr restart

# Stop service
ccr stop
```

### Publishing
```bash
# Build and publish to npm
npm run release
```

## Configuration

The configuration file is located at `~/.claude-code-router/config.json`. Key configuration sections include:

### Core Settings
- `PROXY_URL`: Proxy for API requests
- `LOG`: Enable/disable logging
- `LOG_LEVEL`: Logging level (fatal, error, warn, info, debug, trace)
- `APIKEY`: Secret key for request authentication
- `HOST`: Server host address
- `NON_INTERACTIVE_MODE`: Enable for CI/CD environments
- `API_TIMEOUT_MS`: API call timeout in milliseconds

### Providers
Array of model providers with:
- `name`: Unique provider name
- `api_base_url`: API endpoint
- `api_key`: Provider API key
- `models`: List of available models
- `transformer`: Transformers to process requests/responses

### Router
Routing rules:
- `default`: Default model for general tasks
- `background`: Model for background tasks
- `think`: Model for reasoning-heavy tasks
- `longContext`: Model for long context handling
- `longContextThreshold`: Token threshold for long context routing
- `webSearch`: Model for web search tasks

### Environment Variable Interpolation
Supports environment variable interpolation using `$VAR_NAME` or `${VAR_NAME}` syntax.

## Architecture

### Core Components

1. **CLI Interface** (`src/cli.ts`): Handles command-line commands like start, stop, restart, status, code, ui
2. **Main Server** (`src/index.ts`): Initializes configuration, logging, and starts the Fastify server
3. **Routing Engine** (`src/utils/router.ts`): Determines which provider/model to use based on request content and configuration
4. **Execution Guard** (`src/utils/ExecutionGuard.ts`): Advanced traffic control with rate limiting, circuit breaker, deduplication, and queue management
5. **Transformers**: Modify request/response payloads for provider compatibility
6. **Analytics System**: Tracks usage statistics and performance metrics

### Request Flow
1. CLI command triggers server start or routes command to Claude Code
2. Incoming requests pass through middleware for authentication and preprocessing
3. Router determines appropriate provider/model based on configuration and request content
4. Execution Guard applies traffic control policies
5. Transformers modify request for provider compatibility
6. Request is sent to provider API
7. Response is transformed back to Claude Code format
8. Analytics tracks the request/response for monitoring

### Transformers
Transformers adapt requests/responses for different provider APIs:
- `Anthropic`: Preserves original parameters
- `deepseek`: Adapts for DeepSeek API
- `gemini`: Adapts for Gemini API
- `openrouter`: Adapts for OpenRouter API
- `maxtoken`: Sets specific max_tokens value
- `tooluse`: Optimizes tool usage
- Custom transformers can be loaded via config

## Development

### Key Development Scripts
- `./scripts/install-local.sh`: Install local version globally
- `./scripts/update-local.sh`: Update global installation with local changes
- `./scripts/restore-original.sh`: Restore original npm version

### Development Guidelines
- Follow MERGE-SAFE DEVELOPMENT strategy
- Keep components modular and independent
- Maintain backward compatibility
- Document all new features
- Test thoroughly before committing

## API Endpoints

### Core Endpoints
- `POST /v1/messages`: Main Claude Code API endpoint
- `GET /api/config`: Read configuration
- `POST/PUT /api/config`: Save configuration
- `GET /api/restart`: Restart service
- `GET /ui/`: Web-based user interface

### Analytics & Monitoring
- `GET /api/execution-guard/stats`: Execution guard statistics
- `GET /api/execution-guard/health`: Health status
- `GET /api/v1/mission-control/stats`: Mission control dashboard data
- Various mission control endpoints for monitoring and control

### Optimization
- `GET /api/optimization/settings`: Load optimization settings
- `POST /api/optimization/settings`: Save optimization settings
- Router model management endpoints

## Execution Guard Features

Advanced traffic control system with:
- Request deduplication
- Rate limiting (per minute, hour, day, burst)
- Circuit breaker pattern
- Request queuing
- Retry with exponential backoff
- Provider fallback mechanisms
- Key rotation management

## Customization

### Custom Router
Specify `CUSTOM_ROUTER_PATH` in config.json to implement complex routing logic beyond default scenarios.

### Custom Transformers
Load custom transformers via the `transformers` field in config.json.

### Plugins
Create plugins in the `~/.claude-code-router/plugins/` directory.

## GitHub Actions Integration

Integrate with CI/CD pipelines by modifying `.github/workflows/claude.yaml` to use the router with `NON_INTERACTIVE_MODE` set to true.

## Troubleshooting

### Common Issues
1. Service not starting: Check logs in `~/.claude-code-router/logs/`
2. Provider connectivity: Verify API keys and endpoints in config.json
3. Routing issues: Check router configuration and custom router script
4. Performance problems: Review Execution Guard settings and analytics

### Log Files
- Server-level logs: `~/.claude-code-router/logs/ccr-*.log`
- Application-level logs: `~/.claude-code-router/claude-code-router.log`