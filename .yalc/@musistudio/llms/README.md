# LLMs

> A universal LLM API transformation server, initially developed for the [claude-code-router](https://github.com/musistudio/claude-code-router).

## How it works

The LLM API transformation server acts as a middleware to standardize requests and responses between different LLM providers (Anthropic, Gemini, Deepseek, etc.). It uses a modular transformer system to handle provider-specific API formats.

### Key Components

1. **Transformers**: Each provider (e.g., Anthropic, Gemini) has a dedicated transformer class that implements:

   - `transformRequestIn`: Converts the provider's request format to a unified format.
   - `transformResponseIn`: Converts the provider's response format to a unified format.
   - `transformRequestOut`: Converts the unified request format to the provider's format.
   - `transformResponseOut`: Converts the unified response format back to the provider's format.
   - `endPoint`: Specifies the API endpoint for the provider (e.g., "/v1/messages" for Anthropic).

2. **Unified Formats**:

   - Requests and responses are standardized using `UnifiedChatRequest` and `UnifiedChatResponse` types.

3. **Streaming Support**:
   - Handles real-time streaming responses for providers like Anthropic, converting chunked data into a standardized format.

### Data Flow

1. **Request**:

   - Incoming provider-specific requests are transformed into the unified format.
   - The unified request is processed by the server.

2. **Response**:
   - The server's unified response is transformed back into the provider's format.
   - Streaming responses are handled with chunked data conversion.

### Example Transformers

- **Anthropic**: Converts between OpenAI-style and Anthropic-style message formats. Handles thinking parameters.
- **OpenAI**: Handles GPT-5 API transformations including parameter conversion and reasoning format handling.
- **Reasoning**: Processes reasoning parameters, converting token budgets to effort levels for GPT-5/o3 models.
- **Gemini**: Adjusts tool definitions and parameter formats for Gemini compatibility.
- **Deepseek**: Enforces token limits and handles reasoning content in streams.

## Run this repo

- **Install dependencies:**
  ```sh
  npm install
  # or pnpm install
  ```
- **Development:**
  ```sh
  npm run dev
  # Uses nodemon + tsx for hot-reloading src/server.ts
  ```
- **Build:**
  ```sh
  npm run build
  # Outputs to dist/cjs and dist/esm
  ```
- **Test:**
  ```sh
  npm test
  # See CLAUDE.md for details
  ```
- **Path alias:**
  - `@` is mapped to the `src` directory, use `import xxx from '@/xxx'`.
- **Environment variables:**
  - Supports `.env` and `config.json`, see `src/services/config.ts`.

---

## Working with this repo

[👉 Contributing Guide](./CONTRIBUTING.md)
