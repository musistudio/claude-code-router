---
title: 接入 Agent配置
pageTitle: 接入 Agent配置
eyebrow: 快速开始
lead: 让 Claude Code、Codex、Grok CLI、Kimi CLI、ZCode 等 Agent 使用 CCR 的供应商、路由和模型选择配置。
---

## 通用建议

- 试用阶段优先选择“仅从 CCR 打开时生效”，让路由和模型覆盖只影响从 CCR 打开的 Agent。Claude Code 默认保持 **CCR 隔离配置**，除非你明确希望共享现有配置目录。
- 稳定后再考虑系统默认配置。
- 应用后尽量使用 CCR 里的“打开 Agent”启动 Agent。

## Claude Code

在 **Agent配置** 中选择 Claude Code，设置模型和小型快速模型，然后选择配置模式。使用 **CCR 隔离配置** 可以保持完全独立。对于 **仅从 CCR 打开时生效** 且为 `CLI only` 的配置，可以选择 **复用现有 Claude 配置**，使用现有插件、Hooks、状态栏、Skills、Agents 和会话。原生默认文件 `~/.claude/settings.json` 会保留原生配置解析；自定义文件也必须命名为 `settings.json`，CCR 会把父目录设为 `CLAUDE_CONFIG_DIR`。路由、鉴权、模型和环境变量覆盖只影响此次启动。

从 CCR 打开 Claude Code 后，发一次请求到请求日志里验证。

## Codex

在 **Agent配置** 中选择 Codex，确认供应商 ID、供应商名称、模型和配置文件。

需要特定 CLI 时再填写 Codex CLI path 和 Codex home。

## Grok CLI

选择 Grok CLI、设置模型，然后运行复制出的 `ccr-app <配置名称>` 命令。CCR Desktop 网关尚未运行时，该命令会启动一个可共享的临时网关服务，并保持运行到最后一个并发 Grok 会话退出。进入 Grok 后可以使用 `/model` 切换 CCR 暴露的模型。

## Kimi CLI

选择 Kimi CLI、设置默认模型和一个或多个可用 CCR 模型，然后运行复制出的 `ccr-app <配置名称>` 命令。CCR 会通过配置专属 `KIMI_CODE_HOME` 启动 Kimi，并在其中生成 `config.toml`，把所有选中模型注册到本地 CCR 网关。进入 Kimi 后可使用 `/model` 在这些模型之间切换。用户原有的 `~/.kimi-code/config.toml` 不会被改写；可用时，会继续复用来源 Kimi home 中的会话、技能、插件、MCP 配置和凭据。CCR Desktop 未运行时，该包装器同样可以启动受管的临时网关。

## ZCode

ZCode 主要关注模型、供应商 ID、供应商名称，以及是否从 CCR 启动。它走 App surface，不需要 Codex CLI 的路径字段。

## 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex、Grok CLI、Kimi CLI 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。Kimi CLI 支持从 `~/.kimi-code/config.toml` 导入受管 OAuth 登录态和 API Key 供应商。
