# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router is a tool that routes Claude Code requests to different LLM providers. It uses a Monorepo architecture with four main packages:

- **cli** (`@CCR/cli`): Command-line tool providing the `ccr` command
- **server** (`@CCR/server`): Core server handling API routing and transformations
- **shared** (`@CCR/shared`): Shared constants, utilities, and preset management
- **ui** (`@CCR/ui`): Web management interface (React + Vite)
- **core** (`@musistudio/llms`): External dependency providing core server framework and transformer functionality
- **docs**: Docusaurus documentation site

## Build Commands

### Build all packages
```bash
pnpm build
```

### Build individual packages
```bash
pnpm build:core      # Build core package (@musistudio/llms)
pnpm build:shared     # Build shared package
pnpm build:server     # Build server package
pnpm build:cli        # Build CLI package
pnpm build:ui         # Build UI package
pnpm build:docs       # Build documentation
```

### Development mode
```bash
pnpm dev:core        # Develop core (tsx watch)
pnpm dev:shared      # Not available - use build
pnpm dev:server      # Develop server (ts-node)
pnpm dev:cli         # Develop CLI (ts-node)
pnpm dev:ui          # Develop UI (Vite)
pnpm dev:docs        # Develop docs (Docusaurus start)
```

### Lint
```bash
cd packages/ui && pnpm lint
cd packages/core && pnpm lint
```

### Publish
```bash
pnpm release           # Build and publish all packages
pnpm release:npm       # Publish to npm only
pnpm release:docker    # Publish Docker image only
```

## Core Architecture

### 1. Routing System (packages/server/src/utils/router.ts)

The routing logic determines which model a request should be sent to:

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

The project uses the `@musistudio/llms` package (packages/core) to handle request/response transformations. Transformers adapt to different provider API differences:

- Built-in transformers: `anthropic`, `deepseek`, `gemini`, `openrouter`, `groq`, `maxtoken`, `tooluse`, `reasoning`, `enhancetool`, `sampling`, `cleancache`, `vertex-gemini`, `chutes-glm`, `qwen-cli`, `rovo-cli`
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

```bash
ccr start      # Start server
ccr stop       # Stop server
ccr restart    # Restart server
ccr status     # Show status
ccr code       # Execute claude command
ccr model      # Interactive model selection and configuration
ccr preset     # Manage presets (export, install, list, info, delete)
ccr activate   # Output shell environment variables (for integration)
ccr ui         # Open Web UI
ccr statusline # Integrated statusline (reads JSON from stdin)
```

### Preset Commands

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
  - `installPreset(preset, config, options)`: Install preset to config
  - `loadPreset(source)`: Load preset from directory
  - `listPresets()`: List all installed presets
  - `isPresetInstalled(presetName)`: Check if preset is installed
  - `validatePreset(preset)`: Validate preset structure

- **merge.ts**: Merge preset configuration with existing config
  - Handles conflicts using different strategies (ask, overwrite, merge, skip)

- **sensitiveFields.ts**: Identify and sanitize sensitive fields
  - Detects api_key, password, secret fields automatically
  - Replaces sensitive values with environment variable placeholders

### CLI Integration

The CLI layer (`packages/cli/src/utils/preset/`) handles:
- User interaction and prompts
- File operations
- Display formatting

Key files:
- `commands.ts`: Command handlers for `ccr preset` subcommands
- `export.ts`: CLI wrapper for export functionality
- `install.ts`: CLI wrapper for install functionality

### 7. Pool Load Balancing System

**Location**: `packages/core/src/pool/`

The pool system provides weighted round-robin load balancing with automatic health suppression and recovery for route targets.

#### Configuration

Each route scenario (`default`, `think`, `background`, `webSearch`, `longContext`) can be configured as either:

**Legacy (single target)**:
```json
{
  "Router": {
    "default": "ollama,glm-4:cloud"
  }
}
```

**New (pooled targets)**:
```json
{
  "Router": {
    "default": {
      "strategy": "weighted_round_robin",
      "targets": [
        { "model": "ollama,glm-4:cloud", "weight": 3 },
        { "model": "ollama,qwen3.5:35b", "weight": 2 }
      ],
      "health": {
        "cooldown_ms": 60000,
        "recovery_interval_ms": 30000,
        "recovery_step": 1
      }
    }
  }
}
```

#### Architecture

**Core Components**: `types.ts` - Type definitions for configuration and runtime state
- `config.ts` - Configuration parsing and validation
- `selection.ts` - Weighted round-robin algorithm
- `health.ts` - Failure classification and recovery management
- `index.ts` - Public API and state management

**Router Integration**: The router (`packages/core/src/utils/router.ts`) checks each route scenario at runtime:
- If route is a pool config → performs weighted selection
- If route is a legacy string → uses as-is
- Pools initialized lazily on first request

#### Weighted Round-Robin Selection

Uses smooth weighted round-robin algorithm for proportional distribution:

1. Filter eligible targets (effective weight > 0)
2. Increment all currentWeights by effectiveWeights
3. Select target with highest currentWeight
4. Subtract sum of effectiveWeights from selected target's currentWeight

**Properties**: Deterministic, avoids clustering, proportional distribution

#### Health Management

**Failure Classification**:
- **Mark unhealthy**: HTTP 429 (rate limit), HTTP 5xx (server error), network/timeout errors
- **Ignore**: HTTP 400/401/403/404 (client errors, not health issues)

**Suppression Flow**:
1. Failure detected → set effectiveWeight = 0
2. Set suppressedUntil = now + cooldown_ms
3. Increment consecutiveFailures counter
4. Log `pool_target_failed` event

**Recovery Flow** (lazy evaluation):
1. Check if now >= suppressedUntil
2. Start recovery phase
3. Every recovery_interval_ms, increment effectiveWeight by recovery_step
4. Cap at defaultWeight
5. Stop when effectiveWeight == defaultWeight
6. Log recovery steps

#### Fail-Open Policy

When all targets suppressed:
- Select target with earliest recovery time (suppressedUntil or lastFailureAt + cooldown_ms)
- Log `pool_all_targets_unhealthy` event
- Continue routing (don't fail request)

#### Observability

**Structured Log Events**:
```javascript
// Selection
logger.info({
  event: 'pool_target_selected',
  scenario: 'default',
  model: 'ollama,glm-4:cloud',
  effectiveWeight: 3,
  selectedFrom: 'healthy' | 'fail_open'
})

// Failure
logger.warn({
  event: 'pool_target_failed',
  scenario: 'default',
  model: 'ollama,glm-4:cloud',
  httpStatus: 429,
  suppressedUntil: timestamp
})

// Recovery step
logger.debug({
  event: 'pool_target_recovery_step',
  scenario: 'default',
  model: 'ollama,glm-4:cloud',
  newWeight: 2,
  targetWeight: 5
})

// All targets down
logger.warn({
  event: 'pool_all_targets_unhealthy',
  scenario: 'default',
  policy: 'fail_open_oldest_recovery',
  selectedModel: 'ollama,glm-4:cloud'
})
```

#### Default Values

```json
{
  "cooldown_ms": 60000,
  "recovery_interval_ms": 30000,
  "recovery_step": 1
}
```

#### Design Constraints

- **In-memory state**: Each process maintains its own health state (no distributed coordination)
- **No timers**: Recovery uses lazy evaluation on each selection
- **Restart resets state**: All effectiveWeights return to config defaults on restart
- **No dependencies**: Uses existing logger, no external libraries
- **Backward compatible**: Legacy string routes work identically

#### Implementation Files

- `packages/core/src/pool/types.ts` - Type definitions
- `packages/core/src/pool/config.ts` - Validation and parsing
- `packages/core/src/pool/selection.ts` - WRR algorithm
- `packages/core/src/pool/health.ts` - Health management
- `packages/core/src/pool/index.ts` - Public API
- `packages/core/src/utils/router.ts` - Router integration

#### Testing Strategy

Tests located in `packages/core/src/pool/__tests__/`:
- `config.test.ts` - Configuration validation (~12 tests)
- `selection.test.ts` - WRR algorithm (~10 tests)
- `health.test.ts` - Failure and recovery (~15 tests)

Run tests: `npm test -- packages/core/src/pool/__tests__/`

## Dependencies

```
cli → server → shared
server → @musistudio/llms (packages/core)
ui (standalone frontend application)
docs (Docusaurus documentation)
```

## Development Notes

1. **Node.js version**: Requires >= 18.0.0 (root package.json specifies >= 20.0.0, docs specify >= 18.0.0)
2. **Package manager**: Uses pnpm (monorepo depends on workspace protocol)
3. **TypeScript**: All packages use TypeScript, but UI package is ESM module
4. **Build tools**:
   - cli/server/shared/core: esbuild
   - ui: Vite + TypeScript
   - docs: Docusaurus
5. **@musistudio/llms**: This is the core package (packages/core) providing the core server framework and transformer functionality, type definitions in `packages/server/src/types.d.ts`
6. **Code comments**: All comments in code MUST be written in English
7. **Documentation**: When implementing new features, add documentation to the docs project instead of creating standalone md files
8. **No tests**: The project currently does not have a test suite configured