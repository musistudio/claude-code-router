---
title: Messages API
---

# Messages API

## POST /v1/messages

Send messages to LLM, compatible with Anthropic Claude API format.

### Request Format

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello, Claude!"
      }
    ]
  }'
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model name (will be routed to actual provider) |
| `messages` | array | Yes | Array of messages |
| `max_tokens` | integer | Yes | Maximum tokens to generate |
| `system` | string | No | System prompt |
| `tools` | array | No | List of available tools |
| `stream` | boolean | No | Whether to use streaming response (default false) |
| `temperature` | number | No | Temperature parameter (0-1) |

### Message Object Format

```json
{
  "role": "user|assistant",
  "content": "string | array"
}
```

### Response Format (Non-streaming)

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}
```

### Streaming Response

Set `stream: true` to enable streaming response:

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [...],
  "stream": true
}
```

Streaming response event types:

- `message_start` - Message start
- `content_block_start` - Content block start
- `content_block_delta` - Content increment
- `content_block_stop` - Content block end
- `message_delta` - Message metadata (usage)
- `message_stop` - Message end

### Tool Use

Supports function calling (Tool Use):

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "What's the weather like?"
    }
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the current weather",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name"
          }
        },
        "required": ["location"]
      }
    }
  ]
}
```

### Multimodal Support

Supports image input:

```json
{
  "role": "user",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/png",
        "data": "iVBORw0KGgo..."
      }
    },
    {
      "type": "text",
      "text": "Describe this image"
    }
  ]
}
```

## POST /v1/messages/count_tokens

Count tokens in messages.

### Request Format

```bash
curl -X POST http://localhost:3456/v1/messages/count_tokens \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ],
    "tools": [],
    "system": "You are a helpful assistant."
  }'
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model name |
| `messages` | array | Yes | Array of messages |
| `tools` | array | No | List of tools |
| `system` | string | No | System prompt |

### Response Format

```json
{
  "input_tokens": 42
}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "messages is required"
  }
}
```

### 401 Unauthorized

```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

### 500 Internal Server Error

```json
{
  "error": {
    "type": "api_error",
    "message": "Failed to connect to provider"
  }
}
```
