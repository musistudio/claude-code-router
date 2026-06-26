---
title: Claude Code Router 快速开始
pageTitle: 快速开始
eyebrow: 快速开始
lead: 从安装开始，逐步接入供应商、让 Agent 通过 CCR 发请求，并通过日志与观测确认链路生效。
---

## 安装并启动 CCR

### 下载安装

1. 打开 [GitHub Releases](https://github.com/musistudio/claude-code-router/releases) 页面。
2. 按你的系统下载安装包：macOS 使用 `.dmg` 或 `.zip`，Windows 使用 `.exe`，Linux 使用 `.AppImage`。
3. 像普通桌面软件一样安装并打开 **Claude Code Router**。

### 启动服务

进入 **服务** 页面，点击 **启动**。页面显示运行中后，CCR 会在本机监听默认地址 `http://localhost:8080`。

如果希望打开 App 后自动启动服务，可以在服务页面开启自动启动。

## 接入供应商

供应商是 CCR 转发请求的上游模型服务，比如 OpenRouter、DeepSeek、Z.AI，或者任何兼容 OpenAI / Anthropic / Gemini 协议的服务。

### 添加供应商

1. 进入 **供应商** 页面，点击 **添加供应商**。
2. 在 **预设供应商** 中选择内置预设。预设会自动填入常见的基础 URL、协议和图标。
3. 如果服务不在预设里，选择 **其他 / 自定义 API 端点**。
4. 填写 **名称**、**基础 URL**、**协议**、**API Key** 和 **模型**。

### 协议怎么选

| 协议 | 适用场景 |
| --- | --- |
| OpenAI Chat Completions | 绝大多数 OpenAI 兼容服务 |
| OpenAI Responses | 支持 Responses API 的服务 |
| Anthropic Messages | Anthropic 官方或兼容 Anthropic 协议的服务 |
| Gemini Generate Content | Gemini 官方或兼容 Gemini 协议的服务 |

拿不准时，先使用 App 里的协议探测，再用模型连通性检查确认。

### 保存前做这三项检查

1. **协议探测**：确认基础 URL 支持哪些协议。
2. **模型连通性检查**：选一两个模型实际发测试请求。
3. **账户用量测试**：如果要展示余额或配额，确认用量接口能读到数据。

这些检查通过后再保存供应商。

### 多 Key 与用量面板

如果是团队或高频调用，可以在供应商表单里添加多条凭据，并设置优先级、权重和限额。保存后到请求日志里按凭据筛选，确认轮换符合预期。

如果希望概览显示余额或剩余配额，打开供应商的 **账户 / 用量**，配置用量接入方式并测试字段映射。

## 接入 Agent配置

Agent配置让 Claude Code、Codex、ZCode 等 Agent 使用 CCR 的供应商、路由和模型选择配置。

通用建议：

- 试用阶段优先选择“仅从 CCR 打开时生效”，只影响从 CCR 打开的 Agent。
- 稳定后再考虑系统默认配置。
- 应用后尽量使用 CCR 里的“打开 Agent”启动 Agent。

### Claude Code

在 **Agent配置** 中选择 Claude Code，设置模型、小型快速模型和设置文件，然后点击应用。从 CCR 打开 Claude Code 后，发一次请求到请求日志里验证。

### Codex

在 **Agent配置** 中选择 Codex，确认供应商 ID、供应商名称、模型和配置文件。需要特定 CLI 时再填写 Codex CLI path 和 Codex home。

### ZCode

ZCode 主要关注模型、供应商 ID、供应商名称，以及是否从 CCR 启动。它走 App surface，不需要 Codex CLI 的路径字段。

### 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。

## 日志&观测

### 先把开关打开

到 **设置 → 日志与观测**：

1. 打开 **请求日志**。
2. 打开 **Agent 观测**。

### 查看观测面板

观测面板用于查看 Agent 的执行链路和性能表现：每个步骤何时发生、调用了哪个工具、工具获得了什么结果、耗时多久、是否出错，以及后续步骤如何继续。

它可以帮助定位 Agent 卡住、工具结果异常、某一步耗时过长，或上下文流转不符合预期等问题。请求日志提供单条模型请求的请求体、响应体和错误信息。

### 请求日志

请求日志记录经过 CCR 的模型请求明细，包括请求时间、请求 ID、客户端、路径、请求模型、最终命中的供应商和模型、凭据、状态码、耗时、token、成本估算、请求体、响应体和错误信息。

日志页支持按状态、供应商、模型、凭据、请求 ID、模型名、请求体或响应体筛选。单条记录会展示请求与响应的主要字段，包含 `request model`、`resolved provider`、`resolved model`、状态码、响应体、错误信息、耗时、token 和成本估算。

普通请求日志只保留本地当天的数据。以本地日期为界，进入第二天后，下一次读取或写入请求日志时会清理前一天的普通请求日志。
