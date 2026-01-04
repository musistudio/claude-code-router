# 消息 API

## POST /v1/messages

发送消息到 LLM，兼容 Anthropic Claude API 格式。

### 请求格式

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

### 请求参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称（会被路由到实际提供商） |
| `messages` | array | 是 | 消息数组 |
| `max_tokens` | integer | 是 | 最大生成 Token 数 |
| `system` | string | 否 | 系统提示词 |
| `tools` | array | 否 | 可用工具列表 |
| `stream` | boolean | 否 | 是否使用流式响应（默认 false） |
| `temperature` | number | 否 | 温度参数（0-1） |

### 消息对象格式

```json
{
  "role": "user|assistant",
  "content": "string | array"
}
```

### 响应格式（非流式）

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

### 流式响应

设置 `stream: true` 启用流式响应：

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [...],
  "stream": true
}
```

流式响应事件类型：

- `message_start` - 消息开始
- `content_block_start` - 内容块开始
- `content_block_delta` - 内容增量
- `content_block_stop` - 内容块结束
- `message_delta` - 消息元数据（usage）
- `message_stop` - 消息结束

### 工具使用

支持函数调用（Tool Use）：

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

### 多模态支持

支持图片输入：

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

计算消息的 Token 数量。

### 请求格式

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

### 请求参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型名称 |
| `messages` | array | 是 | 消息数组 |
| `tools` | array | 否 | 工具列表 |
| `system` | string | 否 | 系统提示词 |

### 响应格式

```json
{
  "input_tokens": 42
}
```

## 错误响应

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
