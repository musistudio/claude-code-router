---
title: Codex 接入与配置
pageTitle: Codex
eyebrow: 详细配置
lead: "把 Codex（CLI 与 ChatGPT 桌面应用）接入 CCR。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

Codex 是 OpenAI 的编码 Agent。CCR 同时支持两种形态：

- **Codex CLI**：终端 Agent。CCR 在 Codex 的 `config.toml` 中写入受管供应商，并通过中间件启动器打开 CLI。
- **ChatGPT 应用**：桌面应用（更名后的 Codex 桌面应用）。CCR 用隔离的用户数据目录启动它，并通过 CCR 中间件转发其 app-server 流量。

当你想让 Codex 走非 OpenAI 供应商、固定模型，或运行相互隔离的 Codex/ChatGPT 实例时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Codex CLI（`PATH` 中可用 `codex`），或已安装 ChatGPT 桌面应用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 Codex

保存一个 Codex 配置时，CCR 会在 Codex 的 **配置文件**（`config.toml`）中写入受管内容：

- 顶层写入 `model_provider`、`model`，以及指向模型目录的 `model_catalog_json`。
- 写入 `[model_providers.<供应商 ID>]` 表，包含 CCR 网关 `/v1` 地址、Bearer Token 与 `wire_api = "responses"`。
- 写入独立的 `<供应商 ID>.config.toml` 配置文件（Codex 的分离配置文件格式）。
- 写入模型目录文件（`ccr-model-catalog.json`），供原生 app-server 读取 `model/list`。
- 生成 CLI **中间件启动器**，设置 `CODEX_HOME`、供应商/模型与入口模式，再启动 Codex。

选择 **仅从 CCR 打开时生效** 时，这些文件落在按配置 `id` 隔离的 CCR 受管目录中。选择 **系统默认** 时，CCR 写入 `~/.codex/config.toml`。

对于 **ChatGPT 应用**，CCR 会直接启动应用包内的 Electron 可执行文件，为其分配隔离的用户数据目录，并把 `CODEX_CLI_PATH` 指向 CCR 中间件。中间件把 app-server 流量转发到 ChatGPT 内置的 Codex CLI，仅适配账号展示，不合成模型或插件列表。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Codex**。
2. 填写 **配置名称**（例如 `Codex - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 确认 **供应商 ID**、**供应商名称** 与 **Codex 模型**。
5. 按需调整 **显示全部会话**、**配置文件** 与环境变量。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 Codex（终端按钮打开 CLI，播放按钮打开 ChatGPT）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Codex** | 让 CCR 采用 Codex 的 `config.toml` 机制。 |
| 配置名称 | 自由文本，例如 `Codex - Work` | 标识该配置，并用于 `ccr-app "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 隔离的 CCR 受管文件 vs. 真实的 `~/.codex/config.toml`。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | 提供哪些启动入口（终端命令和/或 ChatGPT 应用）。 |
| 供应商 ID | 字母、数字、`.`、`_`、`-`；默认 `claude-code-router` | 写入 Codex 的 `model_provider` 与供应商表键名，请保持稳定。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 Codex 中显示的名称。 |
| Codex 模型 | 供应商模型或 Fusion 模型 | Codex 默认模型。留空时 CCR 使用第一个可用默认模型。 |
| 显示全部会话 | 开关 | 写入 `show_all_sessions`，让 Codex 列出全部会话。 |
| 配置文件 | 路径，默认 `~/.codex/config.toml` | 在“系统默认”范围下使用；“仅从 CCR 打开”写入 CCR 受管目录。 |
| Codex CLI 路径 | 可选，`codex` 可执行文件绝对路径 | 供中间件启动器使用；仅当 Codex 不在 `PATH` 时填写。 |
| Codex home | 可选目录 | 设置 `CODEX_HOME`；仅当需要特定 home 目录时填写。 |
| 远程前端模式 | `app` / `cli` / `claude-code` | 中间件呈现 Codex 前端的方式，无特殊需要请保持默认。 |
| CCR 托管压缩 | 开关 | 让 CCR 为该配置托管上下文压缩。 |
| 环境变量 | 键值对 | 注入 Codex CLI / ChatGPT，见下文。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 ChatGPT 应用入口。 |

## 环境变量

- `CCR_CODEX_CHATGPT_AUTH_FILE`（旧名 `CODEXL_CODEX_CHATGPT_AUTH_FILE`）：指向有效 `auth.json` 的路径。仅当希望某个配置在内存中共享 ChatGPT 登录 Token（不复制文件）时设置。默认每个配置只读取自身 Codex home 的登录态。
- Claude Code 专属的模型发现变量 **不会** 传给 Codex。
- 其他键值对会导出到中间件启动器。

> 未共享凭据的配置会报告一个本地的非 OpenAI 兼容身份，使当前 ChatGPT 版本不会陷入反复认证/校验循环。CCR 仅在进程启动期间创建临时的 `ccr-local-profile` 引导项，并在首次原生响应后移除，绝不作为登录态保留。

## 打开与使用

- **CLI**：点击终端按钮，运行复制出的命令：
  ```text
  ccr-app "Codex - Work"
  ```
- **App**：点击播放按钮，用该配置的模型、供应商和独立用户数据目录打开 ChatGPT。再次打开同一配置会激活已有窗口。

## 多实例

每个配置都有独立的 `id`。选择 **仅从 CCR 打开时生效** 时，Codex 会获得隔离的配置文件与中间件启动器，ChatGPT 会获得独立的用户数据目录，因此多个 Codex 配置可同时运行，各自使用不同的模型或供应商。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 ChatGPT 后，伴随工作进程会使用 Codex 原生 rollout 会话进行项目/会话浏览与续接、排队、取消、模型设置、用量、附件与诊断。它仅随受管应用存在。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 Codex。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 在 CLI 中确认当前使用的就是配置的模型。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 Codex；除非范围是 **系统默认**，否则直接打开的 Codex 不受影响。
- **ChatGPT 一直要求登录**：未共享凭据的配置会使用本地兼容身份，属正常现象。仅在你有意设置 `CCR_CODEX_CHATGPT_AUTH_FILE` 时才共享 Token。
- **供应商 ID 被拒**：只使用字母、数字、点、下划线或连字符，并在多次保存间保持稳定。
- **App 中模型不对**：检查 **Codex 模型** 字段；留空时 CCR 会回退到第一个可用默认模型。
