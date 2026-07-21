---
title: 安装并启动 CCR
pageTitle: 安装并启动 CCR
eyebrow: 快速开始
lead: 按运行场景在桌面应用、npm CLI 和 Docker 三种发行方式中选择并完成安装，然后验证管理界面与模型网关地址。CLI 要求 Node.js 22 或更高版本。
---

## 选择发行方式

| 方式 | 适合场景 | 入口 | 默认管理地址 | 默认网关地址 |
| --- | --- | --- | --- | --- |
| 桌面应用 | 日常本机使用、托盘、多开 Agent App、桌面集成 | 应用界面、`ccr-app` | 应用内窗口 | `http://127.0.0.1:3456` |
| npm CLI | 终端、SSH、无 Electron 环境、进程管理器 | `ccr` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | 常驻服务器、容器运维、统一浏览器入口 | Nginx | 与网关共用公开地址 | `http://127.0.0.1:3458`（默认端口映射） |

桌面版 / CLI 中，管理 UI 与模型网关使用不同端口。CLI 的 `3458` 是管理端口，默认模型网关端口是 `3456`；Docker 通过 Nginx 把管理 UI 和模型网关合并到同一公开入口。

## 安装桌面应用

1. 打开 [GitHub Releases](https://github.com/musistudio/claude-code-router/releases) 页面。
2. 按系统下载：macOS 使用 `.dmg` 或 `.zip`，Windows 使用 `.exe`，Linux 使用 `.AppImage`。
3. 安装并打开 **Claude Code Router**。
4. 添加供应商和模型，在 **API 密钥** 中创建客户端 Key，然后从 **服务** 页面点击 **启动**。

页面显示运行中后，模型网关默认监听 `http://127.0.0.1:3456`。需要打开应用时自动启动网关，可在 **服务** 页面开启自动启动。

## 安装 npm CLI

要求 Node.js 22 或更高版本：

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

`ccr ui` 会启动后台服务并打开浏览器。无桌面环境使用 `ccr ui --no-open`，生产前台托管使用 `ccr serve --no-open`。完整命令和按 Agent 配置启动的说明见 [CLI 安装与命令参考](../cli/)。

## 使用 Docker

在源码仓库根目录执行：

```sh
docker compose up -d --build
```

打开 <http://127.0.0.1:3458>。Docker 只发布 Nginx 单入口，管理 UI 和模型网关共用该地址。首次启动后仍需添加供应商 / 模型、创建 CCR 客户端 Key，并从 **服务** 页面启动网关。端口、鉴权、持久化、备份和远程部署见 [Docker 部署](../docker/)。

## 验证安装

完成供应商、模型和 CCR 客户端 Key 配置后：

1. 在 **服务** 页面确认状态为运行中。
2. 请求当前部署的 `/health`；成功时应返回 `200` 和运行状态。
3. 用 CCR 客户端 Key 向兼容路径发送一个最小模型请求。
4. 在 **日志** 页面确认请求模型、最终供应商 / 模型、状态码和耗时。

管理界面能打开并不代表模型网关已经可用。没有供应商 / 模型时，Docker 的 `/health` 返回 `502` 属于预期行为。

## 数据位置

| 方式 | 配置位置 |
| --- | --- |
| 桌面 / CLI（macOS、Linux） | `~/.claude-code-router` |
| 桌面 / CLI（Windows） | `%APPDATA%\claude-code-router` |
| Docker | `/data/.claude-code-router`，应持久化挂载 `/data` |

CCR 当前配置存储在 `config.sqlite` 中；`config.json` 只在没有 SQLite 配置时作为旧版迁移或 Docker 首次引导来源。不要在 CCR 运行时直接编辑 SQLite。
