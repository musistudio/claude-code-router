---
title: Agent配置
pageTitle: Agent配置
eyebrow: 详细配置
lead: 为 Claude Code、Codex、ZCode 创建可复用的启动配置，并通过不同配置打开不同的 Agent 实例。
---

## 配置流程

1. 先在 **供应商配置** 中添加至少一个可用供应商和模型，或先创建需要使用的 Fusion 模型。
2. 打开 **Agent配置**，点击 **添加配置**。
3. 选择 Agent 类型，填写配置名称，并选择作用范围和入口模式。
4. 选择模型。模型值通常是 `供应商名称/模型名称`，也可以选择 Fusion 模型。
5. 如果入口模式包含 App，可以绑定 Bot，并选择是否转发 Agent 消息或开启接力。
6. 保存后，从 Agent配置卡片打开：终端图标会复制 CLI 命令，播放图标会启动 App 实例。

试用阶段建议选择 **仅从 CCR 打开时生效**，并且总是从 CCR 打开 Agent。这样配置只影响 CCR 启动的实例，不会改掉你系统里原本直接打开的 Claude Code、Codex 或 ZCode。

## 多开机制

每个 Agent配置都有自己的 `id` 和名称。CCR 打开 Agent 时会按名称或 `id` 找到启用的配置，再根据配置生成对应的启动计划。

| 机制 | 实际行为 |
| --- | --- |
| 独立配置文件 | 选择“仅从 CCR 打开时生效”时，Claude Code 和 Codex 会写入 CCR 管理的独立配置目录，路径按配置 `id` 区分 |
| 独立启动器 | Claude Code 使用独立启动包装器，Codex 和 ZCode 使用独立中间层启动器，文件名同样按配置 `id` 或名称区分 |
| 独立 App 数据目录 | 从 App 打开时，Claude App、ChatGPT（Codex 桌面端的新名称）、ZCode App 都会使用按配置 `id` 区分的用户数据目录 |
| 运行状态 | CCR 按打开入口和配置 `id` 记录运行中的 App 实例；同一个配置再次打开会激活已有窗口，不同配置可以打开不同实例 |

这意味着你可以为同一个 Agent 建多个配置，例如“Claude Code - 工作项目”“Claude Code - 测试模型”“Codex - Fusion 图像能力”。它们可以选择不同模型、不同作用范围和不同 Bot，打开后就是不同的 Agent 实例。

## 常用选项

| 选项 | 适用范围 | 说明 |
| --- | --- | --- |
| Agent | 全部 | 选择 Claude Code、Codex 或 ZCode。ZCode 只支持 App。 |
| 配置名称 | 全部 | 用于在 CCR 中识别配置，也会作为 `ccr <配置名称>` 的打开目标。名称可以有空格，复制命令时 CCR 会自动加引号。 |
| 启用开关 | 全部 | 关闭后该配置不会出现在打开入口中，也不会被应用为有效启动配置。 |
| 作用范围 | 全部 | **仅从 CCR 打开时生效** 会使用 CCR 管理的独立配置；**系统默认** 会写入对应 Agent 的默认配置。同一个 Agent 同时只能有一个启用的系统默认配置。 |
| 入口模式 | Claude Code、Codex | `CLI & APP` 同时显示 CLI 和 App 打开入口；`CLI only` 只生成 CLI 命令；`App only` 只显示 App 打开入口。 |
| 模型 | 全部 | 该 Agent 打开后的默认模型，可以选择普通供应商模型或 Fusion 模型。Claude Code 留空表示保留 Claude Code 默认模型。 |
| Bot | App 入口 | 只有从 CCR 打开的 App 模式会转发 Bot 消息。CLI 当前不转发 Bot 消息。 |
| 环境变量 | 全部 | 为该配置注入额外环境变量。Claude Code 默认带 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`，用于启用网关模型发现。 |

## 各 Agent 的配置项

### Claude Code

| 配置项 | 作用 |
| --- | --- |
| 模型覆盖 | 写入 Claude Code 使用的 `ANTHROPIC_MODEL`。留空时不覆盖 Claude Code 自己的默认模型。 |
| 小模型 | 写入 `ANTHROPIC_SMALL_FAST_MODEL`，供 Claude Code 的轻量任务使用。留空时保留 Claude Code 默认值。 |
| 设置文件 | 系统默认模式使用 Claude Code 默认设置文件；仅从 CCR 打开时生效会在 CCR 配置目录下按 Agent配置 `id` 生成独立设置文件。 |
| 环境变量 | 会合并到 Claude Code 设置文件的 `env` 中。CCR 同时写入网关地址、API Key helper 和启动包装器。 |
| Bot | 只在 Claude App 入口生效，可选择已保存 Bot，并配置转发 Agent 消息或接力。 |

Claude Code CLI 从 CCR 打开后，会通过 CCR 网关获取模型发现信息。进入 Claude Code CLI 后可以输入 `/model` 查看并切换 CCR 暴露的模型列表，包括普通供应商模型和可见的 Fusion 模型。

Claude App 是 **零配置（zero-config）**：从 CCR 桌面 App 打开 Claude App 时，CCR 会自动写入 Claude App 网关配置、API Key、模型发现列表和独立用户数据目录。用户不需要增加额外操作，直接使用 CCR 打开就会自动完成所有必要配置；如果 Claude App 已经打开，按提示重启或从 CCR 重新打开即可。

Claude App 和 Claude Code CLI 的模型列表适配方式不同：

| 入口 | 模型列表来源 | 说明 |
| --- | --- | --- |
| Claude Code CLI | CCR 网关模型发现 | CLI 内使用 `/model` 查看列表；选择后请求仍走 CCR 的供应商、路由和 Fusion。 |
| Claude App | CCR 生成的 Claude App inference models | Claude App 需要 Claude 兼容的模型名。CCR 会把 `供应商/模型` 和 Fusion 模型映射成 Claude App 可识别的模型项，并用显示名称保留真实模型含义。 |

### Codex

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 写入 Codex 的 `model_provider`，默认是 `claude-code-router`。建议保持稳定，只使用字母、数字、点、下划线或短横线。 |
| Provider name | Codex 中展示的供应商名称，默认是 `Claude Code Router`。 |
| Codex model | 写入 Codex 默认模型。可以选择普通供应商模型或 Fusion 模型；留空时 CCR 使用可用模型中的默认值。 |
| Show all sessions | 让 Codex 显示所有会话。ZCode 不提供该项。 |
| 配置文件 | 默认是 `~/.codex/config.toml`。仅从 CCR 打开时生效会写入 CCR 管理的独立配置目录。 |
| 环境变量 | 注入 Codex CLI 或 ChatGPT。Claude Code 专用的模型发现变量不会传给 Codex。 |
| Bot | 只在 ChatGPT App 入口生效。 |

保存后，Codex CLI 使用配置卡片里的终端图标复制命令，例如 `ccr "Codex - Work"`。ChatGPT 使用播放图标打开。CCR 按照 CodexL 的启动方式，直接运行 ChatGPT App bundle 内的 Electron 可执行文件，为它设置隔离的用户数据目录，并把 `CODEX_CLI_PATH` 指向 CCR 中间层。中间层把 app-server 流量转发给 ChatGPT 内置的 Codex CLI，只适配账号展示：隔离目录已有有效 ChatGPT token 时显示真实账号；没有凭据时使用无 token、ChatGPT 形态的虚拟工作区身份，让桌面端在不保存真实用户登录的情况下仍可使用模型选择。为让原生 app-server 选择官方 API marketplace，CCR 只在进程启动阶段创建精确的 `ccr-local-profile` 引导标记，收到第一条原生响应后立即删除；正常启动后或异常退出时也会清理，不会把它保留成登录状态。其他认证文件全部保留。旧版 `Codex.app` 仍然兼容。

模型和公共插件列表不再由中间层合成。原生 Codex app-server 读取生成的 `model_catalog_json`，并原样处理 `model/list` 与公共 `plugin/list` 请求，因此 Codex 可以自行联网刷新官方公开 [`openai/plugins`](https://github.com/openai/plugins) Git marketplace。虚拟 workspace 中，只有必须使用真实 ChatGPT 鉴权的账号私有 marketplace 请求会得到明确空结果，绝不会用本地插件替代。下载后的 Git checkout 只作为 Codex 自己的常规 last-known-good 数据，CCR 不会拿它替代远端目录。

### ZCode

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 写入 ZCode 供应商引用，默认是 `claude-code-router`。 |
| Provider name | ZCode 中展示的供应商名称，默认是 `Claude Code Router`。 |
| ZCode model | ZCode App 打开后的默认模型。可以选择普通供应商模型或 Fusion 模型。 |
| 配置文件 | 默认是 `~/.zcode/cli/config.json`，CCR 还会写入 ZCode v2 配置和模型缓存。 |
| 环境变量 | 注入 ZCode App 和中间层启动器。 |
| Bot | 只在 ZCode App 入口生效。 |

ZCode 只支持 App 打开，因此入口模式固定为 `App only`，也不会显示 `Show all sessions`。

## CLI 与 App 模式区别

| 模式 | 如何打开 | 适合场景 | 主要差异 |
| --- | --- | --- | --- |
| CLI | 点击终端图标复制命令，然后在终端运行 `ccr <配置名称>` | 在项目目录中运行 Agent、需要 shell 工作流、需要把命令放进脚本 | 使用对应配置的包装器或中间层启动；通常不启动桌面窗口；当前不转发 Bot 消息。 |
| App | 点击播放图标从 CCR 桌面 App 启动 | 需要桌面窗口、多实例并存、Bot 消息转发或接力 | 每个 Agent配置使用独立用户数据目录；同一配置重复打开会激活已有窗口，不同配置可以并行打开。 |
| CLI & APP | 同一个配置同时提供 CLI 和 App 入口 | 同一套模型配置既用于终端，也用于桌面 App | 两个入口共用配置名称、模型、作用范围和环境变量，但启动方式不同。 |

## 各 Agent 的差异

### Claude Code

Claude Code CLI 配置会写入设置文件。选择“仅从 CCR 打开时生效”时，CCR 会在自己的配置目录下为这个 Agent配置生成独立设置文件，并通过独立启动包装器打开 Claude Code。

从桌面 App 打开 Claude App 时，CCR 还会为该配置准备独立用户数据目录。不同 Agent配置使用不同目录，因此可以同时打开多个 Claude App 实例。

### Codex

Codex 配置会写入 `config.toml`，并生成模型目录文件。选择“仅从 CCR 打开时生效”时，CCR 会把这些文件放在按配置 `id` 区分的目录中。

Codex 支持 CLI 和 App。CLI 会通过对应配置的启动器打开；App 会启动 ChatGPT、使用独立用户数据目录，并把当前配置中的模型和供应商信息带入 App。

### ZCode

ZCode 只支持 App 打开。CCR 会根据 ZCode home 或自定义配置文件写入 ZCode 的 CLI 配置、v2 配置和模型缓存，并在 App 启动时使用当前 Agent配置的模型、供应商和独立用户数据目录。

## 多开建议

1. 为每个需要独立运行的 Agent 实例创建一个 Agent配置。
2. 试用阶段优先选择“仅从 CCR 打开时生效”，避免影响系统默认 Agent。
3. 需要桌面窗口并存时，把入口模式设为 `App only` 或 `CLI & APP`，然后从 CCR 打开 App。
4. 如果同一个配置已经在运行，再次打开会激活已有窗口；需要第二个实例时，创建另一个 Agent配置。
