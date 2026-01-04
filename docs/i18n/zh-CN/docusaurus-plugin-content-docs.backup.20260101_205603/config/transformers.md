---
id: config/transformers
title: 转换器
sidebar_position: 4
---

# 转换器

转换器用于适配不同提供商之间的 API 差异。

## 内置转换器

### anthropic

将请求转换为兼容 Anthropic 风格的 API：

```json
{
  "transformer": {
    "use": ["anthropic"]
  }
}
```

如果只使用这一个转换器，它将直接透传请求和响应（您可以用来接入其他支持 Anthropic 端点的服务商）。

### deepseek

专门用于 DeepSeek API 的转换器：

```json
{
  "transformer": {
    "use": ["deepseek"]
  }
}
```

### gemini

用于 Google Gemini API 的转换器：

```json
{
  "transformer": {
    "use": ["gemini"]
  }
}
```

### groq

用于 Groq API 的转换器：

```json
{
  "transformer": {
    "use": ["groq"]
  }
}
```

### openrouter

用于 OpenRouter API 的转换器：

```json
{
  "transformer": {
    "use": ["openrouter"]
  }
}
```

OpenRouter 转换器还支持 `provider` 路由参数，以指定 OpenRouter 应使用哪些底层提供商：

```json
{
  "transformer": {
    "use": ["openrouter"],
    "moonshotai/kimi-k2": {
      "use": [
        ["openrouter", {
          "provider": {
            "only": ["moonshotai/fp8"]
          }
        }]
      ]
    }
  }
}
```

### maxtoken

设置特定的 `max_tokens` 值：

```json
{
  "transformer": {
    "use": [
      ["maxtoken", { "max_tokens": 65536 }]
    ]
  }
}
```

### tooluse

通过 `tool_choice` 参数优化某些模型的工具使用：

```json
{
  "transformer": {
    "use": ["tooluse"]
  }
}
```

### reasoning

用于处理 `reasoning_content` 字段：

```json
{
  "transformer": {
    "use": ["reasoning"]
  }
}
```

### sampling

用于处理采样信息字段，如 `temperature`、`top_p`、`top_k` 和 `repetition_penalty`：

```json
{
  "transformer": {
    "use": ["sampling"]
  }
}
```

### enhancetool

对 LLM 返回的工具调用参数增加一层容错处理（注意：这会导致不再流式返回工具调用信息）：

```json
{
  "transformer": {
    "use": ["enhancetool"]
  }
}
```

### cleancache

清除请求中的 `cache_control` 字段：

```json
{
  "transformer": {
    "use": ["cleancache"]
  }
}
```

### vertex-gemini

处理使用 Vertex 鉴权的 Gemini API：

```json
{
  "transformer": {
    "use": ["vertex-gemini"]
  }
}
```

## 应用转换器

### 全局应用

应用于提供商的所有请求：

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "your-api-key",
      "transformer": {
        "use": ["deepseek"]
      }
    }
  ]
}
```

### 模型特定应用

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

### 传递选项

某些转换器接受选项：

```json
{
  "transformer": {
    "use": [
      ["maxtoken", { "max_tokens": 8192 }]
    ]
  }
}
```

## 自定义转换器

创建自定义转换器插件：

1. 创建转换器文件：

```javascript
module.exports = {
  name: 'my-transformer',
  transformRequest: async (req, config) => {
    // 修改请求
    return req;
  },
  transformResponse: async (res, config) => {
    // 修改响应
    return res;
  }
};
```

2. 在配置中加载：

```json
{
  "transformers": [
    {
      "path": "/path/to/transformer.js",
      "options": {
        "key": "value"
      }
    }
  ]
}
```

## 实验性转换器

### gemini-cli（实验性）

通过 Gemini CLI 对 Gemini 的非官方支持。

### qwen-cli（实验性）

通过 Qwen CLI 对 qwen3-coder-plus 的非官方支持。

### rovo-cli（实验性）

通过 Atlassian Rovo Dev CLI 对 GPT-5 的非官方支持。

## 下一步

- [高级主题](/zh/docs/advanced/custom-router) - 高级路由自定义
- [Agent](/zh/docs/advanced/agents) - 使用 Agent 扩展功能
