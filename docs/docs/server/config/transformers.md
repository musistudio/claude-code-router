---
sidebar_position: 4
---

# Transformers

Transformers are the core mechanism for adapting API differences between LLM providers. They convert requests and responses between different formats, handle authentication, and manage provider-specific features.

## Understanding Transformers

### What is a Transformer?

A transformer is a plugin that:
- **Transforms requests** from the unified format to provider-specific format
- **Transforms responses** from provider format back to unified format
- **Handles authentication** for provider APIs
- **Modifies requests** to add or adjust parameters

### Data Flow

```
┌─────────────────┐
│ Incoming Request│ (Anthropic format from Claude Code)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformRequestOut            │ ← Parse incoming request to unified format
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  UnifiedChatRequest             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformRequestIn (optional)  │ ← Modify unified request before sending
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Provider API Call              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformResponseIn (optional) │ ← Convert provider response to unified format
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  transformResponseOut (optional)│ ← Convert unified response to Anthropic format
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Outgoing Response│ (Anthropic format to Claude Code)
└─────────────────┘
```

### Transformer Interface

All transformers implement the following interface:

```typescript
interface Transformer {
  // Convert unified request to provider-specific format
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext
  ) => Promise<Record<string, any>>;

  // Convert provider request to unified format
  transformRequestOut?: (
    request: any,
    context: TransformerContext
  ) => Promise<UnifiedChatRequest>;

  // Convert provider response to unified format
  transformResponseIn?: (
    response: Response,
    context?: TransformerContext
  ) => Promise<Response>;

  // Convert unified response to provider format
  transformResponseOut?: (
    response: Response,
    context: TransformerContext
  ) => Promise<Response>;

  // Custom endpoint path (optional)
  endPoint?: string;

  // Transformer name (for custom transformers)
  name?: string;

  // Custom authentication handler (optional)
  auth?: (
    request: any,
    provider: LLMProvider,
    context: TransformerContext
  ) => Promise<any>;

  // Logger instance (auto-injected)
  logger?: any;
}
```

### Key Types

#### UnifiedChatRequest

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
    effort?: ThinkLevel;  // "none" | "low" | "medium" | "high"
    max_tokens?: number;
    enabled?: boolean;
  };
}
```

#### UnifiedMessage

```typescript
interface UnifiedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null | MessageContent[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  thinking?: {
    content: string;
    signature?: string;
  };
}
```

## Built-in Transformers

### anthropic

Transforms requests to be compatible with Anthropic-style APIs:

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "providers": ["deepseek", "groq"]
    }
  ]
}
```

**Features:**
- Converts Anthropic message format to/from OpenAI format
- Handles tool calls and tool results
- Supports thinking/reasoning content blocks
- Manages streaming responses

### deepseek

Specialized transformer for DeepSeek API:

```json
{
  "transformers": [
    {
      "name": "deepseek",
      "providers": ["deepseek"]
    }
  ]
}
```

**Features:**
- DeepSeek-specific reasoning format
- Handles `reasoning_content` in responses
- Supports thinking budget tokens

### gemini

Transformer for Google Gemini API:

```json
{
  "transformers": [
    {
      "name": "gemini",
      "providers": ["gemini"]
    }
  ]
}
```

### maxtoken

Limits max_tokens in requests:

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      },
      "models": ["deepseek,deepseek-chat"]
    }
  ]
}
```

### customparams

Injects custom parameters into requests:

```json
{
  "transformers": [
    {
      "name": "customparams",
      "options": {
        "include_reasoning": true,
        "custom_header": "value"
      }
    }
  ]
}
```

## Creating Custom Transformers

### Simple Transformer: Modifying Requests

The simplest transformers just modify the request before it's sent to the provider.

**Example: Add a custom header to all requests**

```javascript
// custom-header-transformer.js
module.exports = class CustomHeaderTransformer {
  name = 'custom-header';

  constructor(options) {
    this.headerName = options?.headerName || 'X-Custom-Header';
    this.headerValue = options?.headerValue || 'default-value';
  }

  async transformRequestIn(request, provider, context) {
    // Add custom header (will be used by auth method)
    request._customHeaders = {
      [this.headerName]: this.headerValue
    };
    return request;
  }

  async auth(request, provider) {
    const headers = {
      'authorization': `Bearer ${provider.apiKey}`,
      ...request._customHeaders
    };
    return {
      body: request,
      config: { headers }
    };
  }
};
```

**Usage in config:**

```json
{
  "transformers": [
    {
      "name": "custom-header",
      "path": "/path/to/custom-header-transformer.js",
      "options": {
        "headerName": "X-My-Header",
        "headerValue": "my-value"
      }
    }
  ]
}
```

### Intermediate Transformer: Request/Response Conversion

This example shows how to convert between different API formats.

**Example: Mock API format transformer**

```javascript
// mockapi-transformer.js
module.exports = class MockAPITransformer {
  name = 'mockapi';
  endPoint = '/v1/chat';  // Custom endpoint

  // Convert from MockAPI format to unified format
  async transformRequestOut(request, context) {
    const messages = request.conversation.map(msg => ({
      role: msg.sender,
      content: msg.text
    }));

    return {
      messages,
      model: request.model_id,
      max_tokens: request.max_tokens,
      temperature: request.temp
    };
  }

  // Convert from unified format to MockAPI format
  async transformRequestIn(request, provider, context) {
    return {
      model_id: request.model,
      conversation: request.messages.map(msg => ({
        sender: msg.role,
        text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      })),
      max_tokens: request.max_tokens || 4096,
      temp: request.temperature || 0.7
    };
  }

  // Convert MockAPI response to unified format
  async transformResponseIn(response, context) {
    const data = await response.json();

    const unifiedResponse = {
      id: data.request_id,
      object: 'chat.completion',
      created: data.timestamp,
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.reply.text
        },
        finish_reason: data.stop_reason
      }],
      usage: {
        prompt_tokens: data.tokens.input,
        completion_tokens: data.tokens.output,
        total_tokens: data.tokens.input + data.tokens.output
      }
    };

    return new Response(JSON.stringify(unifiedResponse), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

### Advanced Transformer: Streaming Response Processing

This example shows how to handle streaming responses.

**Example: Add custom metadata to streaming responses**

```javascript
// streaming-metadata-transformer.js
module.exports = class StreamingMetadataTransformer {
  name = 'streaming-metadata';

  constructor(options) {
    this.metadata = options?.metadata || {};
    this.logger = null;  // Will be injected by the system
  }

  async transformResponseOut(response, context) {
    const contentType = response.headers.get('Content-Type');

    // Handle streaming response
    if (contentType?.includes('text/event-stream')) {
      return this.transformStream(response, context);
    }

    // Handle non-streaming response
    return response;
  }

  async transformStream(response, context) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const transformedStream = new ReadableStream({
      start: async (controller) => {
        const reader = response.body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }

              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }

              try {
                const chunk = JSON.parse(data);

                // Add custom metadata
                if (chunk.choices && chunk.choices[0]) {
                  chunk.choices[0].metadata = this.metadata;
                }

                // Log for debugging
                this.logger?.debug({
                  chunk,
                  context: context.req.id
                }, 'Transformed streaming chunk');

                const modifiedLine = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(encoder.encode(modifiedLine));
              } catch (parseError) {
                // If parsing fails, pass through original line
                controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          }
        } catch (error) {
          this.logger?.error({ error }, 'Stream transformation error');
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    });

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
};
```

### Real-World Example: Reasoning Content Transformer

This is based on the actual `reasoning.transformer.ts` from the codebase.

```typescript
// reasoning-transformer.ts
import { Transformer, TransformerOptions } from "@musistudio/llms";

export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";
  enable: boolean;

  constructor(private readonly options?: TransformerOptions) {
    this.enable = this.options?.enable ?? true;
  }

  // Transform request to add reasoning parameters
  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    if (!this.enable) {
      request.thinking = {
        type: "disabled",
        budget_tokens: -1,
      };
      request.enable_thinking = false;
      return request;
    }

    if (request.reasoning) {
      request.thinking = {
        type: "enabled",
        budget_tokens: request.reasoning.max_tokens,
      };
      request.enable_thinking = true;
    }
    return request;
  }

  // Transform response to convert reasoning_content to thinking format
  async transformResponseOut(response: Response): Promise<Response> {
    if (!this.enable) return response;

    const contentType = response.headers.get("Content-Type");

    // Handle non-streaming response
    if (contentType?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse.choices[0]?.message.reasoning_content) {
        jsonResponse.thinking = {
          content: jsonResponse.choices[0].message.reasoning_content
        };
      }
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Handle streaming response
    if (contentType?.includes("stream")) {
      // [Streaming transformation code here]
      // See the full implementation in the codebase
    }

    return response;
  }
}
```

## Transformer Registration

### Method 1: Static Name (Class-based)

Use this when creating a transformer in TypeScript/ES6:

```typescript
export class MyTransformer implements Transformer {
  static TransformerName = "my-transformer";

  async transformRequestIn(request: UnifiedChatRequest): Promise<any> {
    // Transformation logic
    return request;
  }
}
```

### Method 2: Instance Name (Instance-based)

Use this for JavaScript transformers:

```javascript
module.exports = class MyTransformer {
  constructor(options) {
    this.name = 'my-transformer';
    this.options = options;
  }

  async transformRequestIn(request, provider, context) {
    // Transformation logic
    return request;
  }
};
```

## Applying Transformers

### Global Application (Provider Level)

Apply to all requests for a provider:

```json
{
  "Providers": [
    {
      "NAME": "deepseek",
      "HOST": "https://api.deepseek.com",
      "APIKEY": "your-api-key",
      "transformers": ["anthropic"]
    }
  ]
}
```

### Model-Specific Application

Apply to specific models only:

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      },
      "models": ["deepseek,deepseek-chat"]
    }
  ]
}
```

Note: The model format is `provider,model` (e.g., `deepseek,deepseek-chat`).

### Global Transformers (All Providers)

Apply transformers to all providers:

```json
{
  "transformers": [
    {
      "name": "custom-logger",
      "path": "/path/to/custom-logger.js"
    }
  ]
}
```

### Passing Options

Some transformers accept configuration options:

```json
{
  "transformers": [
    {
      "name": "maxtoken",
      "options": {
        "max_tokens": 8192
      }
    },
    {
      "name": "customparams",
      "options": {
        "custom_param_1": "value1",
        "custom_param_2": 42
      }
    }
  ]
}
```

## Best Practices

### 1. Immutability

Always create new objects rather than mutating existing ones:

```javascript
// Bad
async transformRequestIn(request) {
  request.max_tokens = 4096;
  return request;
}

// Good
async transformRequestIn(request) {
  return {
    ...request,
    max_tokens: request.max_tokens || 4096
  };
}
```

### 2. Error Handling

Always handle errors gracefully:

```javascript
async transformResponseIn(response) {
  try {
    const data = await response.json();
    // Process data
    return new Response(JSON.stringify(processedData), {
      status: response.status,
      headers: response.headers
    });
  } catch (error) {
    this.logger?.error({ error }, 'Transformation failed');
    // Return original response if transformation fails
    return response;
  }
}
```

### 3. Logging

Use the injected logger for debugging:

```javascript
async transformRequestIn(request, provider, context) {
  this.logger?.debug({
    model: request.model,
    provider: provider.name
  }, 'Transforming request');

  // Your transformation logic

  return modifiedRequest;
}
```

### 4. Stream Handling

When handling streams, always:
- Use a buffer to handle incomplete chunks
- Properly release the reader lock
- Handle errors in the stream
- Close the controller when done

```javascript
const transformedStream = new ReadableStream({
  start: async (controller) => {
    const reader = response.body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Process stream...
      }
    } catch (error) {
      controller.error(error);
    } finally {
      controller.close();
      reader.releaseLock();
    }
  }
});
```

### 5. Context Usage

The `context` parameter contains useful information:

```javascript
async transformRequestIn(request, provider, context) {
  // Access request ID
  const requestId = context.req.id;

  // Access original request
  const originalRequest = context.req.original;

  // Your transformation logic
}
```

## Testing Your Transformer

### Manual Testing

1. Add your transformer to the config
2. Start the server: `ccr restart`
3. Check logs: `tail -f ~/.claude-code-router/logs/ccr-*.log`
4. Make a test request
5. Verify the output

### Debug Tips

- Add logging to track transformation steps
- Test with both streaming and non-streaming requests
- Verify error handling with invalid inputs
- Check that original responses are returned on error

## Next Steps

- [Advanced Topics](/docs/server/advanced/custom-router) - Advanced routing customization
- [Agents](/docs/server/advanced/agents) - Extending with agents
- [Core Package](/docs/server/intro) - Learn about @musistudio/llms
