# 配置 API

## GET /api/config

获取当前服务器配置。

### 请求示例

```bash
curl http://localhost:3456/api/config \
  -H "x-api-key: your-api-key"
```

### 响应示例

```json
{
  "HOST": "0.0.0.0",
  "PORT": 3456,
  "APIKEY": "sk-xxxxx",
  "Providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  },
  "transformers": [
    "anthropic"
  ]
}
```

## POST /api/config

更新服务器配置。更新后会自动备份旧配置。

### 请求示例

```bash
curl -X POST http://localhost:3456/api/config \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{
    "HOST": "0.0.0.0",
    "PORT": 3456,
    "Providers": [
      {
        "name": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "$OPENAI_API_KEY",
        "models": ["gpt-4"]
      }
    ],
    "Router": {
      "default": "openai,gpt-4"
    }
  }'
```

### 配置对象结构

#### 基础配置

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `HOST` | string | 否 | 监听地址（默认 127.0.0.1） |
| `PORT` | integer | 否 | 监听端口（默认 3456） |
| `APIKEY` | string | 否 | API 密钥 |
| `LOG` | boolean | 否 | 是否启用日志（默认 true） |
| `LOG_LEVEL` | string | 否 | 日志级别（debug/info/warn/error） |

#### Providers 配置

```json
{
  "Providers": [
    {
      "name": "provider-name",
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "your-api-key",
      "models": ["model-1", "model-2"]
    }
  ]
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 提供商名称 |
| `baseUrl` | string | 是 | API 基础 URL |
| `apiKey` | string | 是 | API 密钥 |
| `models` | array | 是 | 支持的模型列表 |

#### Router 配置

```json
{
  "Router": {
    "default": "provider,model",
    "longContextThreshold": 100000,
    "routes": {
      "background": "lightweight-model",
      "think": "powerful-model",
      "longContext": "long-context-model",
      "webSearch": "search-model",
      "image": "vision-model"
    }
  }
}
```

#### Transformers 配置

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "provider": "provider-name",
      "models": ["model-1"],
      "options": {}
    }
  ]
}
```

### 响应示例

成功：

```json
{
  "success": true,
  "message": "Config saved successfully"
}
```

### 配置备份

每次更新配置时，旧配置会自动备份到：

```
~/.claude-code-router/config.backup.{timestamp}.json
```

保留最近 3 个备份。

## GET /api/transformers

获取服务器加载的所有转换器列表。

### 请求示例

```bash
curl http://localhost:3456/api/transformers \
  -H "x-api-key: your-api-key"
```

### 响应示例

```json
{
  "transformers": [
    {
      "name": "anthropic",
      "endpoint": null
    },
    {
      "name": "openai",
      "endpoint": null
    },
    {
      "name": "gemini",
      "endpoint": "https://generativelanguage.googleapis.com"
    }
  ]
}
```

### 转换器列表

内置转换器：

- `anthropic` - Anthropic Claude 格式
- `openai` - OpenAI 格式
- `deepseek` - DeepSeek 格式
- `gemini` - Google Gemini 格式
- `openrouter` - OpenRouter 格式
- `groq` - Groq 格式
- `maxtoken` - 调整 max_tokens 参数
- `tooluse` - 工具使用转换
- `reasoning` - 推理模式转换
- `enhancetool` - 增强工具功能

## 环境变量插值

配置支持环境变量插值：

```json
{
  "Providers": [
    {
      "apiKey": "$OPENAI_API_KEY"
    }
  ]
}
```

或使用 `${VAR_NAME}` 格式：

```json
{
  "baseUrl": "${API_BASE_URL}"
}
```
