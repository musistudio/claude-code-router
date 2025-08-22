# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

-   **Build the project**:
    ```bash
    npm run build
    ```
-   **Start the router server**:
    ```bash
    ccr start
    ```
-   **Stop the router server**:
    ```bash
    ccr stop
    ```
-   **Restart the server**:
    ```bash
    ccr restart
    ```
-   **Check the server status**:
    ```bash
    ccr status
    ```
-   **Run Claude Code through the router**:
    ```bash
    ccr code "<your prompt>"
    ```
    Note: The CCR proxy service auto-launches when you run `ccr code`
-   **Local development with yalc**:
    ```bash
    yalc publish    # After building changes
    yalc update @musistudio/llms    # Force CCR to use latest version
    ccr restart     # Restart to load updated package
    ```
-   **GPT-5/o3 Support Status**: ✅ PRODUCTION READY via OpenAI Chat Completions API with transformer chain `["reasoning", "openai"]` in config.json
-   **Release a new version**:
    ```bash
    npm run release
    ```

## Inline Reasoning Control Tokens

CCR supports inline tokens to control GPT-5 reasoning effort and response verbosity without requiring separate flags or configuration. Tokens are automatically detected, processed, and stripped from prompts before sending to the API.

### **Token Formats**

| Token | Position | Reasoning Effort | Verbosity | Thinking Budget | Use Case |
|-------|----------|------------------|-----------|-----------------|----------|
| `Quick:` | Prefix only | low | low | 500 tokens | Fast responses, simple queries |
| `Deep:` | Prefix only | high | medium | 2000 tokens | Complex analysis, thorough research |
| `Explain:` | Prefix only | medium | high | 1000 tokens | Detailed explanations, tutorials |
| `Brief:` | Prefix only | medium | low | 1000 tokens | Concise summaries, quick facts |
| `:quick` | Anywhere | low | low | 500 tokens | Same as Quick: |
| `:deep` | Anywhere | high | medium | 2000 tokens | Same as Deep: |
| `:explain` | Anywhere | medium | high | 1000 tokens | Same as Explain: |
| `:brief` | Anywhere | medium | low | 1000 tokens | Same as Brief: |

### **Usage Examples**

```bash
# Prefix tokens (beginning of prompt)
ccr code "Quick: List the OWASP Top 3"
ccr code "Deep: Analyze SQL injection attack patterns"
ccr code "Explain: How does JWT authentication work?"
ccr code "Brief: Summarize the OAuth 2.0 flow"

# Inline colon tokens (anywhere in prompt)
ccr code "Analyze this vulnerability :brief and suggest fixes"
ccr code "I need :deep analysis of this cryptographic implementation"
ccr code "Can you :explain the difference between XSS types?"
```

### **Parameter Mapping**

- **Reasoning Effort**: Controls internal GPT-5 thinking depth (`minimal/low/medium/high`)
- **Verbosity**: Controls output length and detail level (`low/medium/high`)  
- **Thinking Budget**: Token allocation for reasoning process (impacts response time)
- **Auto-routing**: Tokens automatically trigger "think" model routing for enhanced reasoning

### **Implementation**

Tokens are processed in CCR's router middleware (`src/utils/router.ts:153-210`) before API calls, ensuring:
- Tokens are stripped from user prompts
- Parameters are set correctly for downstream transformers
- Thinking mode is activated for appropriate models
- No conflicts with Claude Code's `#` memory system

## Configuration

- **Config file location**: `~/.claude-code-router/config.json`  
- **PID file location**: `~/.claude-code-router/.claude-code-router.pid`
- **Logs location**: `~/.claude-code-router/logs/`

## Architecture

This project is a TypeScript-based router for Claude Code requests. It allows routing requests to different large language models (LLMs) from various providers based on custom rules.

### **Core Separation of Concerns**
- **CCR (Claude Code Router)**: Handles routing decisions (which model to use based on rules)
- **LLMS Package**: Handles provider transformations (how to format requests for each API)
- **Principle**: CCR should never do provider-specific transformations; LLMS handles all API format conversions

### **Key Components**
-   **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, and `code`.
-   **Server**: The `ccr start` command launches a server that listens for requests from Claude Code. The server logic is initiated from `src/index.ts`.
-   **Configuration**: The router is configured via a JSON file located at `~/.claude-code-router/config.json`. This file defines API providers, routing rules, and custom transformers. An example can be found in `config.example.json`.
-   **Routing**: The core routing logic determines which LLM provider and model to use for a given request. It supports default routes for different scenarios (`default`, `background`, `think`, `longContext`, `webSearch`) and can be extended with a custom JavaScript router file. The router logic is in `src/utils/router.ts`.
-   **Provider Integration**: Delegates all API format handling to `@musistudio/llms` transformers. CCR focuses purely on routing logic and service management.
-   **Claude Code Integration**: When a user runs `ccr code`, the command is forwarded to the running router service. The service then processes the request, applies routing rules, and sends it to the configured LLM via LLMS transformers. If the service isn't running, `ccr code` will attempt to start it automatically.
-   **Automatic Service Management**: Uses reference counting to track active Claude Code sessions. Service auto-starts when first needed and auto-stops when all sessions end. Multiple concurrent sessions share the same service instance.
-   **Dependencies**: The project is built with `esbuild`. It has a key local dependency `@musistudio/llms` v1.0.26, which contains the universal LLM transformation server.
-   `@musistudio/llms` is implemented based on `fastify` and exposes `fastify`'s hook and middleware interfaces, allowing direct use of `server.addHook`.
- Never automatically commit to git under any circumstances

## Known Issues & Solutions

### **GPT-5 Reasoning Parameter Bug (RESOLVED 2025-08-21)**

**Issue**: Interactive mode `claude "Think hard..."` fails with "Unknown parameter: 'reasoning'" while print mode `claude -p "Think hard..."` works fine.

**Root Cause**: LLMS Anthropic transformer at `/Users/fredrikbranstrom/llms-dev/src/transformer/anthropic.transformer.ts:159-165` creates invalid `reasoning = {effort: "medium", enabled: true}` objects instead of `reasoning_effort = "medium"` strings required by OpenAI's consolidated GPT-5 API.

**Solution**: 
1. Remove faulty thinking→reasoning conversion from LLMS Anthropic transformer
2. Update OpenAI transformer to reject ALL reasoning parameters (OpenAI consolidated to GPT-5)  
3. Use only `reasoning_effort` parameter format for GPT-5 models

**Architecture Fix**: Maintain strict separation - CCR handles routing, LLMS handles transformations.

**Status**: Root cause identified, fix pending implementation.

**Documentation**: Complete analysis in `/Users/fredrikbranstrom/ccr-dev/GPT5_REASONING_DEBUG_MASTER.md` and `/Users/fredrikbranstrom/ccr-dev/DEBUG_PLAN_RESULTS.md`
