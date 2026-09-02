---
title: 配置数据库位置
pageTitle: 配置数据库位置
eyebrow: 详细配置
lead: 了解 CCR 在各平台上的 SQLite 配置数据库及相关文件位置，以及如何在不使用桌面 UI 的情况下备份或查看配置。
---

## 各平台的配置目录

CCR 将所有本地配置和运行数据存放在同一个**配置目录**（`CONFIGDIR`）下。同一台机器上的桌面应用和 npm `ccr` CLI 共享该目录。

| 平台 | 配置目录 | 运行数据子目录 |
| --- | --- | --- |
| **macOS** | `~/.claude-code-router` | `~/.claude-code-router/app-data/` |
| **Linux**（原生） | `~/.claude-code-router` | `~/.claude-code-router/app-data/` |
| **Windows**（原生） | `%APPDATA%\claude-code-router` | 同一目录（无独立 `app-data/` 文件夹） |
| **WSL（Ubuntu 等）** | WSL 发行版内的 `~/.claude-code-router` | `~/.claude-code-router/app-data/` |
| **Docker** | `/data/.claude-code-router`（`HOME=/data`） | `/data/.claude-code-router/app-data/` |

### WSL 与双系统说明

- **WSL 中的 CCR** 使用该 WSL 发行版的 Linux 主目录，例如 `/home/<用户>/.claude-code-router`。
- **Windows 原生 CCR** 使用 `%APPDATA%\claude-code-router`，通常为 `C:\Users\<用户>\AppData\Roaming\claude-code-router`。
- 两者是**独立**的安装，在 WSL 和 Windows 原生同时运行会产生两套互不相干的配置。
- 在 UI 中确认当前目录：打开 **Settings → Data**，查看 **Config database**（`configDbFile`）路径；或启动 `ccr ui` 后通过管理 RPC 调用 `getAppInfo`。

在 Windows 上，CCR 首次启动时可能会将旧目录 `%APPDATA%\Claude Code Router\` 中的文件迁移到 `%APPDATA%\claude-code-router\`。

## 文件与目录说明

以下路径均相对于配置目录，除非另有说明。

### 核心配置

| 路径 | 用途 |
| --- | --- |
| `config.sqlite` | **主配置数据库。** 存储供应商、模型、路由规则、Agent 配置、扩展设置和 UI 偏好。 |
| `config.sqlite-wal`、`config.sqlite-shm` | SQLite 预写日志和共享内存文件。CCR 运行期间创建；请勿单独复制或编辑。 |
| `config.json` | **仅作旧版迁移来源。** 在没有 SQLite 数据库时读取一次，之后忽略。迁移完成后继续编辑不会影响当前配置。 |
| `.onboard_finished` | 标记首次引导已完成。 |

### 网关与 CLI 服务

| 路径 | 用途 |
| --- | --- |
| `gateway-runtime.json` | 网关监督进程写入的内部运行时标记。 |
| `gateway-proxy-preload.cjs` | 网关代理功能生成的预加载脚本。 |
| `service.json` | 后台 `ccr start` / `ccr ui` 进程状态、管理 URL 和私有服务 Token。 |

### Agent 配置隔离

| 路径 | 用途 |
| --- | --- |
| `profiles/<profile-id>/` | 按配置隔离的 Agent 主目录（如 `claude/`、`codex/`、`opencode/`）。 |
| `bin/` | CCR 为 Agent 配置生成的启动包装器和辅助脚本。 |
| `global-profile-takeover.json` | 记录当前哪个配置拥有全局 Agent 配置。 |
| `claude-model-discovery-fingerprint.json` | Claude 模型发现缓存指纹。 |
| `claude-app-gateway-backup.json` | CCR 修改前 Claude App 网关设置的备份。 |
| `bot-gateway/<slug>/` | AgentClaw 集成的 Bot 网关中继状态。 |

### 运行数据

在 **macOS 和 Linux** 上，运行数据库位于配置目录内的 `app-data/` 下。在 **Windows** 上，相同文件位于配置目录根目录（无 `app-data/` 子文件夹）。

| 路径（macOS / Linux） | 路径（Windows） | 用途 |
| --- | --- | --- |
| `app-data/api-keys.sqlite` | `api-keys.sqlite` | CCR 客户端 API Key 和本地限速状态。 |
| `app-data/usage.sqlite` | `usage.sqlite` | Token 用量和费用统计。 |
| `app-data/request-logs.sqlite` | `request-logs.sqlite` | 请求日志索引。 |
| `app-data/request-log-bodies/` | `request-log-bodies/` | 日志数据库引用的大型请求/响应体。 |
| `app-data/context-archive.sqlite` | `context-archive.sqlite` | 可观测性用的归档对话上下文。 |
| `app-data/raw-trace-spool/` | `raw-trace-spool/` | 原始 Agent 跟踪 spool 文件。 |
| `app-data/certs/` | `certs/` | 本地 HTTPS 代理的 TLS 证书（`ca.pem`、`ca.cer`、`key.pem`）。 |
| `app-data/provider-icons/` | `provider-icons/` | 缓存的供应商图标。 |
| `app-data/plugins/<plugin-id>/` | `plugins/<plugin-id>/` | 各插件的运行时数据。 |
| `app-data/plugin-marketplace/` | `plugin-marketplace/` | 下载的市场插件缓存。 |
| `app-data/system-proxy-snapshot.json` | `system-proxy-snapshot.json` | CCR 上次修改系统代理时的快照。 |

### 其他生成路径

| 路径 | 用途 |
| --- | --- |
| `grok-media/` | Grok 相关功能的缓存媒体文件。 |

## 生效方式

CCR 的运行配置存储在 SQLite 中。首次迁移之后：

- **不要在 CCR 运行时直接编辑 `config.sqlite`。**
- **不要编辑 `config.json` 期望生效**；它只是一次性迁移来源。
- 日常修改请使用管理 UI（桌面应用或 `ccr ui`）。
- 修改网关相关生成文件后，请在 **Server** 页面重启网关。

## 不使用桌面 UI 修改配置

可以不安装 Electron 桌面应用来管理 CCR：

### 1. 浏览器管理 UI（`ccr ui`）

安装 npm CLI 后在浏览器中打开同样的管理界面：

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

在 SSH 或无图形界面环境中，使用 `ccr ui --no-open`，然后手动打开打印的 URL。URL 包含 `ccr_web_token` 查询参数，请当作密码保管。

### 2. 导出 JSON 备份（推荐用于查看和备份）

在 **Settings → Export data** 中，CCR 会写入带时间戳的 JSON 文件（默认：`Downloads` 目录），内容包括：

- 完整的应用 `config` 对象（供应商、路由、配置等）。
- 活跃 SQLite 数据库及 WAL/SHM 辅助文件的 base64 嵌入副本。

可用该导出离线查看设置或做版本控制的备份。CCR 目前**不提供**从此导出的一键导入；从导出恢复属于维护者级操作——先停止 CCR、备份配置目录，再谨慎恢复文件。

### 3. 文件级备份（先停止 CCR）

完整文件系统备份示例：

```sh
ccr stop
# macOS / Linux 示例：
tar -czf ccr-backup.tar.gz ~/.claude-code-router
```

复制活跃 SQLite 文件前，请同时停止桌面应用和后台 `ccr` 服务。请包含 `app-data/`（或 Windows 上的整个配置目录）。

### 4. Docker 持久化

挂载整个 `/data` 卷，使 `config.sqlite`、`app-data/` 及伴随文件在容器重启后保留。参见 [Docker 部署](../../guides/docker/)。

## 相关页面

- [CLI 安装与命令参考](../../guides/cli/) — 含较短的配置位置摘要。
- [Server](./server/) — 网关监听地址、端口和重启。
- [Docker 部署](../../guides/docker/) — 容器路径和卷布局。
