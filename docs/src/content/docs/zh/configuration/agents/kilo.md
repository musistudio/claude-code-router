---
title: Kilo Code 接入与配置
pageTitle: Kilo Code
eyebrow: 详细配置
lead: "把 Kilo Code 接入 CCR。Kilo Code 在 CCR 中仅支持 CLI。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

Kilo Code 是一款采用 OpenAI 兼容供应商模型的编码 Agent。在 CCR 中它 **仅支持 CLI**：CCR 在 Kilo 的 JSONC 配置中写入受管网关供应商，并通过包装器把 Kilo 指向 CCR。

当你想让 Kilo Code 走任意 CCR 供应商或 Fusion 模型时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Kilo Code（`PATH` 中可用 `kilo`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 Kilo Code

保存一个 Kilo Code 配置时，CCR 会：

- 在 Kilo 的 **配置文件**（`kilo.jsonc`）中写入受管网关供应商，把 Kilo 指向 CCR 网关，并使用该配置的 Token 与所选模型。
- 生成启动 **包装器**，把 `KILO_CONFIG`（以及内联的 `KILO_CONFIG_CONTENT`）指向受管配置，再启动 Kilo。

选择 **仅从 CCR 打开时生效** 时，配置落在按配置 `id` 隔离的 CCR 受管目录中。选择 **系统默认** 时，CCR 写入真实的 `~/.config/kilo/kilo.jsonc`。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Kilo Code**。
2. 填写 **配置名称**（例如 `Kilo - Work`）。
3. 选择 **生效范围**。
4. 确认 **供应商 ID**、**供应商名称** 与 **Kilo 模型**。
5. 按需调整 **配置文件** 与环境变量。
6. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Kilo Code 固定为 **仅 CLI**，入口模式不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Kilo Code** | 让 CCR 写入 Kilo 网关配置与包装器。 |
| 配置名称 | 自由文本，例如 `Kilo - Work` | 标识该配置，并用于 `ccr-app "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 隔离的 CCR 受管配置 vs. 真实的 `~/.config/kilo/kilo.jsonc`。同一 Agent 只允许一个启用的系统默认配置。 |
| 供应商 ID | 默认 `claude-code-router` | CCR 写入 Kilo 配置的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 Kilo 中显示的名称。 |
| Kilo 模型 | 供应商模型或 Fusion 模型 | Kilo 通过 CCR 使用的默认模型。 |
| 配置文件 | 路径，默认 `~/.config/kilo/kilo.jsonc` | 在“系统默认”范围下使用；“仅从 CCR 打开”写入 CCR 受管目录。 |
| 环境变量 | 键值对 | 导出到包装器，见下文。 |

> Kilo Code 不暴露 **显示全部会话**，该项被强制关闭。

## 环境变量

- `CCR_KILO_BIN` / `KILO_BIN`：当 CCR Desktop 进程的 `PATH` 中找不到 `kilo` 时，指定真实可执行文件的绝对路径。
- 其他键值对会导出到启动包装器。
- CCR 自行管理的变量（`KILO_CONFIG`、`KILO_CONFIG_CONTENT`、`CCR_PROFILE_SURFACE`）均为保留项——手动设置无效。

## 打开与使用

点击配置卡片上的终端按钮，运行复制出的命令：

```text
ccr-app "Kilo - Work"
```

## 多实例

每个配置都有独立的 `id`。选择 **仅从 CCR 打开时生效** 时，Kilo 会获得隔离的配置文件与包装器，因此多个 Kilo 配置可同时运行，使用不同的模型或供应商。

## 验证

1. 运行从配置卡片复制的 `ccr-app` 命令。
2. 在 Kilo 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是通过 `ccr-app` 启动；除非范围是 **系统默认**，否则直接打开的 Kilo 不受影响。
- **找不到 `kilo`**：用 `CCR_KILO_BIN` 指定真实可执行文件路径。
- **模型不对**：确认 **Kilo 模型** 字段解析为 CCR 能提供的模型。
