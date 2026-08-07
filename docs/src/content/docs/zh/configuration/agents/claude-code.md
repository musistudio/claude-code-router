---
title: Claude Code 接入与配置
pageTitle: Claude Code
eyebrow: 详细配置
lead: "把 Claude Code（CLI 与 App）接入 CCR，让每一次请求都经过你配置的供应商、路由与 Fusion 模型。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

Claude Code 是 Anthropic 的编码 Agent。CCR 同时支持它的两种形态：

- **Claude Code CLI**：终端 Agent。CCR 改写它的设置文件，使其指向 CCR 网关，并通过启动包装器打开。
- **Claude App**：桌面应用。CCR 以零配置方式打开它，自动写入网关、API Key、模型发现列表，以及隔离的用户数据目录。

当你想让 Claude Code 走非 Anthropic 供应商、固定某个模型、运行多个相互隔离的 Claude Code 实例，或挂载 IM 机器人时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型，再回到本页。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 本机已安装并登录 Claude Code，或准备从 CCR 打开。
3. 进入 **Agent 配置** 页面，点击 **添加配置**。

## CCR 如何接入 Claude Code

保存（应用）一个 Claude Code 配置时，CCR 会在 Claude Code 的 **设置文件** 中写入受管内容：

- 把 `apiKeyHelper` 指向 CCR 生成的辅助脚本，由它返回该配置的 CCR API Key。
- 把网关地址写入 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_BASE_URL`、`CLAUDE_AGENT_API_BASE_URL`。
- 移除可能冲突的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`，让密钥来自 CCR 而非本地存储。
- 写入你选择的模型与各档位模型别名（见下文）。
- 生成启动 **包装器**，设置入口模式、远程同步（用于 App）、机器人环境与工具/MCP 配置，再启动 Claude Code。

选择 **仅从 CCR 打开时生效** 时，这些文件都落在按配置 `id` 隔离的 CCR 受管目录中，你从系统直接打开的 Claude Code 不受影响。选择 **系统默认** 时，CCR 会写入真实的 `~/.claude/settings.json`。

Claude App 是 **零配置** 的：从 CCR 打开时会自动写入 App 网关配置、API Key、模型发现列表与独立的用户数据目录。如果 Claude App 已在运行，按提示从 CCR 重新打开即可。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Claude Code**。
2. 填写 **配置名称**（例如 `Claude Code - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 选择 **模型**（留空则保留 Claude Code 默认模型）。
5. 按需填写各档位模型、设置文件与环境变量。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 Claude Code（终端按钮打开 CLI，播放按钮打开 App）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Claude Code** | 让 CCR 采用 Claude Code 的设置文件机制。 |
| 配置名称 | 自由文本，例如 `Claude Code - Work` | 在 CCR 中标识该配置，并用于 `ccr-app "<名称>"` 命令；允许空格，复制命令时自动加引号。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | “仅从 CCR 打开”使用 CCR 受管的隔离设置文件；“系统默认”写入 `~/.claude/settings.json`。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | “CLI 与 APP”同时提供终端命令和 App 按钮；“仅 CLI”只生成命令；“仅 App”只提供 App 入口。 |
| 模型 | 供应商模型或 Fusion 模型，例如 `Moonshot/kimi-k3` | 写入 `ANTHROPIC_MODEL`。留空则保留 Claude Code 自身默认模型。 |
| Fable 模型 | 可选 | 写入 `ANTHROPIC_DEFAULT_FABLE_MODEL`，即 Claude Code 在 Fable 档位使用的模型。 |
| Opus 模型 | 可选 | 写入 `ANTHROPIC_DEFAULT_OPUS_MODEL`。 |
| Sonnet 模型 | 可选 | 写入 `ANTHROPIC_DEFAULT_SONNET_MODEL`。 |
| Haiku 模型 | 可选 | 写入 `ANTHROPIC_DEFAULT_HAIKU_MODEL`（同时也是小型快速模型）。 |
| 设置文件 | 路径，默认 `~/.claude/settings.json` | 在“系统默认”范围下使用；“仅从 CCR 打开”会改用 CCR 受管的隔离文件而忽略此项。 |
| CCR 托管压缩 | 开关 | 让 CCR 为该配置托管上下文压缩（compact）。 |
| 环境变量 | 键值对 | 合并进 Claude Code 设置的 `env`，见下文。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 Claude App 入口；CLI 暂不转发机器人消息。 |

### 模型档位

Claude Code 会为内部不同档位选择模型。**模型** 字段设置默认值（`ANTHROPIC_MODEL`），**Fable / Opus / Sonnet / Haiku 模型** 字段则可单独覆盖某个档位——例如让 Opus 走更强的供应商模型，而 Haiku 走更便宜的模型。某个档位留空则由 Claude Code 自行决定。

### CLI 与 App 的模型列表

| 入口 | 模型列表来源 | 说明 |
| --- | --- | --- |
| Claude Code CLI | CCR 网关模型发现 | 在 CLI 中使用 `/model` 查看并切换 CCR 暴露的模型，包括 Fusion 模型。 |
| Claude App | CCR 生成的 App 推理模型 | Claude App 需要 Claude 兼容的模型名，CCR 会把每个 `供应商/模型` 与 Fusion 模型映射成 App 可识别的条目，并在显示名中保留真实含义。 |

## 环境变量

- `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`：默认开启，使 `/model` 能列出网关模型。除非有特殊需要，请保留。
- `CCR_CLAUDE_CODE_BIN`：当 CCR Desktop 进程的 `PATH` 中找不到 `claude` 时，用它指定真实可执行文件的绝对路径。
- 其他键值对会导出到启动包装器并合并进设置 `env`。
- 在中国时区下，CCR 还会自动设置 `TZ=UTC` 以避免时区相关的工具故障，无需手动配置。

> 网关地址、API Key 辅助脚本和启动包装器都由 CCR 自动写入。请勿在此手动设置 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`——这些由 CCR 托管。

## 打开与使用

- **CLI**：点击配置卡片上的终端按钮，运行复制出的命令：
  ```text
  ccr-app "Claude Code - Work"
  ```
  进入 Claude Code 后用 `/model` 查看并切换 CCR 暴露的模型。
- **App**：点击播放按钮。CCR 会用该配置的网关配置和独立用户数据目录打开 Claude App。再次打开同一配置会激活已有窗口。

## 多实例

每个配置都有独立的 `id`。选择 **仅从 CCR 打开时生效** 时，Claude Code CLI 会获得隔离的设置文件与包装器，Claude App 会获得独立的用户数据目录，因此多个 Claude Code 配置可同时运行，各自使用不同的模型、范围或机器人。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 Claude App 后，伴随工作进程会把项目/会话、流式回复、附件、会话用量，以及原生的权限/Ask User 请求暴露到 IM。App 关闭时该工作进程随之停止。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 Claude Code。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了 CCR 网关（以及使用了哪个供应商/模型）。
4. 在 CLI 中运行 `/model`，确认 CCR 暴露的模型出现。

## 常见问题

- **请求没有走到 CCR**：确认配置已 **启用**，且你是从 CCR 打开 Claude Code（而非从系统直接打开）。除非范围是 **系统默认**，否则直接打开的 Claude Code 不受影响。
- **`/model` 看不到 CCR 模型**：保留环境变量中的 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`，并确认已配置供应商与模型。
- **Claude App 没有应用配置**：Claude App 已在运行——从 CCR 重新打开，或按提示重启。
- **模型档位未生效**：档位只改变 Claude Code 某个内部档位使用哪个供应商模型；取值必须是 CCR 能提供的有效 `供应商/模型` 或 Fusion 模型。
