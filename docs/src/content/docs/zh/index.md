---
title: Claude Code Router 文档
pageTitle: 文档
eyebrow: 产品文档
lead: 了解 CCR 的定位、能力边界和文档结构。需要动手配置时，从顶部的「快速开始」开始；需要查字段、Bot 或 Fusion 时，进入「详细配置」。
---

## CCR 能帮你做什么

**Claude Code Router（CCR）是本地运行的模型网关。** 它位于 Claude Code、Codex、ZCode 等 Agent 和上游模型服务之间，统一管理模型、API Key、路由规则、日志观测和 Bot 接力。

CCR 适合解决这些问题：

- 你不想在每个 Agent 里重复维护模型和 Key。
- 你希望不同任务自动走不同模型：轻量后台任务用快模型，复杂任务用强模型，看图或联网任务走 Fusion。
- 你需要在请求日志里看到请求实际去了哪个供应商、哪个模型、是否成功、延迟和成本大概是多少。
- 你想把长时间运行的 Agent 消息转发到 Slack、Telegram、飞书、企业微信等 IM 平台。

CCR 默认监听本机地址 `http://localhost:8080`。Agent 只要指向这个地址，请求就可以被 CCR 接管并按路由规则转发到上游供应商。

## 文档结构

顶部栏现在对应四个独立页面：

| 分类 | 内容 |
| --- | --- |
| [文档](./) | 产品定位、架构概览、阅读路径 |
| [快速开始](guides/) | 从安装、接供应商，到接入 Agent 的上手流程 |
| [详细配置](configuration/provider/) | 概览仪表盘、API 密钥、服务、供应商、路由、Agent配置、Fusion、Bot、托盘和配置数据库位置 |
| [Q&A](troubleshooting/) | 请求日志、观测面板和常见问题 |

Bot 平台教程是「详细配置」分类下的子页面，每个平台有独立页面，方便逐步补齐平台后台字段、回调 URL、签名和 FAQ。

## 阅读路径

第一次使用时可以从这些页面了解 CCR 的主要流程：

1. [快速开始](guides/) 覆盖供应商接入和 Agent配置。
2. App 的请求日志页面展示请求是否经过 CCR。
3. [详细配置](configuration/provider/) 覆盖概览仪表盘、API 密钥、服务、供应商、图像、联网搜索、MCP 工具、托盘和 IM 接力。
4. [Q&A](troubleshooting/) 覆盖 401、404、超时、路由不对或 Bot 收不到消息等常见问题。

这样文档不会挤在一个长页面里，后续也能按顶部分类逐步扩展。
