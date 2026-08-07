---
title: Install and start CCR
pageTitle: Install and start CCR
eyebrow: Quick start
lead: Choose among the desktop app, npm CLI, and Docker distributions, complete installation and first startup, and verify the management UI and model gateway addresses. The CLI requires Node.js 22 or newer.
---

## Choose a distribution

| Distribution | Best for | Entry | Default management address | Default gateway address |
| --- | --- | --- | --- | --- |
| Desktop app | Daily local use, tray, multi-instance Agent Apps, desktop integrations | App UI, `ccr-app` | In-app window | `http://127.0.0.1:3456` |
| npm CLI | Terminal, SSH, no Electron, external process supervisors | `ccr` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | Persistent servers and container operations | Nginx | Shared public endpoint | `http://127.0.0.1:3458` with the default mapping |

In desktop/CLI deployments, management and the model gateway use different ports. CLI management uses `3458` by default, while the model gateway uses `3456`. Docker intentionally combines both through one Nginx endpoint.

## Install the desktop app

1. Open [GitHub Releases](https://github.com/musistudio/claude-code-router/releases).
2. Download `.dmg`/`.zip` for macOS, `.exe` for Windows, or `.AppImage` for Linux.
3. Install and open **Claude Code Router**.
4. Add a provider/model, create a client key under **API Keys**, then click **Start** under **Server**.

When Server shows Running, the model gateway defaults to `http://127.0.0.1:3456`. Enable automatic startup under Server if the gateway should start whenever the app opens.

## Install the npm CLI

Node.js 22 or newer is required:

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

`ccr ui` starts a background service and opens the browser. Use `ccr ui --no-open` on a headless host or `ccr serve --no-open` under a process supervisor. See the [CLI installation and reference](../cli/) for all commands and profile launches.

## Use Docker

From a source checkout:

```sh
docker compose up -d --build
```

Open <http://127.0.0.1:3458>. Docker publishes one Nginx endpoint shared by management and the gateway. Add a provider/model, create a CCR client key, and start the gateway under Server. See [Docker deployment](../docker/) for ports, authentication, persistence, backups, and remote access.

## Verify the installation

After configuring a provider, model, and CCR client key:

1. Confirm Server shows Running.
2. Request `/health` on the deployment's gateway address and expect a `200` running response.
3. Send one minimal model request to a compatible endpoint using the CCR client key.
4. Confirm requested/resolved model, provider, status, and latency under Logs.

A reachable management UI does not prove that the model gateway is usable. Docker `/health` returning `502` is expected before a provider/model has been configured.

## Data locations

| Distribution | Configuration location |
| --- | --- |
| Desktop / CLI on macOS or Linux | `~/.claude-code-router` |
| Desktop / CLI on Windows | `%APPDATA%\claude-code-router` |
| Docker | `/data/.claude-code-router`; persist `/data` |

Current configuration is stored in `config.sqlite`. Legacy `config.json` is only a migration source when SQLite does not exist, or an initial Docker bootstrap. Do not edit live SQLite files.
