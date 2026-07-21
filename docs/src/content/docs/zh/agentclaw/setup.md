---
title: AgentClaw 使用和配置
pageTitle: AgentClaw 使用和配置
eyebrow: AgentClaw
lead: 从创建 IM Bot 到绑定 Agent 配置、选择转发或接力模式的完整配置流程。第一次接入 AgentClaw，或需要调整 Bot 选项时，按本页操作。
---

## 前置条件

1. CCR 桌面 App 已运行，网关服务可用。
2. 已在 **供应商配置** 中添加可用模型，或准备好要使用的 Fusion 模型。
3. 已创建一个 **Agent 配置**，且 **入口模式** 包含 App。完整 AgentClaw 接力目前支持 Claude App、Codex/ChatGPT App、OpenCode App 和 ZCode App；CLI-only Agent 不转发 Bot 消息。
4. 目标 IM 平台已准备好 Bot 凭据、应用权限或二维码登录条件。

## 配置流程

1. 打开 **Bot 管理**，点击 **添加 Bot**。
2. 选择平台，填写 Token、Secret、Signing Secret、Robot Code、OAuth 信息或二维码登录。
3. 保存 Bot。
4. 打开目标 **Agent 配置**。
5. 确认 **入口模式** 包含 `App`，例如 `App only` 或 `CLI & APP`。
6. 打开 **Bot** 开关，选择刚保存的 Bot。
7. 按需配置转发、接力、语言、超时、附件、流式回复和 **允许 Agent 使用 Shell 工具**。
8. 保存 Agent 配置。
9. 从 CCR 重新打开 Claude App、Codex/ChatGPT App、OpenCode App 或 ZCode App。AgentClaw 只在受管 App 存活期间在线。

## 模式选择

| 模式 | 开关组合 | 适合场景 |
| --- | --- | --- |
| 全量转发 | 开启 **转发 Agent 消息** | 需要在 IM 中保留完整 Agent 输出，或团队需要旁观 |
| 锁屏接力 | 开启 **接力**，关闭 **转发 Agent 消息** | 离开电脑后再接收和回复 Agent |
| IM 主动调用 | 同时关闭 **接力** 和 **转发 Agent 消息** | 只希望用户从 IM 发起 turn，不同步桌面输出 |

接力当前使用屏幕锁定和空闲时间判断。手机 Wi-Fi / 蓝牙目标仍是实验配置，不参与当前运行时判断。

## 关键配置项

| 配置项 | 建议 |
| --- | --- |
| Bot 语言 | 选 `自动` 可跟随 conversation；团队频道建议固定为中文或英文 |
| 最长 turn 时间 | 根据 Agent 任务时长设置；超时后 CCR 会中断 turn 并回报最终状态 |
| Session 空闲重置 | 设为 `0` 表示不自动重置；需要每次离开都准备新会话时再设置分钟数 |
| 消息分片字符数 | 按平台消息长度限制设置；Slack/Discord 可稍大，微信/LINE 建议保守 |
| 附件上限 | 限制 IM 入站文件大小，避免把过大的文件交给 Agent |
| 收发附件 | 需要图片、文件和工作区产物回传时开启 |
| 流式回复 | 需要实时看到输出时开启；平台限制严格时可关闭 |
| 允许 Agent 使用 Shell 工具 | 只影响 Agent 工具权限，不会给 Bot 增加 shell 命令 |

## 使用方式

从 CCR 打开 Agent App 后，在 IM 中先选择工作区：

```text
/project list
/project use 1
/session list
/session use 1
```

然后直接发送自然语言消息。需要新会话时：

```text
/session new 修复登录问题
```

Agent 请求权限或输入时，可以用平台卡片按钮，也可以用文本命令：

```text
/session approve
/session deny
/session answer 选择第二个方案
```

查看状态和诊断：

```text
/session status
/session doctor
/session deliveries
```

## 验证

1. 从 CCR 打开目标 Agent App。
2. 在 IM 发送 `/project current`，确认 Bot 在线且能读取当前 Project。
3. 发送 `/session list`，确认能列出当前 Project 下的 Session。
4. 发送一条普通消息，确认 Agent 能执行并把回复发回同一个 IM conversation。
5. 锁屏电脑，等待超过接力空闲秒数，确认后续 Agent 消息进入 IM。
6. 关闭 Agent App，确认 Bot 状态变为离线。

Profile 卡片会显示 Bot 连接、最后事件、最后投递、待投递数量和脱敏错误；`/session doctor` 会返回同类诊断。

## 状态和安全边界

AgentClaw 会在本机保存有界的去重记录、待处理 turn、outbox 和最近投递结果。事件幂等保证每个 Agent turn 执行一次；再次打开 App 后，在 App 在线期间恢复待投递消息。

IM 端只有 `/project` 和 `/session` 两个命令域。普通消息会作为 Agent prompt，附件会按开关和大小限制进入 Agent。Shell 权限仍由 Agent 配置控制；只在可信 Agent、可信工作区和可信 IM conversation 中开启。
