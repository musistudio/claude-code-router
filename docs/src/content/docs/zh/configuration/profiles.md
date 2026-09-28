---
title: Agent 配置
pageTitle: Agent 配置
eyebrow: 详细配置
lead: 为 Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI、ZCode 和 WorkBuddy 创建可复用的启动配置（Agent 配置），并用不同配置打开相互独立的 Agent 实例。需要多开 Agent 或为不同用途固定不同模型时使用本页。
---

> 若需要某个 Agent 的逐字段详细接入指南，可在侧边栏 **Agent 配置** 下打开对应页面，例如 [Claude Code](/configuration/agents/claude-code/)、[Codex](/configuration/agents/codex/) 或 [Grok CLI](/configuration/agents/grok/)。

## 配置流程

1. 先在 **供应商配置** 中添加至少一个可用供应商和模型，或先创建需要使用的 Fusion 模型。
2. 打开 **Agent 配置**，点击 **添加配置**。
3. 选择 Agent 类型，填写配置名称，并选择作用范围和入口模式。
4. 选择模型。模型值通常是 `供应商名称/模型名称`，也可以选择 Fusion 模型。
5. 如果入口模式包含 App，可以绑定 AgentClaw 使用的 Bot，并选择是否转发 Agent 消息或开启接力。
6. 保存后，从 Agent 配置卡片打开：终端图标会复制 CLI 命令，播放图标会启动 App 实例。

试用阶段建议选择 **仅从 CCR 打开时生效**，并且总是从 CCR 打开 Agent。这样配置只影响 CCR 启动的实例，不会改掉你系统里原本直接打开的 Claude Code、Codex、Grok CLI、Kimi CLI、ZCode 或 WorkBuddy。

## 多开

每个 Agent 配置都是一个独立启动配置。需要为同一个 Agent 使用不同模型、作用范围、Bot 或桌面窗口时，创建多个配置即可。某些 Agent 只支持单个 App 窗口，重复打开同一配置时会激活已有窗口。

## 常用选项

| 选项 | 适用范围 | 说明 |
| --- | --- | --- |
| Agent | 全部 | 选择 Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI、ZCode 或 WorkBuddy。Grok CLI 和 Kimi CLI 只支持 CLI，ZCode 和 WorkBuddy 只支持 App。 |
| 配置名称 | 全部 | 用于在 CCR 中识别配置。桌面端命令使用 `ccr-app <配置名称>`，CLI 命令使用 `ccr <配置名称>`。名称可以有空格，复制命令时 CCR 会自动加引号。 |
| 启用开关 | 全部 | 关闭后该配置不会出现在打开入口中，也不会被应用为有效启动配置。 |
| 作用范围 | 全部 | **仅从 CCR 打开时生效** 只影响从 CCR 打开的 Agent；**系统默认** 也会影响你直接打开的 Agent。同一个 Agent 同时只能有一个启用的系统默认配置。 |
| 入口模式 | Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI | `CLI & APP` 同时显示 CLI 和 App 打开入口；`CLI only` 只生成 CLI 命令；`App only` 只显示 App 打开入口。Grok CLI 和 Kimi CLI 固定为 `CLI only`；ZCode 和 WorkBuddy 固定为 `App only`。 |
| 模型 | 全部 | 该 Agent 打开后的默认模型，可以选择普通供应商模型或 Fusion 模型。Claude Code 留空表示保留 Claude Code 默认模型。 |
| 可用模型 | Kimi CLI | Kimi `/model` 命令中可切换的模型；默认模型始终包含在内。 |
| Bot | App 入口 | AgentClaw 的 IM 接入口。只有从 CCR 打开的 App 模式会转发 Bot 消息；CLI 当前不转发 Bot 消息。详细步骤见 [AgentClaw](/agentclaw/)。 |
| 环境变量 | 全部 | 可选高级设置；普通使用保持为空。 |

## 各 Agent 的配置项

### Claude Code

| 配置项 | 作用 |
| --- | --- |
| 模型覆盖 | 当前配置的默认模型。留空时保留 Claude Code 自己的默认模型。 |
| 小模型 | Claude Code 轻量任务使用的可选模型。留空时保留 Claude Code 默认值。 |
| 设置文件 | 用于系统默认 Claude Code 配置。 |
| 环境变量 | 可选高级设置；普通使用保持为空。 |
| Bot | 只在 Claude App 入口生效，可选择已保存 Bot，并配置 AgentClaw 的消息转发或接力。 |

Claude Code CLI 从 CCR 打开后，会通过 CCR 网关获取模型发现信息。进入 Claude Code CLI 后可以输入 `/model` 查看并切换 CCR 暴露的模型列表，包括普通供应商模型和可见的 Fusion 模型。

如果 Claude App 已经打开，按提示重启或从 CCR 重新打开即可。

Claude App 和 Claude Code CLI 的模型列表适配方式不同：

| 入口 | 模型列表来源 | 说明 |
| --- | --- | --- |
| Claude Code CLI | CCR 网关模型发现 | CLI 内使用 `/model` 查看列表；选择后请求仍走 CCR 的供应商、路由和 Fusion。 |
| Claude App | CCR 模型列表 | 从 CCR 打开 Claude App 后使用当前配置的模型列表。 |

### OpenCode

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 当前 OpenCode 配置使用的供应商引用，默认是 `claude-code-router`。 |
| Provider name | OpenCode 中展示的供应商名称，默认是 `Claude Code Router`。 |
| OpenCode model | OpenCode CLI 和 App 的默认模型，可以选择普通供应商模型或 Fusion 模型。 |
| 配置文件 | 用于系统默认 OpenCode 配置。 |
| 环境变量 | 可选高级设置；普通使用保持为空。 |
| Bot | 在从 CCR 打开的 OpenCode App 入口生效。 |

绑定 Bot 后，OpenCode 可以把会话接入所选 IM 通道。

### Codex

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 当前 Codex 配置使用的供应商引用。建议保持稳定，只使用字母、数字、点、下划线或短横线。 |
| Provider name | Codex 中展示的供应商名称，默认是 `Claude Code Router`。 |
| Codex model | 写入 Codex 默认模型。可以选择普通供应商模型或 Fusion 模型；留空时 CCR 使用可用模型中的默认值。 |
| Show all sessions | 让 Codex 显示所有会话。 |
| 配置文件 | 用于系统默认 Codex 配置。 |
| 环境变量 | 可选高级设置；普通使用保持为空。 |
| Bot | 只在 ChatGPT App 入口生效。 |

保存后，Codex CLI 在桌面端可用配置卡片里的终端图标复制命令，例如 `ccr-app "Codex - Work"`；CLI请执行：`ccr "Codex - Work"`。ChatGPT 使用播放图标打开。

### Grok CLI

Grok CLI 配置固定为 **仅从 CCR 打开时生效** 和 **CLI only**。保存后运行配置命令：桌面端是 `ccr-app "Grok - Work"`，CLI 是 `ccr "Grok - Work"`。进入 Grok CLI 后可以使用 `/model` 切换 CCR 返回的普通供应商模型或 Fusion 模型。

### Kimi CLI

Kimi CLI 配置固定为 **仅从 CCR 打开时生效** 和 **CLI only**。请选择一个默认模型以及一个或多个可用模型。Kimi 的 `/model` 可以在你选择的模型之间切换。

### ZCode

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 当前 ZCode 配置使用的供应商引用，默认是 `claude-code-router`。 |
| Provider name | ZCode 中展示的供应商名称，默认是 `Claude Code Router`。 |
| ZCode model | ZCode App 打开后的默认模型。可以选择普通供应商模型或 Fusion 模型。 |
| 配置文件 | 用于系统默认 ZCode 配置。 |
| 环境变量 | 可选高级设置；普通使用保持为空。 |
| Bot | 只在 ZCode App 入口生效。 |

ZCode 只支持 App 打开，因此入口模式固定为 `App only`，也不会显示 `Show all sessions`。

### WorkBuddy

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 当前 WorkBuddy 配置使用的供应商引用，默认是 `claude-code-router`。 |
| Provider name | 生成配置中使用的显示名称，默认是 `Claude Code Router`。 |
| WorkBuddy model | WorkBuddy App 打开后的默认模型。可以选择普通供应商模型或 Fusion 模型。 |
| 允许模型列表 | WorkBuddy 中可见的模型；留空表示全部 CCR 模型。 |
| APP_PATH | 自动探测不到 App 时填写 WorkBuddy 可执行文件路径。 |
| 配置文件 | 用于系统默认 WorkBuddy 配置。 |
| 环境变量 | 可选高级设置；普通使用保持为空。 |
| Bot | 只在 WorkBuddy App 入口生效。 |

WorkBuddy 只支持 App 打开，因此入口模式固定为 `App only`。

## CLI 与 App 模式区别

| 模式 | 如何打开 | 适合场景 | 主要差异 |
| --- | --- | --- | --- |
| CLI | 桌面端：点击终端图标并运行 `ccr-app <配置名称>`；CLI：运行 `ccr <配置名称>` | 在项目目录中运行 Agent、需要 shell 工作流、需要把命令放进脚本 | 在终端打开当前配置；当前不转发 Bot 消息。 |
| App | 点击播放图标从 CCR 桌面 App 启动 | 需要桌面窗口、Bot 消息转发或接力 | 同一配置重复打开会激活已有窗口。是否支持多开取决于 Agent；OpenCode Desktop 是单实例应用，切换 OpenCode 配置时 CCR 会先停止其管理的旧实例。 |
| CLI & APP | 同一个配置同时提供 CLI 和 App 入口 | 同一套模型配置既用于终端，也用于桌面 App | 两个入口共用配置名称、模型、作用范围和环境变量，但启动方式不同。 |

## 各 Agent 的差异

### Claude Code

Claude Code 支持 CLI 和 App。需要不同模型、作用范围或 Bot 时，创建多个配置即可。

绑定 Bot 后，Claude App 可以把会话接入所选 IM 通道。

### Codex

Codex 支持 CLI 和 App。终端按钮打开 Codex CLI，播放按钮打开 ChatGPT。

绑定 Bot 后，ChatGPT 可以把会话接入所选 IM 通道。

### OpenCode

OpenCode 支持 CLI 和 App。OpenCode Desktop 是单实例应用，请从 CCR 切换配置，而不是再启动一个 App。

绑定 Bot 后，OpenCode 可以把会话接入所选 IM 通道。

### Grok CLI

Grok CLI 只支持 CLI。进入 Grok CLI 后可用 `/model` 切换 CCR 模型。

### Kimi CLI

Kimi CLI 只支持 CLI。请选择一个默认模型，并按需添加 `/model` 中可切换的模型。

### ZCode

ZCode 只支持 App 打开。使用播放按钮打开。

绑定 Bot 后，ZCode 可以把会话接入所选 IM 通道；ZCode App 关闭时接力立即离线。

### WorkBuddy

WorkBuddy 只支持 App 打开。使用播放按钮打开。

绑定 Bot 后，WorkBuddy 可以把会话接入所选 IM 通道；WorkBuddy 关闭时接力离线。

## 多开建议

1. 为每个需要独立运行的 Agent 实例创建一个 Agent 配置。
2. 试用阶段优先选择“仅从 CCR 打开时生效”，避免影响系统默认 Agent。
3. 需要桌面窗口并存时，把入口模式设为 `App only` 或 `CLI & APP`，然后从 CCR 打开 App。
4. 如果同一个配置已经在运行，再次打开会激活已有窗口；需要第二个实例时，创建另一个 Agent 配置。
