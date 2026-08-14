---
title: Kilo Code 接入与配置
pageTitle: Kilo Code
eyebrow: 详细配置
lead: "把 Kilo Code 接入 CCR。Kilo Code 在 CCR 中仅支持 CLI。"
---

## 适用场景

Kilo Code 是一款采用 OpenAI 兼容供应商模型的编码 Agent。在 CCR 中它 **仅支持 CLI**。

当你想让 Kilo Code 走任意 CCR 供应商或 Fusion 模型时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Kilo Code（`PATH` 中可用 `kilo`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Kilo Code**。
2. 填写 **配置名称**（例如 `Kilo - Work`）。
3. 选择 **生效范围**。
4. 确认 **供应商 ID**、**供应商名称** 与 **Kilo 模型**。
5. 只有本机环境有特殊要求时，再调整高级设置。
6. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Kilo Code 固定为 **仅 CLI**，入口模式不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Kilo Code** | 在 CCR 中创建 Kilo Code 启动入口。 |
| 配置名称 | 自由文本，例如 `Kilo - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 生效范围 | `仅从 CCR 打开时生效` / `系统默认` | 仅影响从 CCR 打开的 Kilo，或作为系统默认 Kilo 配置。同一 Agent 只允许一个启用的系统默认配置。 |
| 供应商 ID | 默认 `claude-code-router` | 当前 Kilo 配置使用的供应商引用。 |
| 供应商名称 | 自由文本；默认 `Claude Code Router` | 在 Kilo 中显示的名称。 |
| Kilo 模型 | 供应商模型或 Fusion 模型 | Kilo 通过 CCR 使用的默认模型。 |
| 配置文件 | 路径 | 用于系统默认 Kilo 配置。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |

## 打开与使用

桌面端配置卡片复制出的命令：

```text
ccr-app "Kilo - Work"
```

CLI请执行：

```text
ccr "Kilo - Work"
```

## 多实例

需要不同模型或供应商时，创建多个 Kilo 配置即可。

## 验证

1. 运行桌面端配置卡片复制的 `ccr-app` 命令，或 CLI 的 `ccr` 命令。
2. 在 Kilo 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **请求绕过了 CCR**：确认配置已 **启用**，且你是通过 CCR 配置命令启动；除非范围是 **系统默认**，否则直接打开的 Kilo 不受影响。
- **找不到 `kilo`**：确认 Kilo Code 已安装，并且启动 CCR Desktop 的同一 shell 环境可以找到它。
- **模型不对**：确认 **Kilo 模型** 字段解析为 CCR 能提供的模型。
