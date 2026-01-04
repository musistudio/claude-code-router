---
id: config/routing
title: 路由配置
sidebar_position: 3
---

# 路由配置

配置如何将请求路由到不同的模型。

## 默认路由

为所有请求设置默认模型：

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

## 内置场景

### 后台任务

将后台任务路由到轻量级模型：

```json
{
  "Router": {
    "background": "groq,llama-3.3-70b-versatile"
  }
}
```

### 思考模式（计划模式）

将思考密集型任务路由到更强大的模型：

```json
{
  "Router": {
    "think": "deepseek,deepseek-reasoner"
  }
}
```

### 长上下文

路由长上下文请求：

```json
{
  "Router": {
    "longContextThreshold": 100000,
    "longContext": "gemini,gemini-2.5-pro"
  }
}
```

### 网络搜索

路由网络搜索任务：

```json
{
  "Router": {
    "webSearch": "gemini,gemini-2.5-flash"
  }
}
```

### 图像任务

路由图像相关任务：

```json
{
  "Router": {
    "image": "gemini,gemini-2.5-pro"
  }
}
```

## 项目级路由

在 `~/.claude/projects/<project-id>/claude-code-router.json` 中为每个项目配置路由：

```json
{
  "Router": {
    "default": "groq,llama-3.3-70b-versatile"
  }
}
```

项目级配置优先于全局配置。

## 自定义路由器

创建自定义 JavaScript 路由器函数：

1. 创建路由器文件（例如 `custom-router.js`）：

```javascript
module.exports = async function(req, config) {
  // 分析请求上下文
  const userMessage = req.body.messages.find(m => m.role === 'user')?.content;

  // 自定义路由逻辑
  if (userMessage && userMessage.includes('解释代码')) {
    return 'openrouter,anthropic/claude-3.5-sonnet';
  }

  // 返回 null 以使用默认路由
  return null;
};
```

2. 在 `config.json` 中设置 `CUSTOM_ROUTER_PATH`：

```json
{
  "CUSTOM_ROUTER_PATH": "/path/to/custom-router.js"
}
```

## Token 计数

路由器使用 `tiktoken` (cl100k_base) 来估算请求 token 数量。这用于：

- 确定请求是否超过 `longContextThreshold`
- 基于 token 数量的自定义路由逻辑

## 子代理路由

使用特殊标签为子代理指定模型：

```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
请帮我分析这段代码...
```

## 动态模型切换

在 Claude Code 中使用 `/model` 命令动态切换模型：

```
/model provider_name,model_name
```

示例：`/model openrouter,anthropic/claude-3.5-sonnet`

## 路由优先级

1. 项目级配置
2. 自定义路由器
3. 内置场景路由
4. 默认路由

## 下一步

- [转换器](/zh/docs/config/transformers) - 对请求应用转换
- [自定义路由器](/zh/docs/advanced/custom-router) - 高级自定义路由
