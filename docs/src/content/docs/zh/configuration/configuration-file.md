---
title: 配置数据库位置
pageTitle: 配置数据库位置
eyebrow: 详细配置
lead: 找到 CCR 桌面 App 默认维护的 SQLite 配置数据库。
---

## 默认位置

- macOS/Linux：`~/.claude-code-router/config.sqlite`
- Windows：`%APPDATA%\claude-code-router\config.sqlite`

Docker 设置 `HOME=/data`，因此配置数据库位于 `/data/.claude-code-router/config.sqlite`；持久化挂载时请挂载整个 `/data` 目录，以保证配置数据库和相关文件都被保存。

## 生效方式

CCR 的运行配置存储在 SQLite 中。旧版 `config.json` 只会在没有 SQLite 配置时作为迁移来源读取一次，迁移完成后继续编辑 `config.json` 不会影响当前配置。

建议通过桌面 UI 修改配置，或在 **Settings** 中导出备份。不要在 CCR 运行时直接编辑 `config.sqlite`；SQLite 还会维护同目录的 `config.sqlite-wal` 和 `config.sqlite-shm` 辅助文件。
