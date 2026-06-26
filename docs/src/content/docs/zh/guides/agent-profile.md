---
title: 接入 Agent配置
pageTitle: 接入 Agent配置
eyebrow: 快速开始
lead: 让 Claude Code、Codex、ZCode 等 Agent 使用 CCR 的供应商、路由和模型选择配置。
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

## ZCode

ZCode 主要关注模型、供应商 ID、供应商名称，以及是否从 CCR 启动。它走 App surface，不需要 Codex CLI 的路径字段。

## 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。
