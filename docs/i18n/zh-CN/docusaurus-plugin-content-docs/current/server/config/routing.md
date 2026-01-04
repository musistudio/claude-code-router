---
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

## 故障转移（Fallback）

当请求失败时，可以配置备用模型列表。系统会按顺序尝试每个模型，直到请求成功：

### 基本配置

```json
{
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "gemini,gemini-2.5-flash"
  },
  "fallback": {
    "default": [
      "aihubmix,Z/glm-4.5",
      "openrouter,anthropic/claude-sonnet-4"
    ],
    "background": [
      "ollama,qwen2.5-coder:latest"
    ],
    "think": [
      "openrouter,anthropic/claude-3.7-sonnet:thinking"
    ],
    "longContext": [
      "modelscope,Qwen/Qwen3-Coder-480B-A35B-Instruct"
    ],
    "webSearch": [
      "openrouter,anthropic/claude-sonnet-4"
    ]
  }
}
```

### 工作原理

1. **触发条件**：当某个路由场景的模型请求失败时（HTTP 错误响应）
2. **自动切换**：系统自动检查该场景的 fallback 配置
3. **顺序尝试**：按照列表顺序依次尝试每个备用模型
4. **成功返回**：一旦某个模型成功响应，立即返回结果
5. **全部失败**：如果所有备用模型都失败，返回原始错误

### 配置说明

- **格式**：每个备用模型格式为 `provider,model`
- **验证**：备用模型必须在 `Providers` 配置中存在
- **灵活性**：可以为不同场景配置不同的备用列表
- **可选性**：如果某个场景不需要备用，可以不配置或使用空数组

### 使用场景

#### 场景一：主模型配额不足

```json
{
  "Router": {
    "default": "openrouter,anthropic/claude-sonnet-4"
  },
  "fallback": {
    "default": [
      "deepseek,deepseek-chat",
      "aihubmix,Z/glm-4.5"
    ]
  }
}
```

当主模型配额用完时，自动切换到备用模型。

#### 场景二：服务稳定性保障

```json
{
  "Router": {
    "background": "volcengine,deepseek-v3-250324"
  },
  "fallback": {
    "background": [
      "modelscope,Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "dashscope,qwen3-coder-plus"
    ]
  }
}
```

当主服务商出现故障时，自动切换到其他服务商。

### 日志监控

系统会记录详细的 fallback 过程：

```
[warn] Request failed for default, trying 2 fallback models
[info] Trying fallback model: aihubmix,Z/glm-4.5
[warn] Fallback model aihubmix,Z/glm-4.5 failed: API rate limit exceeded
[info] Trying fallback model: openrouter,anthropic/claude-sonnet-4
[info] Fallback model openrouter,anthropic/claude-sonnet-4 succeeded
```

### 注意事项

1. **成本考虑**：备用模型可能产生不同的费用，请合理配置
2. **性能差异**：不同模型的响应速度和质量可能有差异
3. **配额管理**：确保备用模型有足够的配额
4. **测试验证**：定期测试备用模型的可用性

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
