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

### 并发保存

配置读取结果包含 `configRevision`。通过管理 RPC 保存完整配置时，必须保留该版本值；其他窗口或进程已更新配置时，保存会返回冲突（Web RPC 为 HTTP 409），避免旧快照覆盖新设置。重新加载最新配置后再应用修改。主题和网关 API Key 使用各自的保存接口，完整设置保存不会覆盖它们。`configRevision` 是并发校验字段，不写入配置内容。
