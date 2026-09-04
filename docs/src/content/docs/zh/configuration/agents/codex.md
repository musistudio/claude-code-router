---
title: Codex 接入与配置
pageTitle: Codex
eyebrow: 详细配置
lead: "把 Codex（CLI 与 ChatGPT 桌面应用）接入 CCR。"
---

## 适用场景

Codex 是 OpenAI 的编码 Agent。CCR 同时支持两种形态：

- **Codex CLI**：终端 Agent。
- **ChatGPT 应用**：桌面应用（更名后的 Codex 桌面应用）。

当你想让 Codex 走非 OpenAI 供应商、固定模型，或运行独立的 Codex/ChatGPT 实例时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Codex CLI（`PATH` 中可用 `codex`），或已安装 ChatGPT 桌面应用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Codex**。
2. 填写 **配置名称**（例如 `Codex - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 确认 **供应商 ID**、**供应商名称** 与 **Codex 模型**。
5. 只有本机环境有特殊要求时，再调整高级设置。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 Codex（终端按钮打开 CLI，播放按钮打开 ChatGPT）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Codex** | 在 CCR 中创建 Codex 启动入口。 |
| 配置名称 | 自由文本，例如 `Codex - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 仅影响从 CCR 打开的 Codex，或作为系统默认 Codex 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | 提供哪些启动入口（终端命令和/或 ChatGPT 应用）。 |
| 供应商 ID | 字母、数字、`.`、`_`、`-`；默认 `claude-code-router` | 当前 Codex 配置使用的供应商引用，请保持稳定。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 Codex 中显示的名称。 |
| Codex 模型 | 供应商模型或 Fusion 模型 | Codex 默认模型。留空时 CCR 使用第一个可用默认模型。 |
| 显示全部会话 | 开关 | 让 Codex 列出全部会话。 |
| 配置文件 | 路径 | 用于系统默认 Codex 配置。 |
| Codex CLI 路径 | 可选，`codex` 可执行文件绝对路径 | 仅当 Codex 不在 `PATH` 时填写。 |
| Codex home | 可选目录 | 设置 `CODEX_HOME`；仅当需要特定 home 目录时填写。 |
| 远程前端模式 | `app` / `cli` / `claude-code` | 无特殊需要请保持默认。 |
| CCR 托管压缩 | 开关 | 让 CCR 为该配置托管上下文压缩。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 ChatGPT 应用入口。 |

## 打开与使用

- **CLI**：在桌面端点击终端按钮，运行复制出的命令：
  ```text
  ccr-app "Codex - Work"
  ```
  CLI请执行：
  ```text
  ccr "Codex - Work"
  ```
- **App**：点击播放按钮，用该配置的模型和供应商打开 ChatGPT。再次打开同一配置会激活已有窗口。

## 多实例

需要不同模型或供应商时，创建多个 Codex 配置即可。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 ChatGPT 后，ChatGPT 可以把会话接入所选 IM 通道。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 Codex。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 在 CLI 中确认当前使用的就是配置的模型。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 Codex；除非范围是 **系统默认**，否则直接打开的 Codex 不受影响。
- **ChatGPT 一直要求登录**：正常登录 ChatGPT 后，再从 CCR 重新打开。
- **供应商 ID 被拒**：只使用字母、数字、点、下划线或连字符，并在多次保存间保持稳定。
- **App 中模型不对**：检查 **Codex 模型** 字段；留空时 CCR 会回退到第一个可用默认模型。
