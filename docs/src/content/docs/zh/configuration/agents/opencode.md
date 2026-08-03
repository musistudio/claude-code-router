---
title: OpenCode 接入与配置
pageTitle: OpenCode
eyebrow: 详细配置
lead: "把 OpenCode（CLI 与 App）接入 CCR。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

OpenCode 是一款采用 OpenAI 兼容供应商模型的编码 Agent。CCR 同时支持两种形态：

- **OpenCode CLI**：终端 Agent。CCR 在 OpenCode 的 JSONC 配置中写入受管网关供应商，并通过包装器打开 CLI。
- **OpenCode App**：桌面应用。CCR 用相同的有效配置启动已安装的 OpenCode Desktop 可执行文件。

当你想让 OpenCode 走任意 CCR 供应商或 Fusion 模型，或给 App 挂载 IM 机器人时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 OpenCode CLI（`PATH` 中可用 `opencode`）；如需 App 模式，已安装 OpenCode Desktop 应用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 OpenCode

保存一个 OpenCode 配置时，CCR 会：

- 在 OpenCode 的 **配置文件**（`opencode.jsonc`）中写入受管网关供应商，把 OpenCode 指向 CCR 网关，并使用该配置的 Token 与所选模型。
- 生成启动 **包装器**，把 `OPENCODE_CONFIG`（以及内联的 `OPENCODE_CONFIG_CONTENT`）指向受管配置，设置 `OPENCODE_CLIENT=cli`，再启动 OpenCode。

选择 **仅从 CCR 打开时生效** 时，配置落在按配置 `id` 隔离的 CCR 受管目录中。选择 **系统默认** 时，CCR 写入真实的 `~/.config/opencode/opencode.jsonc`。App 则用相同的有效配置启动已安装的 OpenCode Desktop 可执行文件。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **OpenCode**。
2. 填写 **配置名称**（例如 `OpenCode - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 确认 **供应商 ID**、**供应商名称** 与 **OpenCode 模型**。
5. 按需调整 **配置文件** 与环境变量。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 OpenCode（终端按钮打开 CLI，播放按钮打开 App）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **OpenCode** | 让 CCR 写入 OpenCode 网关配置与包装器。 |
| 配置名称 | 自由文本，例如 `OpenCode - Work` | 标识该配置，并用于 `ccr-app "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 隔离的 CCR 受管配置 vs. 真实的 `~/.config/opencode/opencode.jsonc`。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | 提供哪些启动入口（终端命令和/或 App）。 |
| 供应商 ID | 默认 `claude-code-router` | CCR 写入 OpenCode 配置的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 OpenCode 中显示的名称。 |
| OpenCode 模型 | 供应商模型或 Fusion 模型 | OpenCode 通过 CCR 使用的默认模型。 |
| 配置文件 | 路径，默认 `~/.config/opencode/opencode.jsonc` | 在“系统默认”范围下使用；“仅从 CCR 打开”写入 CCR 受管目录。 |
| 环境变量 | 键值对 | 注入 OpenCode CLI、App 及其机器人工作进程，见下文。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 OpenCode App 入口。 |

> OpenCode 不暴露 **显示全部会话**，该项被强制关闭。

## 环境变量

- `CCR_OPENCODE_BIN` / `OPENCODE_BIN`：当 CCR Desktop 进程的 `PATH` 中找不到 `opencode` 时，指定真实可执行文件的绝对路径。
- `CCR_OPENCODE_BOT_CWD`：机器人工作进程运行 OpenCode 的工作目录（通过 `opencode run --dir` 传入）。使用非默认工作区时，把它设为 App 当前打开的同一项目目录；否则机器人默认使用新工作区的文件系统根目录。
- `CCR_OPENCODE_BOT_AUTO_APPROVE=true`：为机器人工作进程启用 OpenCode 危险的 `--auto` 模式。仅在可信环境中使用。
- CCR 自行管理的变量（`OPENCODE_CONFIG`、`OPENCODE_CONFIG_CONTENT`、`OPENCODE_CLIENT`、`CCR_PROFILE_SURFACE`）均为保留项——手动设置无效。

## 打开与使用

- **CLI**：点击终端按钮，运行复制出的命令：
  ```text
  ccr-app "OpenCode - Work"
  ```
- **App**：点击播放按钮，用该配置打开 OpenCode Desktop。OpenCode Desktop 为单实例，因此切换 OpenCode 配置时 CCR 会先停止受管实例。

## 多实例

每个配置都有独立的 `id`。选择 **仅从 CCR 打开时生效** 时，OpenCode 会获得隔离的配置文件与包装器。注意 App 本身是单实例，同一时间只能运行一个 OpenCode App；请从 CCR 切换配置，而不是再启动一个 App。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 App 后，CCR 会在 App 旁启动伴随工作进程，通过 OpenCode CLI 运行进入的机器人消息，并在同一会话中回复。用 `/project list|current|use` 选择项目，再用 `/session list|current|new|use|reset` 管理会话。仅这两个命令域会被拦截。受管 App 退出或切换配置时，该工作进程停止。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 OpenCode。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 OpenCode；除非范围是 **系统默认**，否则直接打开的 OpenCode 不受影响。
- **找不到 `opencode`**：用 `CCR_OPENCODE_BIN` 指定真实可执行文件路径。
- **机器人在错误目录运行**：把 `CCR_OPENCODE_BOT_CWD` 设为 App 中打开的项目目录。
- **App 没有切换配置**：OpenCode Desktop 为单实例——请从 CCR 切换配置，CCR 会先停止上一个受管实例。
