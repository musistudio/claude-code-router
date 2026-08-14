---
title: Claude Code 接入与配置
pageTitle: Claude Code
eyebrow: 详细配置
lead: "把 Claude Code（CLI 与 App）接入 CCR，让每一次请求都经过你配置的供应商、路由与 Fusion 模型。"
---

## 适用场景

Claude Code 是 Anthropic 的编码 Agent。CCR 同时支持它的两种形态：

- **Claude Code CLI**：终端 Agent。
- **Claude App**：桌面应用。

当你想让 Claude Code 走非 Anthropic 供应商、固定某个模型、运行多个独立的 Claude Code 实例，或挂载 IM 机器人时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型，再回到本页。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 本机已安装并登录 Claude Code，或准备从 CCR 打开。
3. 进入 **Agent 配置** 页面，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Claude Code**。
2. 填写 **配置名称**（例如 `Claude Code - Work`）。
3. 选择 **生效范围** 与 **入口模式**。
4. 选择 **模型**（留空则保留 Claude Code 默认模型）。
5. 按需填写各档位模型和高级设置。
6. 若入口模式包含 App 且需要使用 AgentClaw，绑定一个 **机器人**。
7. **保存**，然后从 CCR 打开 Claude Code（终端按钮打开 CLI，播放按钮打开 App）。

## 配置项详解

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Claude Code** | 在 CCR 中创建 Claude Code 启动入口。 |
| 配置名称 | 自由文本，例如 `Claude Code - Work` | 在 CCR 中标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 仅影响从 CCR 打开的 Claude Code，或作为系统默认 Claude Code 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 入口模式 | `CLI 与 APP` / `仅 CLI` / `仅 App` | “CLI 与 APP”同时提供终端命令和 App 按钮；“仅 CLI”只生成命令；“仅 App”只提供 App 入口。 |
| 模型 | 供应商模型或 Fusion 模型，例如 `Moonshot/kimi-k3` | 当前配置的默认模型。留空则保留 Claude Code 自身默认模型。 |
| Fable 模型 | 可选 | 覆盖 Fable 档位使用的模型。 |
| Opus 模型 | 可选 | 覆盖 Opus 档位使用的模型。 |
| Sonnet 模型 | 可选 | 覆盖 Sonnet 档位使用的模型。 |
| Haiku 模型 | 可选 | 覆盖小型快速档位使用的模型。 |
| 设置文件 | 路径 | 用于系统默认 Claude Code 配置。 |
| CCR 托管压缩 | 开关 | 让 CCR 为该配置托管上下文压缩（compact）。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |
| 机器人 | 选择已保存的机器人（仅 App 入口） | 把一个 AgentClaw IM 机器人绑定到 Claude App 入口；CLI 暂不转发机器人消息。 |

### 模型档位

Claude Code 会为不同档位选择模型。**模型** 字段设置默认值，**Fable / Opus / Sonnet / Haiku 模型** 字段则可单独覆盖某个档位——例如让 Opus 走更强的供应商模型，而 Haiku 走更便宜的模型。某个档位留空则由 Claude Code 自行决定。

### CLI 与 App 的模型列表

| 入口 | 模型列表来源 | 说明 |
| --- | --- | --- |
| Claude Code CLI | CCR 网关模型发现 | 在 CLI 中使用 `/model` 查看并切换 CCR 暴露的模型，包括 Fusion 模型。 |
| Claude App | CCR 模型列表 | 从 CCR 打开 Claude App 后使用当前配置的模型列表。 |

## 打开与使用

- **CLI**：点击桌面端配置卡片上的终端按钮，运行复制出的命令：
  ```text
  ccr-app "Claude Code - Work"
  ```
  CLI请执行：
  ```text
  ccr "Claude Code - Work"
  ```
  进入 Claude Code 后用 `/model` 查看并切换 CCR 暴露的模型。
- **App**：点击播放按钮，用当前配置打开 Claude App。再次打开同一配置会激活已有窗口。

## 多实例

需要不同模型、范围或机器人时，创建多个 Claude Code 配置即可。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 Claude App 后，Claude App 可以把会话接入所选 IM 通道。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 Claude Code。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了 CCR 网关（以及使用了哪个供应商/模型）。
4. 在 CLI 中运行 `/model`，确认 CCR 暴露的模型出现。

## 常见问题

- **请求没有走到 CCR**：确认配置已 **启用**，且你是从 CCR 打开 Claude Code（而非从系统直接打开）。除非范围是 **系统默认**，否则直接打开的 Claude Code 不受影响。
- **`/model` 看不到 CCR 模型**：确认已配置供应商与模型。
- **Claude App 没有应用配置**：Claude App 已在运行——从 CCR 重新打开，或按提示重启。
- **模型档位未生效**：档位只改变 Claude Code 某个内部档位使用哪个供应商模型；取值必须是 CCR 能提供的有效 `供应商/模型` 或 Fusion 模型。
