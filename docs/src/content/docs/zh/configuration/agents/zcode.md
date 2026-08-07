---
title: ZCode 接入与配置
pageTitle: ZCode
eyebrow: 详细配置
lead: "把 ZCode 接入 CCR。ZCode 在 CCR 中仅支持 App。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

ZCode 是一款以桌面应用形态运行的编码 Agent。在 CCR 中它 **仅支持 App**：CCR 写入 ZCode 的 CLI 配置、v2 配置与模型缓存，然后用该配置的模型、供应商和独立的用户数据目录启动 App。

当你想让 ZCode 走任意 CCR 供应商或 Fusion 模型，或挂载 IM 机器人时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 本机已安装并登录 ZCode 桌面应用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 ZCode

保存一个 ZCode 配置时，CCR 会：

- 写入 ZCode 的 **CLI 配置**（默认 `~/.zcode/cli/config.json`），以及 ZCode v2 配置和模型缓存，基于 ZCode home 或你指定的自定义配置文件。
- 生成 **中间件启动器**，设置 `ZCODE_HOME`/`ZCODE_STORAGE_DIR`、供应商、模型与模型目录，再交给 App。
- 用当前配置的模型、供应商和独立的用户数据目录启动 App。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **ZCode**。
2. 填写 **配置名称**（例如 `ZCode - Work`）。
3. 确认 **供应商 ID**、**供应商名称** 与 **ZCode 模型**。
4. 按需调整 **配置文件** 与环境变量。
5. 如需使用 AgentClaw，绑定一个 **机器人**。
6. **保存**，然后用播放按钮从 CCR 打开 ZCode。

## 配置项详解

ZCode 固定为 **仅 App**，入口模式不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **ZCode** | 让 CCR 写入 ZCode 配置并启动 App。 |
| 配置名称 | 自由文本，例如 `ZCode - Work` | 标识该配置，并用于 `ccr-app "<名称>" app`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 隔离的 CCR 受管配置 vs. 真实的 ZCode home 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 供应商 ID | 默认 `claude-code-router` | CCR 写入 ZCode 配置的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 ZCode 中显示的名称。 |
| ZCode 模型 | 供应商模型或 Fusion 模型 | ZCode App 打开时的默认模型。 |
| 配置文件 | 路径，默认 `~/.zcode/cli/config.json` | CCR 还会同时写入 ZCode v2 配置与模型缓存。 |
| 环境变量 | 键值对 | 注入 ZCode App 与中间件启动器。 |
| 机器人 | 选择已保存的机器人 | 把一个 AgentClaw IM 机器人绑定到 ZCode App 入口。 |

> ZCode 不暴露 **显示全部会话** 与 **CCR 托管压缩**。

## 环境变量

- 任意键值对都会注入 ZCode App 与中间件启动器。
- CCR 自行管理的变量（`ZCODE_HOME`、`ZCODE_STORAGE_DIR`、各 `CCR_ZCODE_*` 与 `CODEXL_ZCODE_*` 变量、`CCR_PROFILE_SURFACE`）均为保留项——手动设置无效。

## 打开与使用

点击配置卡片上的播放按钮，用该配置的模型、供应商和独立用户数据目录打开 ZCode。再次打开同一配置会激活已有窗口。

你也可以从卡片复制 App 命令：

```text
ccr-app "ZCode - Work" app
```

## 多实例

每个配置都有独立的 `id` 和独立的用户数据目录，因此多个 ZCode 配置可同时运行，使用不同的模型或供应商。

## AgentClaw（机器人）

绑定机器人并从 CCR 打开 ZCode 后，Codex 兼容的伴随工作进程会暴露原生会话发现、项目/会话浏览与续接、排队、取消、模型设置、用量、附件与诊断。关闭 ZCode App 会立即让中继下线。完整 IM 设置见 [AgentClaw](/agentclaw/)。

## 验证

1. 从 CCR 打开 ZCode。
2. 发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR 打开 ZCode；若已在运行，请从 CCR 重新打开。
- **App 中模型不对**：检查 **ZCode 模型** 字段。
- **中继（机器人）下线**：ZCode App 必须保持打开——关闭它会立即让中继下线。
