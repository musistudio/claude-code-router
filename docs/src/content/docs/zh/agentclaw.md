---
title: AgentClaw
pageTitle: AgentClaw
eyebrow: AgentClaw
lead: AgentClaw 把你在本机通过 CCR 运行的 Agent 接入 IM：Agent 继续在你的电脑上处理项目、工具和会话，IM 里的 Bot 负责远程查看、接力和回复。本页介绍它的工作方式、三种消息模式和适用场景。
---

AgentClaw 是 CCR 的 Agent 接力能力。由 CCR 管理的本机 Agent 保留原有的工作区、登录态、配置文件、模型路由和工具权限；AgentClaw 通过 IM Bot 为它暴露一个远程入口。你可以在 Slack、Discord、Telegram、LINE、微信、企业微信、飞书或钉钉里查看 Agent 输出、继续对话、处理权限请求，或在电脑锁屏后接管当前任务。

接力（handoff）指电脑锁屏并超过空闲阈值后，Agent 的后续交互自动转到 IM，你可以在手机或另一台设备上继续。接力依赖跟随 App 启停的 companion worker：从 CCR 打开 Agent App 时 worker 随之启动，App 退出时 worker 和 Bot 连接一起停止。CLI-only Agent 可以继续通过 CCR 路由模型请求，但不会把消息转发到 IM。

## 适合场景

| 场景 | AgentClaw 怎么工作 |
| --- | --- |
| 离开电脑后继续跟进 | 桌面锁屏并达到空闲阈值后，Agent 新消息自动进入 IM，你可以直接回复 |
| 保留远程可见记录 | 开启转发后，Agent 的可见输出会持续同步到指定会话 |
| 团队协作 | 将某个本机 Agent 接到团队频道，让成员通过统一的 `/project` 和 `/session` 命令查看状态 |
| 使用本机能力 | Agent 仍运行在你的电脑上，继续使用本机仓库、凭据、MCP、Skills、Shell 权限和原生 Session |

## 核心概念

| 概念 | 含义 |
| --- | --- |
| AgentClaw | CCR 为本机 Agent 提供的 IM 接入层，接口风格与 [OpenClaw](https://openclaw.ai) 一致（OpenClaw 是一个在本机运行、通过 IM 平台交互的开源个人 AI 助手项目） |
| 本机 Agent | 由 CCR 通过 Agent 配置打开的 Claude Code、Codex、OpenCode、ZCode 等 Agent |
| Bot | 连接 IM 平台的消息入口；在 CCR UI 中仍叫 **Bot 管理** |
| Project | Agent 原生项目或工作目录 |
| Session | Project 下的 Agent 原生会话 |
| Companion worker | 跟随受管 Agent App 启停的接力进程，负责 IM 消息、Project/Session、队列、附件和诊断 |

AgentClaw 的生命周期跟从 CCR 打开的 Agent App 一致。打开 Claude、Codex、ZCode 或 OpenCode App 时，CCR 启动对应的 companion worker；App 退出时 worker 和 Bot 连接同步停止。CLI-only Agent 当前可以通过 CCR 路由模型请求，但不转发 Bot 消息。

## 支持范围

| Agent | AgentClaw 状态 |
| --- | --- |
| Claude App | 完整支持 Bot 转发、接力、Project/Session、权限请求和附件能力 |
| Codex / ChatGPT App | 完整支持 Bot 转发、接力、Project/Session、队列、模型设置、用量和附件能力 |
| OpenCode App | 完整支持 Bot 转发、接力和 Project/Session；消息由 OpenCode CLI 在同一配置下执行 |
| ZCode App | 完整支持 Bot 转发、接力和原生 Session 扫描 |
| Claude Code、Codex CLI | 可以通过 CCR 配置模型路由；当前不转发 Bot 消息 |
| Grok CLI、Kimi CLI | 可以通过 CCR 配置模型路由；当前是 CLI-only，不进入 AgentClaw 接力 |
| 其他本机 Agent | 需要先能被 CCR 以 App 入口管理，并实现对应 companion worker，才能作为 AgentClaw 执行体 |

## 三种模式

- **转发 Agent 消息**：把 Agent 可见输出持续同步到 IM。适合需要完整记录、团队旁观或调试。
- **接力**：桌面锁屏并达到空闲阈值后，把后续交互接力到 IM。适合只在离开电脑后接管。
- **仅回复**：关闭转发和接力后，Bot 只处理从 IM 主动发起的消息。

同一个 IM conversation 中的普通消息会按顺序执行。`/project`、`/session status` 和 `/session cancel` 等管理命令保持即时响应；排队、取消、超时和 worker 重启恢复都有明确状态。

## Project 与 Session 命令

AgentClaw 的公开命令域是 `/project` 和 `/session`。其他 slash command 会返回未知命令；普通自然语言，包括 `help` 和 `list`，会作为 prompt 进入 Agent。

### Project 命令

| 命令 | 作用 |
| --- | --- |
| `/project` | 查看 Project 命令帮助和 App 在线边界 |
| `/project list [page]` | 分页列出 Agent 已知项目 |
| `/project find <text>` | 搜索项目名称或路径 |
| `/project current` | 查看当前 Project |
| `/project use <n>` | 切换 Project，并清除原 Session 选择 |
| `/project name <label>` | 设置当前 Project 的 Bot 显示名称 |

### Session 命令

| 命令 | 作用 |
| --- | --- |
| `/session` | 查看全部 Session 命令 |
| `/session list [page]`、`/session find <text>` | 只浏览当前 Project 中的 Sessions |
| `/session current`、`new [title]`、`use <n>`、`reset` | 查看、新建、继续或清除 Session 选择 |
| `/session status`、`cancel` | 查看当前 turn/队列，或取消当前 turn 并清空队列 |
| `/session approve [session]`、`deny`、`answer <text>` | 响应 Agent 产生的权限或输入请求；文本命令在所有平台可用，支持卡片的平台还会显示按钮 |
| `/session name <label>` | 重命名当前 Session |
| `/session archive <n>`、`restore <n>`、`delete <n> confirm` | 归档、恢复或确认永久删除 |
| `/session history [count]`、`usage` | 查看最近历史和 Token/缓存/成本摘要 |
| `/session models`、`model`、`effort`、`mode` | 查看或调整当前 conversation 的 Session 运行设置 |
| `/session memory ...`、`skills`、`skill`、`shortcut ...` | 管理持久上下文、Agent Skills 和快捷指令 |
| `/session doctor`、`deliveries` | 查看连接、outbox、最近投递和脱敏错误 |

## 下一步

1. 先读 [使用和配置](/agentclaw/setup/)，完成 Bot、Agent 配置、模式、附件、超时和 Shell 权限设置。
2. 按你要接入的平台进入 [Slack](/agentclaw/slack/)、[Discord](/agentclaw/discord/)、[Telegram](/agentclaw/telegram/)、[LINE](/agentclaw/line/)、[微信](/agentclaw/weixin-ilink/)、[企业微信](/agentclaw/wecom/)、[飞书](/agentclaw/feishu/)或[钉钉](/agentclaw/dingtalk/)页面，补齐平台后台凭据。
3. 从 CCR 重新打开目标 Agent App，再用 `/project current`、`/session list` 和一条普通消息验证链路。
