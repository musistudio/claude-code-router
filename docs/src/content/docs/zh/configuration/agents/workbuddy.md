---
title: WorkBuddy 接入与配置
pageTitle: WorkBuddy
eyebrow: 详细配置
lead: "把 WorkBuddy 接入 CCR。WorkBuddy 在 CCR 中仅支持 App。"
---

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 本机已安装 WorkBuddy。如果 CCR 无法自动找到它，请在 **APP_PATH** 中填写 WorkBuddy 可执行文件路径。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **WorkBuddy**。
2. 填写 **配置名称**（例如 `WorkBuddy - Work`）。
3. 确认 **供应商 ID**、**供应商名称** 与 **WorkBuddy 模型**。
4. 按需限制 **允许模型列表**。留空表示 WorkBuddy 可使用全部 CCR 模型。
5. 只有自动探测不到 WorkBuddy 时才填写 **APP_PATH**。
6. 如需使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后用播放按钮从 CCR 打开 WorkBuddy。

## 配置项详解

WorkBuddy 固定为 **仅 App**，入口模式不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **WorkBuddy** | 在 CCR 中创建 WorkBuddy App 启动入口。 |
| 配置名称 | 自由文本，例如 `WorkBuddy - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>" app`，CLI 命令使用 `ccr "<名称>" app`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 仅影响从 CCR 打开的 WorkBuddy，或作为系统默认 WorkBuddy 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 供应商 ID | 默认 `claude-code-router` | 当前 WorkBuddy 配置使用的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 生成配置中使用的显示名称。 |
| WorkBuddy 模型 | 供应商模型或 Fusion 模型 | WorkBuddy App 打开时的默认模型。 |
| 允许模型列表 | 可选多选 | 控制 WorkBuddy 中可见的 CCR 模型。留空表示全部模型。 |
| APP_PATH | 可选可执行文件路径 | 覆盖 App 自动探测。WorkBuddy 安装在自定义位置时使用。 |
| 配置文件 | 路径 | 用于系统默认 WorkBuddy 配置。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |
| 机器人 | 选择已保存的机器人 | 把一个 AgentClaw IM 机器人绑定到 WorkBuddy App 入口。 |

## 模型列表行为

WorkBuddy 的模型设置会跟随 **允许模型列表**：

- **允许模型列表** 有选择时，只写入这些模型。
- **允许模型列表** 留空时，WorkBuddy 可使用全部 CCR 模型。
- 当前选择的 **WorkBuddy 模型** 会作为默认模型。

修改供应商或模型列表后，请从 CCR 重新打开 WorkBuddy。如果 WorkBuddy 的设置窗口已经打开，请关闭并重新打开该窗口刷新列表。

## 打开与使用

点击配置卡片上的播放按钮，用该配置的模型、供应商和模型列表打开 WorkBuddy。再次打开同一配置会激活已有窗口。

桌面端配置卡片复制出的 App 命令：

```text
ccr-app "WorkBuddy - Work" app
```

CLI请执行：

```text
ccr "WorkBuddy - Work" app
```

## 多实例

需要不同模型列表或供应商时，创建多个 WorkBuddy 配置即可。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 WorkBuddy 后，WorkBuddy 可以把会话接入所选 IM 通道。关闭 WorkBuddy 会让中继下线。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 WorkBuddy。
2. 打开 WorkBuddy 的 **Models** 设置，确认模型列表符合预期。
3. 发送一条消息，确认能正常回复。
4. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **只显示一个模型**：重新应用 WorkBuddy 配置，并从 CCR 重新打开 WorkBuddy。**允许模型列表** 留空表示 WorkBuddy 可使用全部 CCR 模型。
- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 WorkBuddy；若已在运行，请从 CCR 重新打开。
- **App 中模型不对**：检查 **WorkBuddy 模型** 字段，以及 WorkBuddy 设置里的模型列表。
- **找不到 WorkBuddy**：在 **APP_PATH** 中填写 WorkBuddy 可执行文件路径。
