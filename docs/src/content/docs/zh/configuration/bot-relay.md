---
title: Bot 与 IM 接力 Agent
pageTitle: Bot 与 IM 接力 Agent
eyebrow: 详细配置
lead: 通过 IM Bot 转发 Agent 消息，或在桌面空闲后把任务接力到手机。
---

CCR App Relay 的在线周期与由 CCR 打开的 Agent App 保持一致。打开 Claude、Codex、ZCode 或 OpenCode App 时，CCR 启动对应的伴生 worker；App 退出时 worker 和 Bot 连接同步停止。

## 常见模式

- **转发 Agent 消息**：把消息同步到 IM。
- **接力**：桌面空闲后，把交互接力到 IM。
- **仅回复**：关闭“转发 Agent 消息”和接力后，只回复从 IM 主动发起的 turn。

同一个 IM conversation 中的普通消息按顺序执行。`/project`、`/session status` 和 `/session cancel` 等管理命令保持即时响应；排队、取消、超时和 worker 重启恢复都有明确状态。

## Project 与 Session

Project 对应 Agent 的项目或工作目录，Session 对应该 Project 下的 Agent 原生会话。

### Project 命令

| 命令 | 作用 |
| --- | --- |
| `/project` | 查看 Project 命令帮助和 App 在线边界。 |
| `/project list [page]` | 分页列出 Agent 已知项目。 |
| `/project find <text>` | 搜索项目名称或路径。 |
| `/project current` | 查看当前 Project。 |
| `/project use <n>` | 切换 Project，并清除原 Session 选择。 |
| `/project name <label>` | 设置当前 Project 的 Bot 显示名称。 |

### Session 命令

| 命令 | 作用 |
| --- | --- |
| `/session` | 查看全部 Session 命令。 |
| `/session list [page]`、`/session find <text>` | 只浏览当前 Project 中的 Sessions。 |
| `/session current`、`new [title]`、`use <n>`、`reset` | 查看、新建、继续或清除 Session 选择。 |
| `/session status`、`cancel` | 查看当前 turn/队列，或取消当前 turn 并清空队列。 |
| `/session approve [session]`、`deny`、`answer <text>` | 响应 Agent 已经产生的权限或输入请求；所有平台提供文本命令，具备卡片能力的平台同时显示操作按钮。 |
| `/session name <label>` | 重命名当前 Session。 |
| `/session archive <n>`、`restore <n>`、`delete <n> confirm` | 归档、恢复或确认永久删除。 |
| `/session history [count]`、`usage` | 查看最近历史和 Token/缓存/成本摘要。 |
| `/session models`、`model`、`effort`、`mode` | 查看或调整当前 conversation 的 Session 运行设置。 |
| `/session memory ...`、`skills`、`skill`、`shortcut ...` | 管理持久上下文、Agent Skills 和快捷指令。 |
| `/session doctor`、`deliveries` | 查看连接、outbox、最近投递和脱敏错误。 |

Bot 的公开命令域为 `/project` 和 `/session`。其他 slash command 统一返回未知命令；普通自然语言（包括 `help`、`list`）作为 prompt 进入 Agent。

## Bot 设置

- **Bot 语言**：自动、English 或简体中文。
- **最长 turn 时间**：超时后中断 Agent turn 并回报最终状态。
- **Session 空闲重置**：超过指定时间后在当前 Project 中准备新 Session；设为 `0` 关闭。
- **消息分片与附件上限**：适配平台消息长度并限制入站文件大小。
- **流式回复与进度**：仅发送可见文本和工具阶段。
- **收发附件**：允许入站图片/文件和当前工作区产物回传。
- **允许 Agent 使用 Shell 工具**：控制 Agent 的 Shell 工具权限；Bot 命令域保持为 `/project` 和 `/session`。

状态文件持久保存有界的去重记录、待处理 turn、outbox 和最近投递结果。事件幂等保证每个 Agent turn 执行一次；再次打开 App 后，在 App 在线期间恢复待投递消息。

## 平台页面

Slack、Discord、Telegram、LINE、微信、企业微信、飞书和钉钉都有独立页面；iMessage 使用本机接入。SDK 按平台能力选择 Markdown、卡片、流式更新、文件消息或文本消息。
