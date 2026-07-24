---
title: Claude Code Router 文档
pageTitle: 文档
eyebrow: 产品文档
lead: 用 CCR 把 Claude Code、Codex、Grok CLI、Kimi CLI、Pi、ZCode 和兼容 API 客户端接到你选择的模型供应商。第一次使用时，先完成一条成功路由请求，再深入路由、Fusion、Bot 和观测。
---

## 先完成第一条路由请求

第一次打开 CCR 时，优先完成这条最短路径：

1. 从[安装并启动 CCR](guides/install/)选择桌面版、npm CLI 或 Docker。
2. 打开 **供应商**，添加预设供应商或自定义端点，填写 API Key，并至少选择一个模型。
3. 打开 **Agent 配置档案**，为 Claude Code、Codex、Grok CLI、Kimi CLI、Pi 或 ZCode 选择默认模型和入口模式。
4. 启动本地网关服务，默认端点是 `http://127.0.0.1:3456`。
5. 从你的 Agent 发送一次请求，然后在 **日志** 中确认最终供应商、模型、状态、Token 和错误。

| 入口 | 适合场景 | 下一步 |
| --- | --- | --- |
| [桌面版安装](guides/install/) | 想使用完整托盘、登录态导入、应用启动和本机配置能力 | 下载后按 onboarding 完成供应商和 Agent 配置档案 |
| [npm CLI](guides/cli/) | 不需要 Electron，只想启动网关和浏览器管理界面 | 运行 `ccr ui` 后打开 `http://127.0.0.1:3458` |
| [Docker](guides/docker/) | 需要容器化部署或远程主机运行 | 先确认鉴权和暴露端口策略，再配置供应商 |

## 常见下一步

- 请求没有进入 CCR：查看 [Q&A](troubleshooting/) 和 [日志&观测](guides/observability/)。
- 想按模型、Header 或 Body 条件分流：阅读 [路由配置](configuration/routing/)。
- 想给模型补图像、联网搜索或 MCP 工具：进入 [Fusion](configuration/fusion/)。
- 想把 Agent 接到 IM 或 Bot：从 [Bot 配置](configuration/bot-setup/) 开始。

## 文档结构

顶部栏现在对应四个独立页面：

| 分类 | 内容 |
| --- | --- |
| [文档](./) | 产品定位、架构概览、阅读路径 |
| [快速开始](guides/) | 桌面版、CLI、Docker 安装部署，以及供应商和 Agent 配置档案接入流程 |
| [详细配置](configuration/overview/) | 概览仪表盘、API 密钥、服务、供应商、路由、Agent 配置档案、Fusion、Bot、托盘和配置数据库位置 |
| [Q&A](troubleshooting/) | 请求日志、观测面板和常见问题 |

Bot 平台教程是「详细配置」分类下的子页面，每个平台有独立页面，方便逐步补齐平台后台字段、回调 URL、签名和 FAQ。
