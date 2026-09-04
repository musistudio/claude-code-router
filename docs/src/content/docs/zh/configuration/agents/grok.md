---
title: Grok CLI 接入与配置
pageTitle: Grok CLI
eyebrow: 详细配置
lead: "把 Grok CLI 接入 CCR。Grok CLI 仅支持 CLI，且始终限定为从 CCR 打开的会话。"
---

## 适用场景

Grok CLI 是 xAI 的编码 Agent。在 CCR 中它 **仅支持 CLI**，且始终使用 **仅从 CCR 打开时生效**。

当你想让 Grok CLI 走任意 CCR 供应商或 Fusion 模型，或运行多个独立的 Grok CLI 会话时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Grok CLI（`PATH` 中可用 `grok`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Grok CLI**。
2. 填写 **配置名称**（例如 `Grok - Work`）。
3. 选择 **模型**。
4. 高级环境设置通常留空，只有本机环境有特殊要求时才填写。
5. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Grok CLI 固定为 **仅从 CCR 打开时生效** 和 **仅 CLI**，这两项不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Grok CLI** | 在 CCR 中创建 Grok CLI 启动入口。 |
| 配置名称 | 自由文本，例如 `Grok - Work` | 标识该配置。桌面端命令使用 `ccr-app "<名称>"`，CLI 命令使用 `ccr "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 模型 | 供应商模型或 Fusion 模型 | Grok CLI 启动时使用的模型。 |
| 环境变量 | 键值对 | 可选高级设置；普通使用保持为空。 |

## 打开与使用

桌面端配置卡片复制出的命令：

```text
ccr-app "Grok - Work"
```

CLI请执行：

```text
ccr "Grok - Work"
```

进入 Grok CLI 后，使用 `/model` 在 CCR 返回的供应商与 Fusion 模型之间切换；切换后的请求仍经过 CCR。

## 多实例

需要不同模型时，创建多个 Grok CLI 配置即可。

## 验证

1. 运行桌面端配置卡片复制的 `ccr-app` 命令，或 CLI 的 `ccr` 命令。
2. 在 Grok CLI 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 运行 `/model`，确认 CCR 暴露的模型出现。

## 常见问题

- **Grok 用了 xAI 账号而非 CCR**：确认你是从 CCR 配置卡片打开 Grok。
- **找不到 `grok`**：确认 Grok CLI 已安装，并且启动 CCR Desktop 的同一 shell 环境可以找到它。
- **`/model` 看不到 CCR 模型**：确认 CCR 中已配置供应商与模型。
