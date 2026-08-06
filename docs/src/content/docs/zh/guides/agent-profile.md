---
title: 接入 Agent 配置
pageTitle: 接入 Agent 配置
eyebrow: 快速开始
lead: "页面顶部的交互式面板可直接连到你正在运行的 CCR，为 Claude Code / Codex 设置默认模型；或按下方说明在 Agent 配置里添加配置、从 CCR 打开并在请求日志中验证。"
---

## 通用建议

- 在 **Agent 配置** 点击 **添加配置**，选择你的 Agent，填写 **配置名称**。
- 试用阶段优先选择 **仅从 CCR 打开时生效**（默认），只影响从 CCR 打开的 Agent；确认稳定后再考虑 **系统默认**。
- Claude Code、Codex 可选择 **入口模式**（CLI 与 APP / 仅 CLI / 仅 App）；Grok CLI、Kimi CLI 固定为仅 CLI，ZCode 固定为仅 App。
- 保存后尽量用配置卡片上的按钮启动 Agent（终端按钮打开 CLI，播放按钮打开 App），再发一条请求到 **请求日志** 验证。

## Claude Code

支持 CLI 和 App 两种形态。

1. **添加配置** → 选择 **Claude Code**，填写 **配置名称**，选择 **生效范围** 与 **入口模式**。
2. 选择 **模型**（留空则保留 Claude Code 默认模型）。
3. **保存**，然后用终端按钮打开 CLI，或播放按钮打开 Claude App。
4. 发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关；CLI 中可用 `/model` 查看、切换 CCR 暴露的模型。

各档位模型、设置文件和环境变量见 [Claude Code 接入与配置](../../configuration/agents/claude-code/)。

## Codex

支持 Codex CLI 和 ChatGPT 桌面应用两种形态。

1. **添加配置** → 选择 **Codex**，填写 **配置名称**，选择 **生效范围** 与 **入口模式**。
2. 确认 **供应商 ID**、**供应商名称** 和 **Codex 模型**。
3. **保存**，然后用终端按钮打开 CLI，或播放按钮打开 ChatGPT。
4. 发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关。

`config.toml` 字段、CLI 路径和 ChatGPT 登录共享见 [Codex 接入与配置](../../configuration/agents/codex/)。

## Grok CLI

仅支持 CLI，且固定为 **仅从 CCR 打开时生效**，不会改动你的全局 Grok 配置。

1. **添加配置** → 选择 **Grok CLI**，填写 **配置名称**。
2. 选择 **模型**。
3. **保存**，复制卡片上的 `ccr-app "<配置名称>"` 命令并运行。
4. 在 Grok 中发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关；用 `/model` 切换 CCR 暴露的模型。

CCR Desktop 未运行时，该命令会启动一个可共享的临时网关，并在最后一个会话退出后停止。完整字段见 [Grok CLI 接入与配置](../../configuration/agents/grok/)。

## Kimi CLI

仅支持 CLI，且固定为 **仅从 CCR 打开时生效**，不会改写原有的 `~/.kimi-code/config.toml`。

1. **添加配置** → 选择 **Kimi CLI**，填写 **配置名称**。
2. 选择 **Kimi 模型**（默认模型）以及一个或多个 **可用模型**。
3. **保存**，复制卡片上的 `ccr-app "<配置名称>"` 命令并运行。
4. 在 Kimi 中发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关；用 `/model` 在默认模型与可用模型之间切换。

CCR 会用配置专属的 `KIMI_CODE_HOME` 启动 Kimi，并复用源 home 中的会话、技能、插件和凭据。完整字段见 [Kimi CLI 接入与配置](../../configuration/agents/kimi/)。

## ZCode

仅支持 App（入口固定为 **仅 App**）。

1. **添加配置** → 选择 **ZCode**，填写 **配置名称**。
2. 确认 **ZCode 模型**、**供应商 ID** 和 **供应商名称**。
3. **保存**，点击播放按钮打开 ZCode（再次打开会激活已有窗口）。
4. 发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关。

字段逐项说明和多实例、机器人绑定等进阶用法见 [ZCode 接入与配置](../../configuration/agents/zcode/)。

## OpenCode

支持 OpenCode CLI 和桌面应用两种形态。

1. **添加配置** → 选择 **OpenCode**，填写 **配置名称**，选择 **生效范围** 与 **入口模式**。
2. 确认 **供应商 ID**、**供应商名称** 和 **OpenCode 模型**。
3. **保存**，然后用终端按钮打开 CLI，或播放按钮通过 CCR Desktop 打开 OpenCode 桌面应用。
4. 发一条消息确认能正常回复，到 **请求日志** 核对请求是否经过网关。

`opencode.jsonc` 字段、CLI 路径和配置写入见 [OpenCode 接入与配置](../../configuration/agents/opencode/)。
