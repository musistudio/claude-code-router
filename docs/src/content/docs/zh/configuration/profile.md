---
title: Agent 配置档案
pageTitle: Agent 配置档案
eyebrow: 详细配置
lead: 为 Claude Code、Codex、Grok CLI、Kimi CLI、ZCode 创建可复用的启动配置，并通过不同配置打开不同的 Agent 实例。
---

## 配置流程

1. 先在 **供应商配置** 中添加至少一个可用供应商和模型，或先创建需要使用的 Fusion 模型。
2. 打开 **Agent 配置档案**，点击 **添加配置**。
3. 选择 Agent 类型，填写配置名称，并选择作用范围和入口模式。
4. 选择模型。模型值通常是 `供应商名称/模型名称`，也可以选择 Fusion 模型。
5. 如果入口模式包含 App，可以绑定 Bot，并选择是否转发 Agent 消息或开启接力。
6. 保存后，从 Agent 配置档案卡片打开：终端图标会复制 CLI 命令，播放图标会启动 App 实例。

试用阶段建议选择 **仅从 CCR 打开时生效**，并且总是从 CCR 打开 Agent。这样配置只影响 CCR 启动的实例，不会改掉你系统里原本直接打开的 Claude Code、Codex、Grok CLI、Kimi CLI 或 ZCode。

## 多开机制

每个 Agent 配置档案都有自己的 `id` 和名称。CCR 打开 Agent 时会按名称或 `id` 找到启用的配置，再根据配置生成对应的启动计划。

| 机制 | 实际行为 |
| --- | --- |
| 独立配置文件 | 选择“仅从 CCR 打开时生效”时，Claude Code 和 Codex 会写入 CCR 管理的独立配置目录，路径按配置 `id` 区分 |
| 独立启动器 | Claude Code、Grok CLI 和 Kimi CLI 使用独立启动包装器，Codex 和 ZCode 使用独立中间层启动器，文件名同样按配置 `id` 或名称区分 |
| 独立 App 数据目录 | 从 App 打开时，Claude App、ChatGPT（Codex 桌面端的新名称）、ZCode App 都会使用按配置 `id` 区分的用户数据目录 |
| 运行状态 | CCR 按打开入口和配置 `id` 记录运行中的 App 实例；同一个配置再次打开会激活已有窗口，不同配置可以打开不同实例 |

这意味着你可以为同一个 Agent 建多个配置，例如“Claude Code - 工作项目”“Claude Code - 测试模型”“Codex - Fusion 图像能力”。它们可以选择不同模型、不同作用范围和不同 Bot，打开后就是不同的 Agent 实例。

## 常用选项

| 选项 | 适用范围 | 说明 |
| --- | --- | --- |
| Agent | 全部 | 选择 Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI 或 ZCode。Grok CLI 和 Kimi CLI 只支持 CLI，ZCode 只支持 App。 |
| 配置名称 | 全部 | 用于在 CCR 中识别配置，也会作为 `ccr-app <配置名称>` 的打开目标。名称可以有空格，复制命令时 CCR 会自动加引号。 |
| 启用开关 | 全部 | 关闭后该配置不会出现在打开入口中，也不会被应用为有效启动配置。 |
| 作用范围 | 全部 | **仅从 CCR 打开时生效** 会使用 CCR 管理的独立配置；**系统默认** 会写入对应 Agent 的默认配置。同一个 Agent 同时只能有一个启用的系统默认配置。 |
| 入口模式 | Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI | `CLI & APP` 同时显示 CLI 和 App 打开入口；`CLI only` 只生成 CLI 命令；`App only` 只显示 App 打开入口。Grok CLI 和 Kimi CLI 固定为 `CLI only`。 |
| 模型 | 全部 | 该 Agent 打开后的默认模型，可以选择普通供应商模型或 Fusion 模型。Claude Code 留空表示保留 Claude Code 默认模型。 |
| 可用模型 | Kimi CLI | Kimi `/model` 命令中可切换的模型；默认模型始终包含在内。 |
| Bot | App 入口 | 只有从 CCR 打开的 App 模式会转发 Bot 消息。CLI 当前不转发 Bot 消息。 |
| 环境变量 | 全部 | 为该配置注入额外环境变量。Claude Code 默认带 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`，用于启用网关模型发现。 |

## 各 Agent 的配置项

### Claude Code

| 配置项 | 作用 |
| --- | --- |
| 模型覆盖 | 写入 Claude Code 使用的 `ANTHROPIC_MODEL`。留空时不覆盖 Claude Code 自己的默认模型。 |
| 小模型 | 写入 `ANTHROPIC_SMALL_FAST_MODEL`，供 Claude Code 的轻量任务使用。留空时保留 Claude Code 默认值。 |
| 设置文件 | 系统默认模式使用 Claude Code 默认设置文件；仅从 CCR 打开时生效会在 CCR 配置目录下按 Agent 配置档案 `id` 生成独立设置文件。 |
| 环境变量 | 会合并到 Claude Code 设置文件的 `env` 中。CCR 同时写入网关地址、API Key helper 和启动包装器。 |
| Bot | 只在 Claude App 入口生效，可选择已保存 Bot，并配置转发 Agent 消息或接力。 |

Claude Code CLI 从 CCR 打开后，会通过 CCR 网关获取模型发现信息。进入 Claude Code CLI 后可以输入 `/model` 查看并切换 CCR 暴露的模型列表，包括普通供应商模型和可见的 Fusion 模型。

Claude App 是 **零配置（zero-config）**：从 CCR 桌面 App 打开 Claude App 时，CCR 会自动写入 Claude App 网关配置、API Key、模型发现列表和独立用户数据目录。用户不需要增加额外操作，直接使用 CCR 打开就会自动完成所有必要配置；如果 Claude App 已经打开，按提示重启或从 CCR 重新打开即可。

Claude App 和 Claude Code CLI 的模型列表适配方式不同：

| 入口 | 模型列表来源 | 说明 |
| --- | --- | --- |
| Claude Code CLI | CCR 网关模型发现 | CLI 内使用 `/model` 查看列表；选择后请求仍走 CCR 的供应商、路由和 Fusion。 |
| Claude App | CCR 生成的 Claude App inference models | Claude App 需要 Claude 兼容的模型名。CCR 会把 `供应商/模型` 和 Fusion 模型映射成 Claude App 可识别的模型项，并用显示名称保留真实模型含义。 |

### OpenCode

| 配置项 | 作用 |
| --- | --- |
| Provider ID | 写入 OpenCode 的供应商引用，默认是 `claude-code-router`。 |
| Provider name | OpenCode 中展示的供应商名称，默认是 `Claude Code Router`。 |
| OpenCode model | OpenCode CLI 和 App 的默认模型，可以选择普通供应商模型或 Fusion 模型。 |
| 配置文件 | 系统默认模式使用 OpenCode 默认配置；仅从 CCR 打开时生效会在 CCR 配置目录下写入配置专属文件。 |
| 环境变量 | 注入 OpenCode CLI、OpenCode App 以及对应的 Bot worker。 |
| Bot | 在从 CCR 打开的 OpenCode App 入口生效。收到 Bot 消息后会通过 OpenCode CLI 执行，并把回复发回同一个 Bot 会话。 |

CCR 会为 OpenCode App 启动一个配套 Bot worker，并为每个 Bot conversation 分别保存 Project 与可选 Session。先用 `/project list|current|use` 选择 Agent Project，再用 `/session list|current|new|use|reset` 管理该 Project 下的 Agent Session。切换 Project 会清除原 Session，其他 Project 的 Session 无法被选中。Bot 只拦截这两个 slash 命令域；已移除的 `/task` 和旧平铺命令不再兼容。

CCR Desktop 进程环境中必须能够执行 `opencode`。如果 CLI 安装在其他位置，可以在 Agent 配置档案环境变量中设置 `CCR_OPENCODE_BIN`。Bot session 默认使用全新 OpenCode Desktop 工作区对应的文件系统根目录；如果 App 当前打开了其他项目，应通过 `CCR_OPENCODE_BOT_CWD` 设置同一个项目目录。CCR 会把该目录显式传给 `opencode run --dir`，使新 session 出现在 App 对应的项目下。默认不会自动批准权限；只有在可信环境中才应设置 `CCR_OPENCODE_BOT_AUTO_APPROVE=true`，因为它会启用 OpenCode 的高风险 `--auto` 模式。

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

保存后，Codex CLI 使用配置卡片里的终端图标复制命令，例如 `ccr-app "Codex - Work"`。ChatGPT 使用播放图标打开。CCR 按照 CodexL 的启动方式，直接运行 ChatGPT App bundle 内的 Electron 可执行文件，为它设置隔离的用户数据目录，并把 `CODEX_CLI_PATH` 指向 CCR 中间层。中间层把 app-server 流量转发给 ChatGPT 内置的 Codex CLI，只适配账号展示：每个配置只从自己的 Codex Home 读取 ChatGPT 登录状态；没有凭据时返回本地非 OpenAI 兼容身份，避免新版 ChatGPT 进入循环鉴权和 attestation。共享登录改为显式启用：只有设置 `CCR_CODEX_CHATGPT_AUTH_FILE`（或兼容变量 `CODEXL_CODEX_CHATGPT_AUTH_FILE`）并指向有效 `auth.json` 时，配置才会在内存中桥接该 token，且不会复制认证文件。为让原生 app-server 选择官方 API marketplace，CCR 只在进程启动阶段创建精确的 `ccr-local-profile` 引导标记，收到第一条原生响应后立即删除；正常启动后或异常退出时也会清理，不会把它保留成登录状态。其他认证文件全部保留。旧版 `Codex.app` 仍然兼容。

模型和公共插件列表不再由中间层合成。原生 Codex app-server 读取生成的 `model_catalog_json`，并原样处理 `model/list` 与公共 `plugin/list` 请求，因此 Codex 可以自行联网刷新官方公开 [`openai/plugins`](https://github.com/openai/plugins) Git marketplace。虚拟 workspace 中，只有必须使用真实 ChatGPT 鉴权的账号私有 marketplace 请求会得到明确空结果，绝不会用本地插件替代。下载后的 Git checkout 只作为 Codex 自己的常规 last-known-good 数据，CCR 不会拿它替代远端目录。

### Grok CLI

Grok CLI 配置固定为 **仅从 CCR 打开时生效** 和 **CLI only**。保存后复制并运行配置卡片上的命令，例如 `ccr-app "Grok - Work"`。

生成的包装器会把 Grok 的模型网关和模型列表地址指向 CCR 的 `/v1`，注入该配置专属的 CCR API Key，并把选中的 CCR 模型设为默认模型。如果 CCR Desktop 网关尚未运行，`ccr-app` 会为 Grok 会话启动一个可共享的临时服务，并在最后一个会话退出后清理。Grok CLI 没有单独指定用户配置文件的选项，因此 CCR 会把 `GROK_HOME` 指向配置专属目录；其中的 `config.toml` 初始复制自用户配置，之后可以独立修改，不会回写原文件，同时隔离 `auth.json`，避免本机 xAI OAuth token 覆盖 CCR Key。插件、技能和会话目录仍与原 Grok home 共享。进入 Grok CLI 后可以使用 `/model` 切换 CCR 返回的普通供应商模型或 Fusion 模型，切换后的请求仍然经过 CCR。

### Kimi CLI

Kimi CLI 配置固定为 **仅从 CCR 打开时生效** 和 **CLI only**。请选择一个默认模型以及一个或多个可用模型。生成的包装器会把 `KIMI_CODE_HOME` 指向配置专属目录，其中的 `config.toml` 定义私有的 OpenAI 兼容 CCR 供应商，并为每个选中模型生成模型项，因此可在 Kimi 内使用 `/model` 切换且不会绕过 CCR。CCR 会保留来源配置中的非供应商设置，并复用可用的会话、技能、插件、MCP 配置和凭据，不会改写原始 `~/.kimi-code/config.toml`。CCR Desktop 未运行时，启动器会创建共享的临时网关，并在最后一个受管 Kimi 会话退出后停止。

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
| CLI | 点击终端图标复制命令，然后在终端运行 `ccr-app <配置名称>` | 在项目目录中运行 Agent、需要 shell 工作流、需要把命令放进脚本 | 使用对应配置的包装器或中间层启动；通常不启动桌面窗口；当前不转发 Bot 消息。 |
| App | 点击播放图标从 CCR 桌面 App 启动 | 需要桌面窗口、Bot 消息转发或接力 | 同一配置重复打开会激活已有窗口。是否支持多开取决于 Agent；OpenCode Desktop 是单实例应用，切换 OpenCode 配置时 CCR 会先停止其管理的旧实例。 |
| CLI & APP | 同一个配置同时提供 CLI 和 App 入口 | 同一套模型配置既用于终端，也用于桌面 App | 两个入口共用配置名称、模型、作用范围和环境变量，但启动方式不同。 |

## 各 Agent 的差异

### Claude Code

Claude Code CLI 配置会写入设置文件。选择“仅从 CCR 打开时生效”时，CCR 会在自己的配置目录下为这个 Agent 配置档案生成独立设置文件，并通过独立启动包装器打开 Claude Code。

从桌面 App 打开 Claude App 时，CCR 还会为该配置准备独立用户数据目录。不同 Agent 配置档案使用不同目录，因此可以同时打开多个 Claude App 实例。

绑定 Bot 后，Claude App 的伴生 worker 会把 Project/Session、流式回复、附件、会话用量和原生权限/Ask User 请求接入 IM；App 退出时 worker 同步停止。

### Codex

Codex 配置会写入 `config.toml`，并生成模型目录文件。选择“仅从 CCR 打开时生效”时，CCR 会把这些文件放在按配置 `id` 区分的目录中。

Codex 支持 CLI 和 App。CLI 会通过对应配置的启动器打开；App 会启动 ChatGPT、使用独立用户数据目录，并把当前配置中的模型和供应商信息带入 App。

绑定 Bot 后，Codex App 的伴生 worker 使用 Codex 原生 rollout Session，实现 Project/Session 浏览、续接、队列、取消、模型设置、用量、附件和诊断。该 worker 只随受管 App 存活。

### OpenCode

OpenCode 配置会写入 JSON/JSONC 文件，把当前选择的供应商和模型路由到 CCR。CLI 通过配置专属包装器启动；App 使用相同的有效配置启动已安装的 OpenCode Desktop。

选择 Bot 并从 CCR 打开 App 后，CCR 会启动配套 worker，通过 OpenCode 原生 Session 处理收到的 Bot 消息，并提供与其他 App 一致的 Project/Session、队列、媒体、设置和诊断合同。受管 OpenCode App 退出或切换配置时，该 worker 也会同步停止。

### Grok CLI

Grok CLI 只支持 CLI。CCR 通过配置专属包装器启动它，注入 CCR 模型网关、模型发现地址、API Key 和默认模型，并通过不含 xAI OAuth 凭据的配置专属 Grok home 保证推理使用 CCR Key；用户原有的 Grok home 不会被改写。

### Kimi CLI

Kimi CLI 只支持 CLI。CCR 通过配置专属包装器和生成的 Kimi home 启动它，其中包含默认模型和所有选中的可用模型。每个模型项都使用 CCR 网关和配置专属 API Key，因此 `/model` 切换后仍经过 CCR；用户原有的 Kimi 配置不会被改写。

### ZCode

ZCode 只支持 App 打开。CCR 会根据 ZCode home 或自定义配置文件写入 ZCode 的 CLI 配置、v2 配置和模型缓存，并在 App 启动时使用当前 Agent 配置档案的模型、供应商和独立用户数据目录。

绑定 Bot 后，ZCode 使用与 Codex 同类的 App 伴生 worker 和原生 Session 扫描；ZCode App 关闭时接力立即离线。

## 多开建议

1. 为每个需要独立运行的 Agent 实例创建一个 Agent 配置档案。
2. 试用阶段优先选择“仅从 CCR 打开时生效”，避免影响系统默认 Agent。
3. 需要桌面窗口并存时，把入口模式设为 `App only` 或 `CLI & APP`，然后从 CCR 打开 App。
4. 如果同一个配置已经在运行，再次打开会激活已有窗口；需要第二个实例时，创建另一个 Agent 配置档案。
