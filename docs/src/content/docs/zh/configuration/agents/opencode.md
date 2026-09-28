---
title: OpenCode 接入与配置
pageTitle: OpenCode
eyebrow: 详细配置
lead: "把 OpenCode（CLI 与 App）接入 CCR。"
---

## 适用场景

OpenCode 是一款采用 OpenAI 兼容供应商模型的编码 Agent。CCR 同时支持两种形态：

- **OpenCode CLI**：终端 Agent。
- **OpenCode App**：桌面应用。

当你想让 OpenCode 走任意 CCR 供应商或 Fusion 模型，或给 App 挂载 IM 机器人时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 OpenCode CLI（`PATH` 中可用 `opencode`）；如需 App 模式，已安装 OpenCode Desktop 应用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **OpenCode**。
2. 填写 **配置名称**（例如 `OpenCode - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 确认 **供应商 ID**、**供应商名称** 与 **OpenCode 模型**。
5. 只有本机环境有特殊要求时，再调整高级设置。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 OpenCode（终端按钮打开 CLI，播放按钮打开 App）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **OpenCode** | 在 CCR 中创建 OpenCode 启动入口。 |
| 配置名称 | 自由文本，例如 `OpenCode - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 仅影响从 CCR 打开的 OpenCode，或作为系统默认 OpenCode 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | 提供哪些启动入口（终端命令和/或 App）。 |
| 供应商 ID | 默认 `claude-code-router` | 当前 OpenCode 配置使用的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 OpenCode 中显示的名称。 |
| OpenCode 模型 | 供应商模型或 Fusion 模型 | OpenCode 通过 CCR 使用的默认模型。 |
| 配置文件 | 路径 | 用于系统默认 OpenCode 配置。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 OpenCode App 入口。 |

## 打开与使用

- **CLI**：在桌面端点击终端按钮，运行复制出的命令：
  ```text
  ccr-app "OpenCode - Work"
  ```
  CLI请执行：
  ```text
  ccr "OpenCode - Work"
  ```
- **App**：点击播放按钮，用该配置打开 OpenCode Desktop。OpenCode Desktop 为单实例，因此请从 CCR 切换配置。

## 多实例

需要不同模型或供应商时，创建多个 OpenCode 配置即可。App 本身是单实例，请从 CCR 切换配置，而不是再启动一个 App。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 App 后，OpenCode 可以把会话接入所选 IM 通道。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 OpenCode。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 OpenCode；除非范围是 **系统默认**，否则直接打开的 OpenCode 不受影响。
- **找不到 `opencode`**：确认 OpenCode CLI 已安装，并且启动 CCR Desktop 的同一 shell 环境可以找到它。
- **App 没有切换配置**：OpenCode Desktop 为单实例，请从 CCR 切换配置。
