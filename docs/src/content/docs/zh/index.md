---
title: Claude Code Router 文档
pageTitle: Claude Code Router 文档
eyebrow: 产品文档
lead: 介绍 CCR 的核心能力、文档的组织方式和推荐的阅读顺序。第一次接触 CCR 时从这一页开始。
---

## CCR 能帮你做什么

CCR 是运行在本地（或你自己的服务器上）的模型网关：它接收 Claude Code、Codex 等 Agent 发出的请求，按你的路由配置转发给任意供应商，并记录完整日志。核心能力：

- **接入任意供应商**：OpenRouter、DeepSeek、Z.AI，或任何兼容 OpenAI / Anthropic / Gemini 协议的服务，支持多 Key 轮换和用量展示。
- **智能路由**：用条件规则选择模型，支持请求改写、失败重试和回退；Claude Code 的 Subagent / Workflow 可以自动选用不同模型。
- **Fusion 组合模型**：把文本模型与视觉、联网搜索、生图、生视频或自定义 MCP 工具组合成新模型。
- **ToolHub**：把多个 MCP server 收束成一个动态工具检索入口。
- **AgentClaw**：把本机 Agent 变成可从 Slack、Discord、微信等 IM 平台使用的 Bot。
- **日志与可观测性**：请求日志记录每条请求的供应商、模型、耗时、token 和成本；观测面板展示 Agent 的执行链路。

## 文档结构

顶部一级目录包含快速开始、详细配置、各特色功能（Fusion、ToolHub、智能路由、一键导入、扩展、AgentClaw）和 Q&A，点击站点 logo 返回首页：

| 分类 | 内容 |
| --- | --- |
| [文档](./) | CCR 能力、文档结构和阅读路径 |
| [快速开始](guides/) | 桌面版、CLI、Docker 的安装部署，以及供应商和 Agent 配置的接入流程 |
| [详细配置](configuration/overview/) | 概览仪表盘、供应商、Agent 配置、API 密钥、日志与可观测性、服务、托盘和配置数据库位置 |
| [Fusion](fusion/) | 把基础模型与视觉、联网搜索、MCP 工具、生图或生视频组合成新的可选模型 |
| [ToolHub](toolhub/) | 将多个 MCP server 收束成一个动态工具检索入口 |
| [智能路由](routing/) | 通过内置路由、条件规则、请求改写、失败重试和回退控制每次请求 |
| [一键导入](provider-import/) | 通过供应商深度链接（deeplink）、Manifest 或网页按钮快速导入供应商 |
| [扩展](extensions/) | 创建 wrapper plugin 和 core gateway plugin，扩展本地路由、供应商和网关能力 |
| [AgentClaw](agentclaw/) | 为本机 Agent 提供 IM 接入，接口风格与 [OpenClaw](https://openclaw.ai) 一致（OpenClaw 是一个在本机运行、通过 IM 平台交互的开源个人 AI 助手项目），可配置 IM Bot、接力模式、Project/Session 命令和平台凭据 |
| [Q&A](troubleshooting/) | 按症状分组的常见问题：接入与观测、连接与认证错误、路由与成本、Fusion 与工具调用、Bot 与消息 |

AgentClaw 的平台接入教程是独立的子页面，每个平台一页，各自覆盖平台后台字段、权限、事件订阅、长连接 / Socket / 二维码登录和 FAQ。

## 阅读路径

第一次使用 CCR 时，建议按下面的顺序阅读：

1. [安装并启动 CCR](guides/install/)：在桌面版、npm CLI 和 Docker 之间选择；命令细节见 [CLI 参考](guides/cli/)，容器部署见 [Docker 部署](guides/docker/)。
2. [接入供应商](guides/provider/)：添加至少一个供应商，用协议探测和连通性检查确认可用。
3. [接入 Agent 配置](guides/agent-profile/)：让 Claude Code 等 Agent 通过 CCR 发请求。
4. [开启日志与观测](guides/observability/)：在请求日志里确认请求确实经过了 CCR。
5. 之后按需深入：[详细配置](configuration/overview/) 覆盖每个设置页面；[智能路由](routing/)、[Fusion](fusion/)、[AgentClaw](agentclaw/) 覆盖特色能力；[Q&A](troubleshooting/) 收录 401、404、超时、路由不符预期等常见问题。
