# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router is a tool that routes Claude Code requests to different LLM providers. It uses a Monorepo architecture with four main packages:

- **cli** (`@musistudio/claude-code-router`): Command-line tool providing the `ccr` command
- **server** (`@CCR/server`): Core server handling API routing and transformations
- **shared** (`@CCR/shared`): Shared constants, utilities, and preset management
- **ui** (`@CCR/ui`): Web management interface (React + Vite)

### Core Objectives
- **Model Versatility**: Enable Claude Code to leverage the best model for a specific task (e.g., high-reasoning models for Plan Mode vs. lightweight models for background tasks).
- **Cost & Performance Optimization**: Route requests based on complexity, token counts, or provider performance.
- **Provider Abstraction**: Create a unified interface that abstracts the differences between various LLM provider APIs.

### Getting Started
The fastest way to start and verify the build is using Docker Compose:
1. **Launch with Docker**: `cd packages/server && docker compose up --build -d`
2. **Setup configuration**: `ccr preset install <source>` or manually edit the configuration file.
3. **Verify**: Use `ccr code` to execute a command or open the UI via `ccr ui`.

*Alternative (Local Development)*: If you prefer to run locally without Docker, run `pnpm install` first, then use the `pnpm dev:*` commands.

## Knowledge Base
For critical lessons learned regarding LLM provider integrations (e.g., DeepSeek reasoning replay, Mistral thinking formats, Gemini streaming issues, Gemini Nano constraints), refer to `tasks/lessons.md`. This file contains the "hard-won" knowledge required to avoid common provider-specific pitfalls.

## Build Commands

### Primary: Build and run via Docker Compose (Recommended for verification)
This is the preferred method to verify the build and deployment configuration.
```bash
cd packages/server
docker compose up --build -d
```

Useful follow-up commands:
```bash
docker compose logs -f ccr
docker compose restart ccr
docker compose down
```

Notes:
- The compose file is `packages/server/docker-compose.yml`.
- It builds from the repo root using `packages/server/Dockerfile`.
- Runtime config is mounted from `packages/server/ccr-config` to `/root/.claude-code-router` in the container.
- The proxy listens on `http://localhost:3456`.
- After editing `packages/server/ccr-config/config.json`, restart the `ccr` service.

### Secondary: Local Build (pnpm)
Use these commands for local development and iterative coding.

#### Build all packages
```bash
pnpm build
```

#### Build individual packages
```bash
pnpm build:cli      # Build CLI
pnpm build:server   # Build Server
pnpm build:ui       # Build UI
```

#### Development mode
```bash
pnpm dev:cli        # Develop CLI (ts-node)
pnpm dev:server     # Develop Server (ts-node)
pnpm dev:ui         # Develop UI (Vite)
```

### Publish
```bash
pnpm release        # Build and publish all packages
```

## Core Architecture

### 1. Routing System

The routing logic is handled by the core framework in the `@musistudio/llms` package. It determines which model a request should be sent to:

- **Default routing**: Uses `Router.default` configuration
- **Project-level routing**: Checks `~/.claude/projects/<project-id>/claude-code-router.json`
- **Custom routing**: Loads custom JavaScript router function via `CUSTOM_ROUTER_PATH`
- **Built-in scenario routing**:
  - `background`: Background tasks (typically lightweight models)
  - `think`: Thinking-intensive tasks (Plan Mode)
  - `longContext`: Long context (exceeds `longContextThreshold` tokens)
  - `webSearch`: Web search tasks
  - `image`: Image-related tasks

Token calculation uses `tiktoken` (cl100k_base) to estimate request size.

### 2. Transformer System

The project uses the `@musistudio/llms` package (external dependency) to handle request/response transformations. Transformers adapt to different provider API differences:

- Built-in transformers: `anthropic`, `deepseek`, `gemini`, `openrouter`, `groq`, `maxtoken`, `tooluse`, `reasoning`, `enhancetool`, etc.
- Custom transformers: Load external plugins via `transformers` array in `config.json`

Transformer configuration supports:
- Global application (provider level)
- Model-specific application
- Option passing (e.g., `max_tokens` parameter for `maxtoken`)

### 3. Agent System (packages/server/src/agents/)

Agents are pluggable feature modules that can:
- Detect whether to handle a request (`shouldHandle`)
- Modify requests (`reqHandler`)
- Provide custom tools (`tools`)

Built-in agents:
- **imageAgent**: Handles image-related tasks

Agent tool call flow:
1. Detect and mark agents in `preHandler` hook
2. Add agent tools to the request
3. Intercept tool call events in `onSend` hook
4. Execute agent tool and initiate new LLM request
5. Stream results back

### 4. SSE Stream Processing

The server uses custom Transform streams to handle Server-Sent Events:
- `SSEParserTransform`: Parses SSE text stream into event objects
- `SSESerializerTransform`: Serializes event objects into SSE text stream
- `rewriteStream`: Intercepts and modifies stream data (for agent tool calls)

### 5. Configuration Management

Configuration file location: `~/.claude-code-router/config.json`

Key features:
- Supports environment variable interpolation (`$VAR_NAME` or `${VAR_NAME}`)
- JSON5 format (supports comments)
- Automatic backups (keeps last 3 backups)
- Hot reload requires service restart (`ccr restart`)

Configuration validation:
- If `Providers` are configured, both `HOST` and `APIKEY` must be set
- Otherwise listens on `0.0.0.0` without authentication

### 6. Logging System

Two separate logging systems:

**Server-level logs** (pino):
- Location: `~/.claude-code-router/logs/ccr-*.log`
- Content: HTTP requests, API calls, server events
- Configuration: `LOG_LEVEL` (fatal/error/warn/info/debug/trace)

**Application-level logs**:
- Location: `~/.claude-code-router/claude-code-router.log`
- Content: Routing decisions, business logic events

## CLI Commands

Commands can be run locally or inside the Docker container using:
`docker exec -it <container_id> ccr <command>`

```bash
ccr start         # Start server
ccr stop          # Stop server
ccr restart       # Restart server
ccr status        # Show status
ccr code          # Execute claude command
ccr model         # Interactive model selection and configuration
ccr preset        # Manage presets (export, install, list, info, delete)
ccr activate      # Output shell environment variables (for integration)
ccr ui            # Open Web UI
ccr statusline    # Integrated statusline (reads JSON from stdin)
ccr codex-auth    # Authenticate with Codex API via OAuth
ccr chrome-bridge # Start Chrome on-device model bridge (Gemini Nano)
```

### Preset Commands

If running in Docker, use: `docker exec -it <container_id> ccr preset <subcommand>`

```bash
ccr preset export <name>      # Export current configuration as a preset
ccr preset install <source>   # Install a preset from file, URL, or name
ccr preset list               # List all installed presets
ccr preset info <name>        # Show preset information
ccr preset delete <name>      # Delete a preset
```

## Subagent Routing

Use special tags in subagent prompts to specify models:
```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Preset System

The preset system allows users to save, share, and reuse configurations easily.

### Preset Structure

Presets are stored in `~/.claude-code-router/presets/<preset-name>/manifest.json`

Each preset contains:
- **Metadata**: name, version, description, author, keywords, etc.
- **Configuration**: Providers, Router, transformers, and other settings
- **Dynamic Schema** (optional): Input fields for collecting required information during installation
- **Required Inputs** (optional): Fields that need to be filled during installation (e.g., API keys)

### Core Functions

Located in `packages/shared/src/preset/`:

- **export.ts**: Export current configuration as a preset directory
  - `exportPreset(presetName, config, options)`: Creates preset directory with manifest.json
  - Automatically sanitizes sensitive data (api_key fields become `{{field}}` placeholders)

- **install.ts**: Install and manage presets
  - `extractPreset(sourceZip, targetDir)`: Extract preset from ZIP file to target directory
  - `loadPreset(source)`: Load preset from directory
  - `listPresets()`: List all installed presets
  - `isPresetInstalled(presetName)`: Check if preset is installed
  - `validatePreset(preset)`: Validate preset structure

- **merge.ts**: Merge preset configuration with existing config
  - Handles conflicts using different strategies (ask, overwrite, merge, skip)

- **sensitiveFields.ts**: Identify and sanitize sensitive fields
  - Detects api_key, password, secret fields automatically
  - Replaces sensitive values with environment variable placeholders

### Preset File Format

**manifest.json** (in preset directory):
```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My configuration",
  "author": "Author Name",
  "keywords": ["openai", "production"],
  "Providers": [...],
  "Router": {...},
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "OpenAI API Key",
      "prompt": "Enter your OpenAI API key"
    }
  ]
}
```

### CLI Integration

The CLI layer (`packages/cli/src/utils/preset/`) handles:
- User interaction and prompts
- File operations
- Display formatting

Key files:
- `commands.ts`: Command handlers for `ccr preset` subcommands
- `export.ts`: CLI wrapper for export functionality
- `install.ts`: CLI wrapper for install functionality

## Dependencies

```
cli → server → shared
server → @musistudio/llms (core routing and transformation logic)
ui (standalone frontend application)
```

## Development Notes

1. **Node.js version**: Requires >= 18.0.0
2. **Package manager**: Uses pnpm (monorepo depends on workspace protocol)
3. **TypeScript**: All packages use TypeScript, but UI package is ESM module
4. **Build tools**:
   - cli/server/shared: esbuild
   - ui: Vite + TypeScript
5. **@musistudio/llms**: This is an external dependency package providing the core server framework and transformer functionality, type definitions in `packages/server/src/types.d.ts`
6. **Code comments**: All comments in code MUST be written in English
7. **Documentation**: When implementing new features, add documentation to the docs project instead of creating standalone md files

## Configuration Example Locations

- Main configuration example: Complete example in README.md
- Custom router example: `custom-router.example.js`
