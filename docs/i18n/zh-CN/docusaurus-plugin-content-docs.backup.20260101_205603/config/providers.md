---
id: config/providers
title: 提供商配置
sidebar_position: 2
---

# 提供商配置

配置 LLM 提供商的详细指南。

## 支持的提供商

### DeepSeek

```json
{
  "name": "deepseek",
  "api_base_url": "https://api.deepseek.com/chat/completions",
  "api_key": "your-api-key",
  "models": ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  "transformer": {
    "use": ["deepseek"]
  }
}
```

### Groq

```json
{
  "name": "groq",
  "api_base_url": "https://api.groq.com/openai/v1/chat/completions",
  "api_key": "your-api-key",
  "models": ["llama-3.3-70b-versatile"]
}
```

### Gemini

```json
{
  "name": "gemini",
  "api_base_url": "https://generativelanguage.googleapis.com/v1beta/models/",
  "api_key": "your-api-key",
  "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
  "transformer": {
    "use": ["gemini"]
  }
}
```

### OpenRouter

```json
{
  "name": "openrouter",
  "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
  "api_key": "your-api-key",
  "models": [
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.5-pro-preview"
  ],
  "transformer": {
    "use": ["openrouter"]
  }
}
```

### Ollama（本地模型）

```json
{
  "name": "ollama",
  "api_base_url": "http://localhost:11434/v1/chat/completions",
  "api_key": "ollama",
  "models": ["qwen2.5-coder:latest"]
}
```

### 火山引擎

```json
{
  "name": "volcengine",
  "api_base_url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  "api_key": "your-api-key",
  "models": ["deepseek-v3-250324", "deepseek-r1-250528"],
  "transformer": {
    "use": ["deepseek"]
  }
}
```

### ModelScope

```json
{
  "name": "modelscope",
  "api_base_url": "https://api-inference.modelscope.cn/v1/chat/completions",
  "api_key": "",
  "models": [
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    "Qwen/Qwen3-235B-A22B-Thinking-2507"
  ],
  "transformer": {
    "use": [
      ["maxtoken", { "max_tokens": 65536 }],
      "enhancetool"
    ],
    "Qwen/Qwen3-235B-A22B-Thinking-2507": {
      "use": ["reasoning"]
    }
  }
}
```

### DashScope（阿里云）

```json
{
  "name": "dashscope",
  "api_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  "api_key": "your-api-key",
  "models": ["qwen3-coder-plus"],
  "transformer": {
    "use": [
      ["maxtoken", { "max_tokens": 65536 }],
      "enhancetool"
    ]
  }
}
```

## 提供商配置选项

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 提供商的唯一标识符 |
| `api_base_url` | string | 是 | API 基础 URL |
| `api_key` | string | 是 | API 认证密钥 |
| `models` | string[] | 否 | 可用模型列表 |
| `transformer` | object | 否 | 应用的转换器配置 |

## 模型选择

在路由中选择模型时，使用以下格式：

```
{provider-name},{model-name}
```

例如：

```
deepseek,deepseek-chat
```

## 使用环境变量

您可以在配置中使用环境变量来保护 API 密钥：

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-chat"]
    }
  ]
}
```

支持 `$VAR_NAME` 和 `${VAR_NAME}` 两种语法。

## 转换器配置

转换器用于适配不同提供商的 API 差异。您可以在提供商级别或模型级别配置转换器：

### 提供商级别转换器

应用于提供商的所有模型：

```json
{
  "name": "openrouter",
  "transformer": {
    "use": ["openrouter"]
  }
}
```

### 模型级别转换器

应用于特定模型：

```json
{
  "name": "deepseek",
  "transformer": {
    "use": ["deepseek"],
    "deepseek-chat": {
      "use": ["tooluse"]
    }
  }
}
```

## 下一步

- [路由配置](/zh/docs/config/routing) - 配置请求如何路由
- [转换器](/zh/docs/config/transformers) - 对请求应用转换
