---
title: Config database location
pageTitle: Config database location
eyebrow: Detailed configuration
lead: Locate the SQLite configuration database and related files maintained by CCR on each platform, and learn how to back up or inspect configuration without the desktop UI.
---

## Configuration directories by platform

CCR stores all local configuration and runtime data under one **configuration directory** (`CONFIGDIR`). The desktop app and the npm `ccr` CLI share the same directory on the same machine.

| Platform | Configuration directory | Runtime data subdirectory |
| --- | --- | --- |
| **macOS** | `~/.claude-code-router` | `~/.claude-code-router/app-data/` |
| **Linux** (native) | `~/.claude-code-router` | `~/.claude-code-router/app-data/` |
| **Windows** (native) | `%APPDATA%\claude-code-router` | Same directory (no separate `app-data/` folder) |
| **WSL (Ubuntu, etc.)** | `~/.claude-code-router` inside the WSL distro | `~/.claude-code-router/app-data/` |
| **Docker** | `/data/.claude-code-router` (`HOME=/data`) | `/data/.claude-code-router/app-data/` |

### WSL and dual-boot notes

- **CCR on WSL** uses the Linux home directory of that WSL distro, for example `/home/<user>/.claude-code-router`.
- **CCR on Windows native** uses `%APPDATA%\claude-code-router`, typically `C:\Users\<user>\AppData\Roaming\claude-code-router`.
- These are **separate** installations. Running CCR in WSL and on Windows native at the same time creates two independent configuration trees.
- To confirm the active directory, open **Settings → Data** and read the **Config database** path (`configDbFile`), or call the `getAppInfo` management RPC after starting `ccr ui`.

On Windows, CCR may migrate files from the legacy directory `%APPDATA%\Claude Code Router\` into `%APPDATA%\claude-code-router\` on first launch.

## Files and directories

Paths below are relative to the configuration directory unless noted.

### Core configuration

| Path | Purpose |
| --- | --- |
| `config.sqlite` | **Primary configuration database.** Providers, models, routing rules, Agent Config profiles, extension settings, and UI preferences are stored here. |
| `config.sqlite-wal`, `config.sqlite-shm` | SQLite write-ahead log and shared-memory files. Created while CCR is running; do not copy or edit them independently. |
| `config.json` | **Legacy migration source only.** Read once when no SQLite database exists, then ignored. Editing it after migration has no effect. |
| `.onboard_finished` | Marker that first-time onboarding completed. |

### Gateway and CLI service

| Path | Purpose |
| --- | --- |
| `gateway-runtime.json` | Internal gateway runtime marker written by the gateway supervisor. |
| `gateway-proxy-preload.cjs` | Generated preload script for gateway proxy features. |
| `service.json` | Background `ccr start` / `ccr ui` process state, management URL, and private service token. |

### Agent Config isolation

| Path | Purpose |
| --- | --- |
| `profiles/<profile-id>/` | Per-profile agent home directories (for example `claude/`, `codex/`, `opencode/`). |
| `bin/` | Generated launch wrappers and helper scripts for Agent Config profiles. |
| `global-profile-takeover.json` | Records which profile currently owns global agent configuration. |
| `claude-model-discovery-fingerprint.json` | Cache fingerprint for Claude model discovery. |
| `claude-app-gateway-backup.json` | Backup of Claude App gateway settings before CCR applies changes. |
| `bot-gateway/<slug>/` | Bot gateway relay state for AgentClaw integrations. |

### Runtime data

On **macOS and Linux**, runtime databases live under `app-data/` inside the configuration directory. On **Windows**, the same files sit in the configuration directory root (there is no `app-data/` subfolder).

| Path (macOS / Linux) | Path (Windows) | Purpose |
| --- | --- | --- |
| `app-data/api-keys.sqlite` | `api-keys.sqlite` | CCR client API keys and local rate-limit state. |
| `app-data/usage.sqlite` | `usage.sqlite` | Token usage and cost statistics. |
| `app-data/request-logs.sqlite` | `request-logs.sqlite` | Request log index. |
| `app-data/request-log-bodies/` | `request-log-bodies/` | Large request/response bodies referenced by the log database. |
| `app-data/context-archive.sqlite` | `context-archive.sqlite` | Archived conversation context for observability. |
| `app-data/raw-trace-spool/` | `raw-trace-spool/` | Raw agent trace spool files. |
| `app-data/certs/` | `certs/` | TLS certificates for the local HTTPS proxy (`ca.pem`, `ca.cer`, `key.pem`). |
| `app-data/provider-icons/` | `provider-icons/` | Cached provider icon images. |
| `app-data/plugins/<plugin-id>/` | `plugins/<plugin-id>/` | Per-plugin runtime data. |
| `app-data/plugin-marketplace/` | `plugin-marketplace/` | Downloaded marketplace plugin cache. |
| `app-data/system-proxy-snapshot.json` | `system-proxy-snapshot.json` | Snapshot of system proxy settings when CCR last changed them. |

### Other generated paths

| Path | Purpose |
| --- | --- |
| `grok-media/` | Cached media files for Grok-related features. |

## Applying changes

CCR stores runtime configuration in SQLite. After the first migration:

- **Do not edit `config.sqlite` directly** while CCR is running.
- **Do not edit `config.json`** expecting changes to apply; it is only a one-time migration source.
- Prefer the management UI (desktop app or `ccr ui`) for routine changes.
- After editing gateway-related generated files, restart the gateway from the **Server** page.

## Modifying configuration without the desktop UI

You can manage CCR without the Electron desktop app:

### 1. Browser management UI (`ccr ui`)

Install the npm CLI and open the same management UI in a browser:

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

On SSH or headless hosts, use `ccr ui --no-open` and open the printed URL manually. The URL includes a `ccr_web_token` query parameter; treat it as a password.

### 2. Export a JSON backup (recommended for inspection and backup)

In **Settings → Export data**, CCR writes a timestamped JSON file (default: your `Downloads` folder) containing:

- The full application `config` object (providers, routing, profiles, and so on).
- Embedded base64 copies of active SQLite databases and WAL/SHM sidecars.

Use this export to inspect settings offline or to keep a version-controlled backup. CCR does not currently provide a one-click **import** from this export; restoring from export is a maintainer-level operation—stop CCR, back up the configuration directory, then restore files with care.

### 3. File-level backup (stop CCR first)

For a complete filesystem backup:

```sh
ccr stop
# macOS / Linux example:
tar -czf ccr-backup.tar.gz ~/.claude-code-router
```

Stop both the desktop app and any background `ccr` service before copying live SQLite files. Include `app-data/` (or the entire Windows configuration directory).

### 4. Docker persistence

Mount the entire `/data` volume so `config.sqlite`, `app-data/`, and companion files survive container restarts. See [Docker deployment](../../guides/docker/).

## Related pages

- [CLI installation and command reference](../../guides/cli/) — includes a shorter configuration-location summary.
- [Server](./server/) — gateway host, port, and restart.
- [Docker deployment](../../guides/docker/) — container paths and volume layout.
