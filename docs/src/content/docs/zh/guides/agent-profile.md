---
title: 接入 Agent配置
pageTitle: 接入 Agent配置
eyebrow: 快速开始
lead: 让 Claude Code、Codex、Grok CLI、ZCode 等 Agent 使用 CCR 的供应商、路由和模型选择配置。
---

## 通用建议

- 试用阶段优先选择“仅从 CCR 打开时生效”，只影响从 CCR 打开的 Agent。
- 稳定后再考虑系统默认配置。
- 应用后尽量使用 CCR 里的“打开 Agent”启动 Agent。

## Claude Code

在 **Agent配置** 中选择 Claude Code，设置模型、小型快速模型和设置文件，然后点击应用。

从 CCR 打开 Claude Code 后，发一次请求到请求日志里验证。

## Codex

在 **Agent配置** 中选择 Codex，确认供应商 ID、供应商名称、模型和配置文件。

需要特定 CLI 时再填写 Codex CLI path 和 Codex home。

## Grok CLI

选择 Grok CLI、设置模型，然后运行复制出的 `ccr-app <配置名称>` 命令。CCR Desktop 网关尚未运行时，该命令会启动一个可共享的临时网关服务，并保持运行到最后一个并发 Grok 会话退出。进入 Grok 后可以使用 `/model` 切换 CCR 暴露的模型。

## ZCode

ZCode 主要关注模型、供应商 ID、供应商名称，以及是否从 CCR 启动。它走 App surface，不需要 Codex CLI 的路径字段。

## 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex、Grok CLI 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。
