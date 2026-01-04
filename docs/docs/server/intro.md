---
title: Server Introduction
---

# Server Introduction

Claude Code Router Server is a core service component responsible for routing Claude Code API requests to different LLM providers. It provides a complete HTTP API with support for:

- **API Request Routing**: Convert Anthropic-format requests to various provider API formats
- **Authentication & Authorization**: Support API Key authentication
- **Configuration Management**: Dynamic configuration of providers, routing rules, and transformers
- **Web UI**: Built-in management interface
- **Logging System**: Complete request logging

## Architecture Overview

```
┌─────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│ Claude Code │────▶│ CCR Server                  │────▶│ LLM Provider │
│   Client    │     │  ┌─────────────────────┐    │     │  (OpenAI/    │
└─────────────┘     │  │ @musistudio/llms    │    │     │   Gemini/etc)│
                    │  │ (Core Package)       │    │     └──────────────┘
                    │  │ - Request Transform  │    │
                    │  │ - Response Transform │    │
                    │  │ - Auth Handling      │    │
                    │  └─────────────────────┘    │
                    │                             │
                    │  - Routing Logic            │
                    │  - Agent System             │
                    │  - Configuration            │
                    └─────────────────────────────┘
                           │
                           ├─ Web UI
                           ├─ Config API
                           └─ Logs API
```

## Core Package: @musistudio/llms

The server is built on top of **@musistudio/llms**, a universal LLM API transformation library that provides the core request/response transformation capabilities.

### What is @musistudio/llms?

`@musistudio/llms` is a standalone npm package (`@musistudio/llms`) that handles:

- **API Format Conversion**: Transforms between different LLM provider APIs (Anthropic, OpenAI, Gemini, etc.)
- **Request/Response Transformation**: Converts requests and responses to a unified format
- **Authentication Handling**: Manages different authentication methods across providers
- **Streaming Support**: Handles streaming responses from different providers
- **Transformer System**: Provides an extensible architecture for adding new providers

### Key Concepts

#### 1. Unified Request/Response Format

The core package defines a unified format (`UnifiedChatRequest`, `UnifiedChatResponse`) that abstracts away provider-specific differences:

```typescript
interface UnifiedChatRequest {
  messages: UnifiedMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  tool_choice?: any;
  reasoning?: {
    effort?: ThinkLevel;
    max_tokens?: number;
    enabled?: boolean;
  };
}
```

#### 2. Transformer Interface

All transformers implement a common interface:

```typescript
interface Transformer {
  transformRequestIn?: (request: UnifiedChatRequest, provider: LLMProvider, context: TransformerContext) => Promise<any>;
  transformRequestOut?: (request: any, context: TransformerContext) => Promise<UnifiedChatRequest>;
  transformResponseIn?: (response: Response, context?: TransformerContext) => Promise<Response>;
  transformResponseOut?: (response: Response, context: TransformerContext) => Promise<Response>;
  endPoint?: string;
  name?: string;
  auth?: (request: any, provider: LLMProvider, context: TransformerContext) => Promise<any>;
}
```

#### 3. Built-in Transformers

The core package includes transformers for:
- **anthropic**: Anthropic API format
- **openai**: OpenAI API format
- **gemini**: Google Gemini API format
- **deepseek**: DeepSeek API format
- **groq**: Groq API format
- **openrouter**: OpenRouter API format
- And more...

### Integration with CCR Server

The CCR server integrates `@musistudio/llms` through:

1. **Transformer Service** (`packages/core/src/services/transformer.ts`): Manages transformer registration and instantiation
2. **Provider Configuration**: Maps provider configs to core package's LLMProvider interface
3. **Request Pipeline**: Applies transformers in sequence during request processing
4. **Custom Transformers**: Supports loading external transformer plugins

### Version and Updates

The current version of `@musistudio/llms` is `1.0.51`. It's published as an independent npm package and can be used standalone or as part of CCR Server.

## Core Features

### 1. Request Routing
- Token-count-based intelligent routing
- Project-level routing configuration
- Custom routing functions
- Scenario-based routing (background, think, longContext, etc.)

### 2. Request Transformation
- Supports API format conversion for multiple LLM providers
- Built-in transformers: Anthropic, DeepSeek, Gemini, OpenRouter, Groq, etc.
- Extensible transformer system

### 3. Agent System
- Plugin-based Agent architecture
- Built-in image processing Agent
- Custom Agent support

### 4. Configuration Management
- JSON5 format configuration file
- Environment variable interpolation
- Hot configuration reload (requires service restart)

## Use Cases

### Scenario 1: Personal Local Service
Run the service locally for personal Claude Code use:

```bash
ccr start
```

### Scenario 2: Team Shared Service
Deploy using Docker to provide shared service for team members:

```bash
docker run -d -p 3456:3456 musistudio/claude-code-router
```

### Scenario 3: Secondary Development
Build custom applications based on exposed APIs:

```bash
GET /api/config
POST /v1/messages
GET /api/logs
```

## Next Steps

- [Docker Deployment Guide](/docs/server/deployment) - Learn how to deploy the service
- [API Reference](/docs/category/api) - View complete API documentation
- [Configuration Guide](/docs/category/server-config) - Understand server configuration options
