# Project Overview

## Purpose
Universal LLM API transformation server (@musistudio/llms v1.0.26) - middleware to standardize requests/responses between different LLM providers (Anthropic, Gemini, Deepseek, OpenAI, etc.) using modular transformer system.

## Tech Stack
- **Language**: TypeScript with Node.js 18+ (ES2022 features)
- **Build System**: esbuild with dual CJS/ESM output
- **Server Framework**: Fastify with CORS support
- **Development**: nodemon + tsx for hot-reloading
- **Package Manager**: npm/pnpm supported

## Architecture
1. **Transformers**: Provider-specific request/response conversion classes
2. **Unified Formats**: UnifiedChatRequest and UnifiedChatResponse types  
3. **Streaming Support**: Real-time streaming response handling
4. **Service Layer**: ConfigService, LLMService, ProviderService, TransformerService

## Key Features
- 16+ transformers for various LLM providers and utilities
- Path aliases (`@` maps to `src` directory)
- Dual format builds (CommonJS and ESM)
- Environment configuration via .env or config.json
- Complete GPT-5 support with reasoning token handling