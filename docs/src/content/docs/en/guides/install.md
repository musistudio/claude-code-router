---
title: Install And Start CCR
pageTitle: Install And Start CCR
eyebrow: Quick Start
lead: Choose the desktop app, npm CLI, or Docker for the deployment, and distinguish the management address from the model gateway address.
---

## Choose A Distribution

| Distribution | Best for | Entry | Default management address | Default gateway address |
| --- | --- | --- | --- | --- |
| Desktop app | Daily local use, tray, multi-instance Agent Apps, desktop integrations | App UI, `ccr-app` | In-app window | `http://127.0.0.1:3456` |
| npm CLI | Terminal, SSH, no Electron, external process supervisors | `ccr` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | Persistent servers and container operations | Nginx | Shared public endpoint | `http://127.0.0.1:3458` with the default mapping |

In desktop/CLI deployments, management and the model gateway do not use the same port. Do not use CLI management port `3458` as the default model gateway. Docker intentionally combines both through one Nginx endpoint.

## Install The Desktop App

1. Open [GitHub Releases](https://github.com/musistudio/claude-code-router/releases).
2. Download `.dmg`/`.zip` for macOS, `.exe` for Windows, or `.AppImage` for Linux.
3. Install and open **Claude Code Router**.
4. Add a provider/model, create a client key under **API Keys**, then click **Start** under **Server**.

When Server shows Running, the model gateway defaults to `http://127.0.0.1:3456`. Enable automatic startup under Server if the gateway should start whenever the app opens.

## Install The npm CLI

Node.js 22 or newer is required:

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

`ccr ui` starts a background service and opens the browser. Use `ccr ui --no-open` on a headless host or `ccr serve --no-open` under a process supervisor. See [CLI Installation And Reference](../cli/) for all commands and profile launches.

## Use Docker

From a source checkout:

```sh
docker compose up -d --build
```

Open <http://127.0.0.1:3458>. Docker publishes one Nginx endpoint shared by management and the gateway. Add a provider/model, create a CCR client key, and start the gateway under Server. See [Docker Deployment](../docker/) for ports, authentication, persistence, backups, and remote access.

## Verify The Installation

After configuring a provider, model, and CCR client key:

1. Confirm Server shows Running.
2. Request `/health` on the deployment's gateway address and expect a `200` running response.
3. Send one minimal model request to a compatible endpoint using the CCR client key.
4. Confirm requested/resolved model, provider, status, and latency under Logs.

A reachable management UI does not prove that the model gateway is usable. Docker `/health` returning `502` is expected before a provider/model has been configured.

## Data Locations

| Distribution | Configuration location |
| --- | --- |
| Desktop / CLI on macOS or Linux | `~/.claude-code-router` |
| Desktop / CLI on Windows | `%APPDATA%\claude-code-router` |
| Docker | `/data/.claude-code-router`; persist `/data` |

Current configuration is stored in `config.sqlite`. Legacy `config.json` is only a migration source when SQLite does not exist, or an initial Docker bootstrap. Do not edit live SQLite files.
