# Server 简介

Claude Code Router Server 是一个核心服务组件，负责将 Claude Code 的 API 请求路由到不同的 LLM 提供商。它提供了完整的 HTTP API，支持：

- **API 请求路由**：将 Anthropic 格式的请求转换为各种提供商的 API 格式
- **认证与授权**：支持 API Key 认证
- **配置管理**：动态配置提供商、路由规则和转换器
- **Web UI**：内置管理界面
- **日志系统**：完整的请求日志记录

## 架构概述

```
┌─────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│ Claude Code │────▶│ CCR Server                  │────▶│ LLM Provider │
│   Client    │     │  ┌─────────────────────┐    │     │  (OpenAI/    │
└─────────────┘     │  │ @musistudio/llms    │    │     │   Gemini/etc)│
                    │  │ (核心包)             │    │     └──────────────┘
                    │  │ - 请求转换           │    │
                    │  │ - 响应转换           │    │
                    │  │ - 认证处理           │    │
                    │  └─────────────────────┘    │
                    │                             │
                    │  - 路由逻辑                 │
                    │  - Agent 系统               │
                    │  - 配置管理                 │
                    └─────────────────────────────┘
                           │
                           ├─ Web UI
                           ├─ Config API
                           └─ Logs API
```

## 核心包：@musistudio/llms

服务器构建于 **@musistudio/llms** 之上，这是一个通用的 LLM API 转换库，提供了核心的请求/响应转换能力。

### 什么是 @musistudio/llms？

`@musistudio/llms` 是一个独立的 npm 包（`@musistudio/llms`），负责处理：

- **API 格式转换**：在不同的 LLM 提供商 API 之间转换（Anthropic、OpenAI、Gemini 等）
- **请求/响应转换**：将请求和响应转换为统一格式
- **认证处理**：管理不同提供商的认证方法
- **流式响应支持**：处理来自不同提供商的流式响应
- **转换器系统**：提供可扩展的架构来添加新的提供商

### 核心概念

#### 1. 统一请求/响应格式

核心包定义了统一格式（`UnifiedChatRequest`、`UnifiedChatResponse`），抽象了提供商特定的差异：

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

#### 2. 转换器接口

所有转换器都实现一个通用接口：

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

#### 3. 内置转换器

核心包包含以下转换器：
- **anthropic**：Anthropic API 格式
- **openai**：OpenAI API 格式
- **gemini**：Google Gemini API 格式
- **deepseek**：DeepSeek API 格式
- **groq**：Groq API 格式
- **openrouter**：OpenRouter API 格式
- 等等...

### 与 CCR Server 的集成

CCR server 通过以下方式集成 `@musistudio/llms`：

1. **转换器服务**（`packages/core/src/services/transformer.ts`）：管理转换器的注册和实例化
2. **提供商配置**：将提供商配置映射到核心包的 LLMProvider 接口
3. **请求管道**：在请求处理过程中按顺序应用转换器
4. **自定义转换器**：支持加载外部转换器插件

### 版本和更新

`@musistudio/llms` 的当前版本是 `1.0.51`。它作为独立的 npm 包发布，可以独立使用或作为 CCR Server 的一部分使用。

## 核心功能

### 1. 请求路由
- 基于 Token 数量的智能路由
- 项目级路由配置
- 自定义路由函数
- 场景化路由（background、think、longContext 等）

### 2. 请求转换
- 支持多种 LLM 提供商的 API 格式转换
- 内置转换器：Anthropic、DeepSeek、Gemini、OpenRouter、Groq 等
- 可扩展的转换器系统

### 3. Agent 系统
- 插件式的 Agent 架构
- 内置图片处理 Agent
- 自定义 Agent 支持

### 4. 配置管理
- JSON5 格式配置文件
- 环境变量插值
- 配置热更新（需重启服务）

## 使用场景

### 场景一：个人本地服务
在本地运行服务，供个人 Claude Code 使用：

```bash
ccr start
```

### 场景二：团队共享服务
使用 Docker 部署，为团队成员提供共享服务：

```bash
docker run -d -p 3456:3456 musistudio/claude-code-router
```

### 场景三：二次开发
基于暴露的 API 构建自定义应用：

```bash
GET /api/config
POST /v1/messages
GET /api/logs
```

## 下一步

- [Docker 部署指南](/docs/server/deployment) - 学习如何部署服务
- [API 参考](/docs/category/api) - 查看完整的 API 文档
- [配置说明](/docs/category/server-config) - 了解服务器配置选项
