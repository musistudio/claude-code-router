---
title: Config database location
pageTitle: Config database location
eyebrow: Detailed configuration
lead: Locate the SQLite configuration database maintained by the CCR desktop app.
---

## Default locations

- **macOS/Linux**: `~/.claude-code-router/config.sqlite`
- **Windows**: `%APPDATA%\claude-code-router\config.sqlite`

Docker sets `HOME=/data`, so its configuration database is `/data/.claude-code-router/config.sqlite`. Persist the complete `/data` directory so the configuration database and companion files are preserved.

## Applying changes

CCR stores runtime configuration in SQLite. A legacy `config.json` is read only once as a migration source when no SQLite config exists; after migration, editing `config.json` does not affect the current configuration.

Use the desktop UI to change configuration, or export a backup from **Settings**. Do not edit `config.sqlite` directly while CCR is running; SQLite also maintains companion `config.sqlite-wal` and `config.sqlite-shm` files in the same directory.

### Concurrent saves

Configuration reads include `configRevision`. Preserve it when saving a full configuration through the management RPC. If another window or process has changed settings, saving returns a conflict (HTTP 409 for the web RPC). Reload the current configuration and reapply the edit. Theme and gateway API keys have dedicated save operations and are preserved by full settings saves. The revision is a concurrency token, not persisted configuration content.
