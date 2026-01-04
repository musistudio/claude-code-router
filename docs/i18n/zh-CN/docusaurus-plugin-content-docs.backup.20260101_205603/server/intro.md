# Server 简介

Claude Code Router Server 是一个核心服务组件，负责将 Claude Code 的 API 请求路由到不同的 LLM 提供商。它提供了完整的 HTTP API，支持：

- **API 请求路由**：将 Anthropic 格式的请求转换为各种提供商的 API 格式
- **认证与授权**：支持 API Key 认证
- **配置管理**：动态配置提供商、路由规则和转换器
- **Web UI**：内置管理界面
- **日志系统**：完整的请求日志记录

## 架构概述

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Claude Code │────▶│ CCR Server       │────▶│ LLM Provider │
│   Client    │     │  (Router +       │     │  (OpenAI/    │
└─────────────┘     │   Transformer)   │     │   Gemini/etc)│
                    └──────────────────┘     └──────────────┘
                           │
                           ├─ Web UI
                           ├─ Config API
                           └─ Logs API
```

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
