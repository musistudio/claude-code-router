---
title: Kimi CLI 接入与配置
pageTitle: Kimi CLI
eyebrow: 详细配置
lead: "把 Kimi CLI 接入 CCR。Kimi CLI 仅支持 CLI，且始终限定为从 CCR 打开的会话。"
---

## 适用场景

Kimi CLI 是 Moonshot 的编码 Agent。在 CCR 中它 **仅支持 CLI**，且始终使用 **仅从 CCR 打开时生效**。

当你想让 Kimi CLI 走任意 CCR 供应商或 Fusion 模型、暴露多个可切换模型，或运行独立的 Kimi CLI 会话时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Kimi CLI（`PATH` 中可用 `kimi`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Kimi CLI**。
2. 填写 **配置名称**（例如 `Kimi - Work`）。
3. 选择 **Kimi 模型**（默认模型）以及一个或多个 **可用模型**。
4. 高级环境设置通常留空，只有本机环境有特殊要求时才填写。
5. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Kimi CLI 固定为 **仅从 CCR 打开时生效** 和 **仅 CLI**，这两项不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Kimi CLI** | 在 CCR 中创建 Kimi CLI 启动入口。 |
| 配置名称 | 自由文本，例如 `Kimi - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| Kimi 模型 | 供应商模型或 Fusion 模型 | 默认模型，至少需要一个。 |
| 可用模型 | 一个或多个供应商/Fusion 模型 | Kimi `/model` 菜单里可切换的模型。默认模型始终包含在内。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |

## 打开与使用

桌面端配置卡片复制出的命令：

```text
ccr-app "Kimi - Work"
```

CLI请执行：

```text
ccr "Kimi - Work"
```

进入 Kimi CLI 后，使用 `/model` 在默认模型与可用模型之间切换。每一次选择都仍经过 CCR 的供应商、路由与 Fusion。

## 多实例

需要不同默认模型或模型集合时，创建多个 Kimi CLI 配置即可。

## 验证

1. 运行桌面端配置卡片复制的 `ccr-app` 命令，或 CLI 的 `ccr` 命令。
2. 在 Kimi CLI 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 运行 `/model`，确认默认模型与可用模型均出现。

## 常见问题

- **`/model` 为空或缺模型**：至少添加一个 **可用模型**（默认模型计入）；确认 CCR 中已配置供应商与模型。
- **配置无法保存**：Kimi CLI 要求同时有默认模型和至少一个可用模型。
- **找不到 `kimi`**：确认 Kimi CLI 已安装，并且启动 CCR Desktop 的同一 shell 环境可以找到它。
