---
title: Config Database Location
pageTitle: Config Database Location
eyebrow: Detailed Configuration
lead: Locate the SQLite configuration database maintained by the CCR desktop app.
---

## Default Locations

- **macOS/Linux**: `~/.claude-code-router/config.sqlite`
- **Windows**: `%APPDATA%\claude-code-router\config.sqlite`

Docker sets `HOME=/data`, so its configuration database is `/data/.claude-code-router/config.sqlite`. Persist the complete `/data` directory rather than mounting only one database file.

## Applying Changes

CCR stores runtime configuration in SQLite. A legacy `config.json` is read only once as a migration source when no SQLite config exists; after migration, editing `config.json` does not affect the current configuration.

Use the desktop UI to change configuration, or export a backup from **Settings**. Do not edit `config.sqlite` directly while CCR is running; SQLite also maintains companion `config.sqlite-wal` and `config.sqlite-shm` files in the same directory.
