---
id: config/basic
title: 基础配置
sidebar_position: 1
---

# 基础配置

学习如何配置 Claude Code Router 以满足您的需求。

## 配置文件位置

配置文件位于：

```
~/.claude-code-router/config.json
```

## 配置结构

### Providers（提供商）

配置 LLM 提供商以将请求路由到：

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "your-api-key",
      "models": ["deepseek-chat", "deepseek-coder"]
    },
    {
      "name": "groq",
      "api_base_url": "https://api.groq.com/openai/v1/chat/completions",
      "api_key": "your-groq-api-key",
      "models": ["llama-3.3-70b-versatile"]
    }
  ]
}
```

### Router（路由器）

配置默认使用的模型：

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

格式：`{provider-name},{model-name}`

### Transformers（转换器）

对请求/响应应用转换：

```json
{
  "transformers": [
    {
      "path": "/path/to/custom-transformer.js",
      "options": {
        "key": "value"
      }
    }
  ]
}
```

### 环境变量

在配置中使用环境变量：

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY"
    }
  ]
}
```

同时支持 `$VAR_NAME` 和 `${VAR_NAME}` 语法。

## 完整示例

```json
{
  "PORT": 8080,
  "APIKEY": "your-secret-key",
  "PROXY_URL": "http://127.0.0.1:7890",
  "LOG": true,
  "LOG_LEVEL": "debug",
  "API_TIMEOUT_MS": 600000,
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "$DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-coder"],
      "transformer": {
        "use": ["deepseek"]
      }
    },
    {
      "name": "groq",
      "api_base_url": "https://api.groq.com/openai/v1/chat/completions",
      "api_key": "$GROQ_API_KEY",
      "models": ["llama-3.3-70b-versatile"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "longContextThreshold": 100000,
    "background": "groq,llama-3.3-70b-versatile"
  }
}
```

## 编辑配置

使用 CLI 编辑配置：

```bash
ccr config edit
```

这将在您的默认编辑器中打开配置文件。

## 重新加载配置

编辑配置后，重启路由器：

```bash
ccr restart
```

## 配置选项说明

- **PORT**: 服务器端口号（默认：3456）
- **APIKEY**: API 密钥，用于身份验证
- **HOST**: 服务器监听地址（默认：127.0.0.1，如果配置了 Providers 且没有设置 APIKEY，则强制为 127.0.0.1）
- **PROXY_URL**: 代理服务器地址
- **LOG**: 是否启用日志（默认：true）
- **LOG_LEVEL**: 日志级别（fatal/error/warn/info/debug/trace）
- **API_TIMEOUT_MS**: API 请求超时时间（毫秒）
- **NON_INTERACTIVE_MODE**: 非交互模式（用于 CI/CD 环境）

## 下一步

- [提供商配置](/zh/docs/config/providers) - 详细的提供商配置
- [路由配置](/zh/docs/config/routing) - 配置路由规则
- [转换器](/zh/docs/config/transformers) - 应用转换
