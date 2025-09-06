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
-   **Check the server status**:
    ```bash
    ccr status
    ```
-   **Run Claude Code through the router**:
    ```bash
    ccr code "<your prompt>"
    ```
-   **Release a new version**:
    ```bash
    npm run release
    ```
-   **Test Vertex AI integration**:
    ```bash
    # Using service account key file
    VERTEX_AI_PROJECT_ID=your-project-id VERTEX_AI_SERVICE_ACCOUNT_PATH=/path/to/key.json ccr start
    
    # Using Application Default Credentials
    gcloud auth application-default login
    VERTEX_AI_PROJECT_ID=your-project-id VERTEX_AI_USE_ADC=true ccr start
    ```

## Architecture

This project is a TypeScript-based router for Claude Code requests. It allows routing requests to different large language models (LLMs) from various providers based on custom rules.

-   **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, and `code`.
-   **Server**: The `ccr start` command launches a server that listens for requests from Claude Code. The server logic is initiated from `src/index.ts`.
-   **Configuration**: The router is configured via a JSON file located at `~/.claude-code-router/config.json`. This file defines API providers, routing rules, and custom transformers. An example can be found in `config.example.json`.
-   **Routing**: The core routing logic determines which LLM provider and model to use for a given request. It supports default routes for different scenarios (`default`, `background`, `think`, `longContext`, `webSearch`) and can be extended with a custom JavaScript router file. The router logic is likely in `src/utils/router.ts`.
-   **Providers and Transformers**: The application supports multiple LLM providers. Transformers adapt the request and response formats for different provider APIs.
-   **Claude Code Integration**: When a user runs `ccr code`, the command is forwarded to the running router service. The service then processes the request, applies routing rules, and sends it to the configured LLM. If the service isn't running, `ccr code` will attempt to start it automatically.
-   **Dependencies**: The project is built with `esbuild`. Key dependencies include:
    -   `@musistudio/llms`: Core logic for interacting with different LLM APIs
    -   `fastify`: Web server framework that `@musistudio/llms` is built on
    -   `google-auth-library`: Google Cloud authentication for Vertex AI integration
    -   `tiktoken`: Token counting for routing decisions
    -   `rotating-file-stream`: Log file management
    -   `uuid`, `dotenv`, `json5`: Utility libraries
-   **Build System**: Uses a custom build script at `scripts/build.js` with `esbuild` for TypeScript compilation
-   **Logging**: Dual logging system with rotating file streams in `~/.claude-code-router/logs/` for server logs and `claude-code-router.log` for application logs
-   **Agents**: Built-in agent system in `src/agents/` for handling specific tasks (e.g., image processing)
-   **Transformers**: Request/response transformation system for different LLM provider APIs
-   **Authentication**: Optional API key authentication via `x-api-key` header or `Authorization` bearer token
-   **Session Management**: Usage tracking and caching system for token counting and routing decisions
-   **Vertex AI Integration**: Support for Google Cloud Vertex AI with authentication and model access

## Vertex AI Configuration

The Vertex AI integration supports multiple authentication methods for accessing Vertex AI models.

### Authentication Methods

**Service Account Key File:**
```json
{
  "VERTEX_AI_PROJECT_ID": "your-gcp-project-id",
  "VERTEX_AI_LOCATION": "us-central1",
  "VERTEX_AI_SERVICE_ACCOUNT_PATH": "/path/to/service-account-key.json"
}
```

**Service Account Key JSON:**
```json
{
  "VERTEX_AI_PROJECT_ID": "your-gcp-project-id",
  "VERTEX_AI_LOCATION": "us-central1",
  "VERTEX_AI_SERVICE_ACCOUNT_KEY": "{\"type\":\"service_account\",...}"
}
```

**Application Default Credentials:**
```json
{
  "VERTEX_AI_PROJECT_ID": "your-gcp-project-id",
  "VERTEX_AI_LOCATION": "us-central1",
  "VERTEX_AI_USE_ADC": true
}
```

### Provider Configuration

```json
{
  "name": "vertex-ai",
  "api_base_url": "https://us-central1-aiplatform.googleapis.com/v1",
  "api_key": "vertex-ai-dynamic",
  "models": ["gemini-1.5-pro", "claude-3-5-sonnet"],
  "transformer": {
    "use": [["vertex-ai", {"projectId": "$VERTEX_AI_PROJECT_ID", "location": "$VERTEX_AI_LOCATION"}]]
  }
}
```

### Key Files for Vertex AI Integration

-   `src/utils/vertexAuth.ts`: Authentication management for Google Cloud
-   `transformers/vertex-ai.js`: Request/response transformation for Vertex AI models
-   `config.vertex-ai.example.json`: Configuration example

### Supported Models

The Vertex AI integration supports common models including:
-   **Gemini Models**: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro, gemini-1.0-pro-vision
-   **Claude Models**: claude-3-5-sonnet, claude-3-haiku, claude-3-sonnet

Model availability varies by region. The transformer automatically handles different API formats for each model type.
