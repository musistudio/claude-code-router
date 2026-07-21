---
title: CLI 安装与命令参考
pageTitle: CLI 安装与命令参考
eyebrow: 快速开始
lead: 面向不使用桌面应用的部署：通过 npm 安装 CCR CLI，管理后台服务、网关端口与凭据，并按 Agent 配置启动本机 Agent。
---

## CLI 与桌面版命令的区别

CCR 有两个相关命令：

| 命令 | 来源 | 主要用途 |
| --- | --- | --- |
| `ccr` | npm 包 `@musistudio/claude-code-router` | 不依赖 Electron，提供浏览器管理界面和模型网关，并按配置启动 Agent。 |
| `ccr-app` | CCR 桌面应用 | 桌面版生成的配置启动器；Agent 配置卡片复制的命令使用这个名称。 |

两个发行版会读取同一套本机配置目录，但不要把命令名混用。需要托盘、桌面通知、自动更新和桌面专属浏览器集成时，使用桌面版；需要无桌面部署或由进程管理器托管时，使用 npm CLI。

## 安装、升级与卸载

CLI 要求 Node.js 22 或更高版本：

```sh
node --version
npm install -g @musistudio/claude-code-router
ccr --help
```

升级和卸载：

```sh
npm install -g @musistudio/claude-code-router@latest
npm uninstall -g @musistudio/claude-code-router
```

卸载 npm 包不会删除 CCR 的本地配置和数据库。

如果安装成功但找不到命令，执行 `npm prefix -g`，确认 npm 全局可执行目录已经加入 `PATH`，然后打开一个新终端。

## 第一次启动

在后台启动 CCR 并打开管理界面：

```sh
ccr ui
```

SSH 或无桌面环境使用：

```sh
ccr ui --no-open
```

随后按这个顺序完成配置：

1. 添加供应商和至少一个模型。
2. 在 **API 密钥** 页面创建用于访问网关的 CCR 客户端 Key。
3. 按需要设置默认模型、路由规则和回退。
4. 在 **服务** 页面确认网关已经运行。
5. 把客户端 Base URL 指向界面显示的网关地址。

管理界面默认使用 `http://127.0.0.1:3458`，模型网关默认使用 `http://127.0.0.1:3456`。管理 Token 与 CCR 客户端 Key 是两种独立凭据：前者保护 UI / RPC，后者验证模型请求。

## 服务命令总览

| 命令 | 运行方式 | 用途 |
| --- | --- | --- |
| `ccr start` | 后台 | 启动管理服务和模型网关，打印带认证信息的管理 URL。 |
| `ccr ui` | 后台 | 复用或启动后台服务，并打开浏览器。 |
| `ccr stop` | 一次性 | 停止由 `start` 或 `ui` 启动的后台服务。 |
| `ccr serve` | 前台 | 在当前终端运行，适合查看日志或交给进程管理器。 |
| `ccr web` | 前台 | `serve` 的别名。 |
| `ccr <配置名称或 ID>` | 前台 | 启动一个已启用的 Agent 配置。 |

## `ccr start`

```text
ccr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

| 选项 | 说明 |
| --- | --- |
| `--host <host>` | 管理服务监听地址，默认 `127.0.0.1`。也接受 `--host=value`。 |
| `--port <port>` | 管理服务首选端口，默认 `3458`。也接受 `--port=value`。 |
| `--open` | 启动后打开浏览器。 |
| `--no-open` | 不打开浏览器。 |
| `--gateway` | 明确要求启动模型网关；这是默认行为。 |
| `--no-gateway` | 只启动管理服务，不在启动阶段拉起模型网关。 |

如果首选端口被占用，CCR 会继续尝试后续端口并打印实际 URL。端口必须是 `1` 到 `65535` 的整数。

## `ccr ui`

```text
ccr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` 与 `start` 使用同一个后台服务，但默认会打开浏览器。管理 URL 包含 `ccr_web_token` 查询参数；请把完整 URL 当作密码，不要粘贴到日志、工单或公开截图。

## `ccr serve`

```text
ccr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` 留在前台，收到 `SIGINT` 或 `SIGTERM` 后关闭管理服务和已配置服务。排查启动错误时优先使用它，因为错误会直接输出到当前终端。

`ccr stop` 只管理后台服务。前台 `serve` 应通过当前终端或外部进程管理器停止。

## 后台服务的复用规则

`start` 和 `ui` 会把进程 ID、URL 和私有服务 Token 写入 `service.json`。再次执行时，CCR 会先验证对应进程和 RPC 身份：

- 服务有效时直接复用，不会再启动第二个后台进程。
- 新传入的 Host、Port 和 `--no-gateway` 不会重配已经运行的进程。
- 如果新命令要求网关运行，CCR 会尝试在现有管理进程中启动网关。
- 状态文件失效或进程已经退出时，CCR 会清理旧状态并启动新服务。

需要修改监听参数时先执行：

```sh
ccr stop
ccr start --host 127.0.0.1 --port 3458
```

## 按 Agent 配置启动

先在 **Agent 配置** 中创建并启用配置，然后使用：

```text
ccr <配置名称或 ID> [cli|app] [-- <Agent 参数>]
```

示例：

```sh
ccr "Codex - Work"
ccr "Codex - Work" app
ccr "Claude - Review" cli -- --model sonnet
ccr profile-id -- --help
```

规则如下：

- `--cli` 和 `--app` 可以替代位置形式的 `cli` / `app`。
- Agent 自己的参数放到 `--` 后，避免与 CCR 选项或入口名冲突。
- 省略入口时，Claude Code、Codex、Grok CLI 默认使用 CLI，ZCode 默认使用 App。
- Grok 只支持 CLI，ZCode 只支持 App。
- Claude App 和 ZCode App 不支持额外 Agent 参数。
- 启动 App 需要本机安装对应桌面应用，并且当前环境有图形会话。
- 只有已启用的配置可以启动。名称产生歧义时使用配置 ID。

大多数配置要求 CCR 网关已经运行。Grok CLI 是例外：如果服务不存在，它可以自动启动一个受管的临时共享服务，并在最后一个 Grok 会话退出后关闭。

## 配置和数据位置

| 平台 | 配置目录 |
| --- | --- |
| macOS / Linux | `~/.claude-code-router` |
| Windows | `%APPDATA%\claude-code-router` |

常见文件和目录：

| 路径 | 用途 |
| --- | --- |
| `config.sqlite` | 当前应用配置。 |
| `app-data/` | API Key、用量、请求日志、证书等运行数据。 |
| `service.json` | 后台 CLI 服务状态和私有 Token。 |
| `gateway.config.json` | 生成的网关运行配置。 |
| `profiles/` | 按 Agent 配置隔离的文件。 |
| `bin/` | CCR 生成的 Agent 启动包装器。 |

不要在 CCR 运行时直接编辑或复制活跃 SQLite 文件。优先使用 **Settings → Export data**；文件级备份前先停止 CLI 和桌面应用。

## 环境变量与远程访问

公开的管理认证变量是：

| 变量 | 说明 |
| --- | --- |
| `CCR_WEB_HOST` | 省略 `--host` 时使用的管理服务监听地址。 |
| `CCR_WEB_PORT` | 省略 `--port` 时使用的管理服务端口。 |
| `CCR_WEB_AUTH_TOKEN` | 固定管理 UI / RPC Token；不设置时进程会生成随机 Token。 |

监听到 `0.0.0.0` 会让管理界面进入局域网或外部网络。只有在确实需要时才这样配置，并同时使用固定强 Token、主机防火墙或私网，以及可信反向代理提供的 TLS。

模型网关还需要单独创建 CCR 客户端 Key。上游供应商凭据保存在本地数据目录，因此目录和备份都应按敏感数据保护。

## 进程管理器示例

生产环境应使用 `ccr serve --no-open`，让外部管理器负责重启和日志。启动命令至少应固定工作用户、`HOME`、监听地址和 `CCR_WEB_AUTH_TOKEN`。不要同时运行由 `ccr start` 创建的后台服务，否则可能得到两个管理端口或竞争同一套配置。

## 常见问题

### UI 能打开，但 `/health` 或模型请求失败

管理服务可以在没有可用模型网关时运行。添加供应商和模型、创建 CCR 客户端 Key，然后从 **服务** 页面启动或重启网关。使用 `ccr serve` 查看启动错误。

### 管理端口发生偏移

3458 已被占用，CCR 使用了后续可用端口。以命令打印的 URL 为准；需要固定端口时，先停止冲突进程。

### 找不到 Agent 配置

确认配置已启用，并检查名称是否重复。CCR 会按 ID、名称、忽略大小写的名称和清理后的名称匹配；多个结果时必须使用 ID。

### 提示启动器不存在

先打开一次 CCR 或重新保存该 Agent 配置，让 CCR 重新生成 `bin/` 下的启动包装器。

### 后台服务无法停止

先运行 `ccr stop`。如果状态文件已经失效，命令会清理它并报告服务未运行。前台 `ccr serve` 不受 `ccr stop` 管理，应回到对应终端或进程管理器停止。

## 相关页面

- [安装并启动 CCR](../install/)
- [Agent 配置](../../configuration/profiles/)
- [服务配置](../../configuration/server/)
- [Docker 部署](../docker/)
