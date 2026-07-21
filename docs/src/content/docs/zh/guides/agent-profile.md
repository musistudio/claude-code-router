---
title: 接入 Agent 配置
pageTitle: 接入 Agent 配置
eyebrow: 快速开始
lead: 供应商配置完成后，用本页把 Claude Code、Codex、Grok CLI、Kimi CLI、ZCode 等 Agent 接入 CCR 的供应商、路由和模型选择。
---

## 通用建议

- 试用阶段优先选择“仅从 CCR 打开时生效”，只影响从 CCR 打开的 Agent。
- 稳定后再考虑系统默认配置。
- 应用后尽量使用 CCR 里的“打开 Agent”启动 Agent。

## Claude Code

在 **Agent 配置** 中选择 Claude Code，设置模型、小型快速模型和设置文件，然后点击应用。

从 CCR 打开 Claude Code 后，发一次请求到请求日志里验证。

## Codex

在 **Agent 配置** 中选择 Codex，确认供应商 ID、供应商名称、模型和配置文件。

需要特定 CLI 时再填写 Codex CLI path 和 Codex home。

## Grok CLI

选择 Grok CLI、设置模型，然后运行复制出的 `ccr-app <配置名称>` 命令。CCR Desktop 网关尚未运行时，该命令会启动一个可共享的临时网关服务，并保持运行到最后一个并发 Grok 会话退出。进入 Grok 后可以使用 `/model` 切换 CCR 暴露的模型。

## Kimi CLI

选择 Kimi CLI、设置默认模型和一个或多个可用 CCR 模型，然后运行复制出的 `ccr-app <配置名称>` 命令。CCR 会通过配置专属 `KIMI_CODE_HOME` 启动 Kimi，并在其中生成 `config.toml`，把所有选中模型注册到本地 CCR 网关。进入 Kimi 后可使用 `/model` 在这些模型之间切换。用户原有的 `~/.kimi-code/config.toml` 不会被改写；可用时，会继续复用来源 Kimi home 中的会话、技能、插件、MCP 配置和凭据。CCR Desktop 未运行时，该包装器同样可以启动受管的临时网关。

## ZCode

ZCode 主要关注模型、供应商 ID、供应商名称，以及是否从 CCR 启动。它以 App 形态运行，不需要 Codex CLI 的路径字段。

## 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex、Grok CLI、Kimi CLI 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。Kimi CLI 支持从 `~/.kimi-code/config.toml` 导入受管 OAuth 登录态和 API Key 供应商。
