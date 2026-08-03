---
title: Kimi CLI 接入与配置
pageTitle: Kimi CLI
eyebrow: 详细配置
lead: "把 Kimi CLI 接入 CCR。Kimi CLI 仅支持 CLI，且始终限定为从 CCR 打开的会话。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

Kimi CLI 是 Moonshot 的编码 Agent。在 CCR 中它 **仅支持 CLI**，且始终使用 **仅从 CCR 打开时生效**：CCR 不会改写原有的 `~/.kimi-code/config.toml`，而是生成配置专属的 Kimi home，其中的 `config.toml` 注册一个私有的 CCR 供应商，并为每个选中模型生成一条模型条目，使 `/model` 切换始终经过 CCR。

当你想让 Kimi CLI 走任意 CCR 供应商或 Fusion 模型、暴露多个可切换模型，或运行相互隔离的 Kimi CLI 会话时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Kimi CLI（`PATH` 中可用 `kimi`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 Kimi CLI

保存一个 Kimi CLI 配置时，CCR 会：

- 在其配置目录树下创建配置专属的 `KIMI_CODE_HOME` 目录。
- 在该 home 中生成 `config.toml`，定义一个 OpenAI 兼容的私有 CCR 供应商（`base_url` 为网关 `/v1`，API Key 为配置 Token），并为默认模型和每个可用模型生成 `[models.<模型>]` 条目，包含上下文窗口、能力、推理档位与显示名。
- 生成启动 **包装器**，把 `KIMI_CODE_HOME` 指向该 home，清除单模型覆盖变量，再启动 Kimi。

原有的 `~/.kimi-code/config.toml` 绝不会被改写。CCR 通过链接方式复用源 Kimi home 中的会话、技能、插件、MCP 配置与凭据。CCR Desktop 未运行时，包装器会启动一个可共享的临时网关，并在最后一个受管 Kimi 会话退出后停止它。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Kimi CLI**。
2. 填写 **配置名称**（例如 `Kimi - Work`）。
3. 选择 **Kimi 模型**（默认模型）以及一个或多个 **可用模型**。
4. 仅当需要非默认的 Kimi 可执行文件、源 home 或自定义请求头时，再添加环境变量。
5. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Kimi CLI 固定为 **仅从 CCR 打开时生效** 和 **仅 CLI**，这两项不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Kimi CLI** | 让 CCR 生成 Kimi home、`config.toml` 与包装器。 |
| 配置名称 | 自由文本，例如 `Kimi - Work` | 标识该配置，并用于 `ccr-app "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| Kimi 模型 | 供应商模型或 Fusion 模型 | 默认模型（`default_model`），至少需要一个。 |
| 可用模型 | 一个或多个供应商/Fusion 模型 | 每个都会成为 Kimi `/model` 暴露的 `[models.<模型>]` 条目；默认模型始终包含在内。 |
| 环境变量 | 键值对 | 导出到包装器，见下文。 |

## 环境变量

- `CCR_KIMI_BIN` / `KIMI_BIN`：当 `PATH` 中找不到 `kimi` 时，指定真实可执行文件的绝对路径。
- `CCR_KIMI_SOURCE_HOME` / `KIMI_CODE_HOME`：设置 CCR 复用会话/技能/插件/凭据的 **源** Kimi home（默认 `~/.kimi-code`）。
- `KIMI_CODE_CUSTOM_HEADERS`：换行分隔的 `Key: Value`，作为该配置每次 CCR 请求的自定义请求头。
- CCR 还会自动把网关主机加入 `NO_PROXY`/`no_proxy`，无需手动配置。

> CCR 自行管理的变量（`KIMI_CODE_HOME` 及单模型覆盖变量）均为保留项——手动设置无效，因为包装器会设置或清除它们。

## 打开与使用

点击配置卡片上的终端按钮，运行复制出的命令：

```text
ccr-app "Kimi - Work"
```

进入 Kimi CLI 后，使用 `/model` 在默认模型与可用模型之间切换。每一次选择都仍经过 CCR 的供应商、路由与 Fusion。

## 多实例

每个配置都有独立的 `id` 和独立的 `KIMI_CODE_HOME`，因此多个 Kimi CLI 配置可同时运行，使用不同的默认模型或模型集合，且不会改动原有的 Kimi 配置。

## 验证

1. 运行从配置卡片复制的 `ccr-app` 命令。
2. 在 Kimi CLI 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 运行 `/model`，确认默认模型与可用模型均出现。

## 常见问题

- **`/model` 为空或缺模型**：至少添加一个 **可用模型**（默认模型计入）；确认 CCR 中已配置供应商与模型。
- **配置无法保存**：Kimi CLI 要求同时有默认模型和至少一个可用模型。
- **找不到 `kimi`**：用 `CCR_KIMI_BIN` 指定真实可执行文件路径。
- **会话/凭据未被复用**：若你的 Kimi home 不是 `~/.kimi-code`，请用 `CCR_KIMI_SOURCE_HOME`（或 `KIMI_CODE_HOME`）指定正确的源 home。
