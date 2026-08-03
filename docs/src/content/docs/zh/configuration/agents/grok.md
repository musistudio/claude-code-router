---
title: Grok CLI 接入与配置
pageTitle: Grok CLI
eyebrow: 详细配置
lead: "把 Grok CLI 接入 CCR。Grok CLI 仅支持 CLI，且始终限定为从 CCR 打开的会话。本页逐一说明 Agent 配置中的每一个字段：怎么配置，配置后有什么效果。"
---

## 适用场景

Grok CLI 是 xAI 的编码 Agent。在 CCR 中它 **仅支持 CLI**，且始终使用 **仅从 CCR 打开时生效**：CCR 不会改写你的全局 Grok 配置，而是为每个配置生成启动包装器和隔离的 Grok home，确保推理始终使用 CCR 的密钥与模型网关。

当你想让 Grok CLI 走任意 CCR 供应商或 Fusion 模型，或运行多个相互隔离的 Grok CLI 会话时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. 已安装 Grok CLI（`PATH` 中可用 `grok`）。
3. 进入 **Agent 配置**，点击 **添加配置**。

## CCR 如何接入 Grok CLI

保存一个 Grok CLI 配置时，CCR 会在其 `bin` 目录生成启动 **包装器**，导出：

- `GROK_MODELS_BASE_URL`、`GROK_MODELS_LIST_URL` → CCR 网关的 `/v1` 端点。
- `XAI_API_KEY` → 该配置的 CCR API Key。
- `GROK_DEFAULT_MODEL` → 你选择的模型。
- `GROK_HOME` → 配置专属目录。

它还会把 `GROK_HOME` 指向配置专属的 home。该 home 的 `config.toml` 起始时是源 Grok home 的私有副本，而 `auth.json` 被排除，避免本地 xAI OAuth Token 覆盖 CCR 密钥。插件、技能、会话等 home 条目仍链接到原始 Grok home。

启动时若 CCR Desktop 网关未运行，`ccr-app` 会启动一个可共享的临时网关服务，并在最后一个并发 Grok 会话退出后停止它。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Grok CLI**。
2. 填写 **配置名称**（例如 `Grok - Work`）。
3. 选择 **模型**。
4. 仅当需要非默认的 Grok 可执行文件或源 home 时，再添加环境变量。
5. **保存**，然后复制并运行配置卡片上的命令。

## 配置项详解

Grok CLI 固定为 **仅从 CCR 打开时生效** 和 **仅 CLI**，这两项不可编辑。可配置的字段为：

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Grok CLI** | 让 CCR 生成 Grok 包装器与隔离 home。 |
| 配置名称 | 自由文本，例如 `Grok - Work` | 标识该配置，并用于 `ccr-app "<名称>"`。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 模型 | 供应商模型或 Fusion 模型 | 写入 `GROK_DEFAULT_MODEL`，即 Grok CLI 启动时使用的模型。 |
| 环境变量 | 键值对 | 导出到包装器，见下文。 |

## 环境变量

- `CCR_GROK_BIN`：当 CCR Desktop 进程的 `PATH` 中找不到 `grok` 时，指定真实可执行文件的绝对路径。
- `GROK_HOME` / `GROK_STORAGE_DIR` / `GROK_CONFIG_DIR`：设置 CCR 复制 `config.toml` 的 **源** Grok home（默认 `~/.grok`）。仅当你的 Grok home 在非默认位置时使用。
- CCR 还会自动把网关主机加入 `NO_PROXY`/`no_proxy`，让 Grok 直连本地网关，无需手动配置。

> CCR 自行管理的变量（`GROK_MODELS_BASE_URL`、`GROK_MODELS_LIST_URL`、`GROK_DEFAULT_MODEL`、`GROK_HOME`、`XAI_API_KEY` 等）均为保留项——在配置环境变量中手动设置无效，因为包装器会覆盖它们。

## 打开与使用

点击配置卡片上的终端按钮，运行复制出的命令：

```text
ccr-app "Grok - Work"
```

进入 Grok CLI 后，使用 `/model` 在 CCR 返回的供应商与 Fusion 模型之间切换；切换后的请求仍经过 CCR。

## 多实例

每个配置都有独立的 `id` 和独立的隔离 `GROK_HOME`，因此多个 Grok CLI 配置可同时运行，使用不同的模型或彼此独立的会话历史，且不会影响原有的 `~/.grok`。

## 验证

1. 运行从配置卡片复制的 `ccr-app` 命令。
2. 在 Grok CLI 中发送一条消息，确认能正常回复。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。
4. 运行 `/model`，确认 CCR 暴露的模型出现。

## 常见问题

- **Grok 用了 xAI 账号而非 CCR**：配置 home 按设计排除了 `auth.json`；请确认你是通过 `ccr-app` 启动，而非直接打开 `grok`。
- **找不到 `grok`**：用 `CCR_GROK_BIN` 指定真实可执行文件路径。
- **`/model` 看不到 CCR 模型**：确认 CCR 中已配置供应商与模型，且网关可达（临时网关仅在受管会话运行期间启动）。
- **复制了错误的源配置**：若你的 Grok home 不是 `~/.grok`，请用 `GROK_HOME`（或 `GROK_STORAGE_DIR` / `GROK_CONFIG_DIR`）指定正确的源 home。
