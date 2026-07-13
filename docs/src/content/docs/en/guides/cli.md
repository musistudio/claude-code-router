---
title: CLI Installation And Reference
pageTitle: CLI Installation And Reference
eyebrow: Quick Start
lead: Run the browser management UI and model gateway from npm, and launch locally installed agents through CCR profiles without Electron.
---

## `ccr` And `ccr-app`

CCR has two related commands:

| Command | Source | Primary use |
| --- | --- | --- |
| `ccr` | npm package `@musistudio/claude-code-router` | Electron-free management UI, gateway service, and profile launches. |
| `ccr-app` | CCR desktop application | Desktop-managed profile launcher used by commands copied from Agent Config cards. |

Both distributions use the same local configuration directory, but their command names are not interchangeable. Use the desktop app for tray features, notifications, automatic app updates, and desktop-only browser integrations. Use the npm CLI for headless hosts or external process supervision.

## Install, Upgrade, Or Remove

Node.js 22 or newer is required:

```sh
node --version
npm install -g @musistudio/claude-code-router
ccr --help
```

Upgrade or uninstall with npm:

```sh
npm install -g @musistudio/claude-code-router@latest
npm uninstall -g @musistudio/claude-code-router
```

Uninstalling the package does not delete local configuration or databases. If `ccr` is not found, run `npm prefix -g`, add npm's global binary directory to `PATH`, and open a new shell.

## First Start

Start the background service and open the UI:

```sh
ccr ui
```

For SSH or headless sessions:

```sh
ccr ui --no-open
```

Then add a provider/model, create a CCR client key under **API Keys**, configure routing if needed, and confirm the gateway is running under **Server**. The management UI defaults to `http://127.0.0.1:3458`; the model gateway defaults to `http://127.0.0.1:3456`.

The management token and CCR client keys are separate credentials. The first protects UI/RPC access; the second authenticates model gateway requests.

## Service Command Summary

| Command | Mode | Purpose |
| --- | --- | --- |
| `ccr start` | Background | Starts management and the gateway, then prints the authenticated management URL. |
| `ccr ui` | Background | Reuses or starts the background service and opens a browser. |
| `ccr stop` | One-shot | Stops the service created by `start` or `ui`. |
| `ccr serve` | Foreground | Runs in the current terminal for logs or process supervision. |
| `ccr web` | Foreground | Alias of `serve`. |
| `ccr <profile>` | Foreground | Launches an enabled Agent Config profile. |

## Service Options

```text
ccr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
ccr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
ccr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
ccr stop
```

| Option | Description |
| --- | --- |
| `--host <host>` | Management listener, default `127.0.0.1`. `--host=value` is also accepted. |
| `--port <port>` | Preferred management port, default `3458`. `--port=value` is also accepted. |
| `--open` / `--no-open` | Enables or disables browser opening. `ui` opens by default. |
| `--gateway` | Explicitly requests model gateway startup; this is the default. |
| `--no-gateway` | Starts management without starting the model gateway during service startup. |

When the preferred port is occupied, CCR tries following ports and prints the actual URL. `serve` handles `SIGINT` and `SIGTERM`; `ccr stop` manages only detached services.

## Background Service Reuse

`start` and `ui` store the process ID, URL, and a private service token in `service.json`. A later invocation verifies both the process and RPC identity before reuse.

- A valid service is reused rather than duplicated.
- New host, port, or `--no-gateway` options do not reconfigure an already running service.
- A command that requires the gateway can ask the existing management process to start it.
- Stale state is removed before a replacement service starts.

Stop first when changing listener settings:

```sh
ccr stop
ccr start --host 127.0.0.1 --port 3458
```

## Launch Agent Config Profiles

Create and enable a profile under **Agent Config**, then use:

```text
ccr <profile-name-or-id> [cli|app] [-- <agent arguments>]
```

Examples:

```sh
ccr "Codex - Work"
ccr "Codex - Work" app
ccr "Claude - Review" cli -- --model sonnet
ccr profile-id -- --help
```

- `--cli` and `--app` are alternatives to the positional surface.
- Put agent arguments after `--` to avoid ambiguity.
- Claude Code, Codex, and Grok default to CLI; ZCode defaults to App.
- Grok supports CLI only; ZCode supports App only.
- Claude App and ZCode App reject trailing agent arguments.
- App launches require a locally installed application and graphical session.
- Only enabled profiles are launchable. Use the profile ID when names are ambiguous.

Most profiles require the CCR gateway to be running. Grok CLI can create a managed temporary shared service and stops it after the final managed Grok session exits.

## Configuration And Data

| Platform | Configuration directory |
| --- | --- |
| macOS / Linux | `~/.claude-code-router` |
| Windows | `%APPDATA%\claude-code-router` |

Important paths include `config.sqlite`, `app-data/`, `service.json`, `gateway.config.json`, `profiles/`, and generated launch wrappers under `bin/`. Do not edit or copy live SQLite files. Use **Settings → Export data**, or stop CCR before taking a filesystem backup.

## Authentication And Remote Access

`CCR_WEB_HOST` and `CCR_WEB_PORT` provide defaults when command-line listener options are omitted. Set `CCR_WEB_AUTH_TOKEN` to keep a stable management UI/RPC token; otherwise a random token is generated for the process. The authenticated management URL contains `ccr_web_token`; treat the full URL as a password.

Keep the listener on `127.0.0.1` unless remote access is intentional. A remote deployment should use a strong fixed token, firewall/private network controls, and TLS at a trusted reverse proxy. Create separate CCR client API keys for gateway access and protect the data directory because it contains upstream credentials.

## Process Supervisors

Use `ccr serve --no-open` with an external supervisor. Fix the service user, `HOME`, listener, and `CCR_WEB_AUTH_TOKEN`. Do not also run a detached `ccr start` service, which can create a second management listener or make both processes compete for the same configuration.

## Troubleshooting

- **UI works but gateway requests fail:** add a provider/model and CCR client key, start the gateway under **Server**, and use `ccr serve` to inspect startup errors.
- **The UI is not on port 3458:** the preferred port was occupied; use the printed URL or stop the conflict.
- **Profile not found:** confirm it is enabled, use its ID when names are ambiguous, and re-save it if generated launchers are missing.
- **Old background options remain active:** run `ccr stop`, then start again with the new options.
- **A foreground service does not stop through `ccr stop`:** stop `ccr serve` from its terminal or supervisor.

## Related Pages

- [Install And Start CCR](../install/)
- [Agent Config](../../configuration/profiles/)
- [Server](../../configuration/server/)
- [Docker Deployment](../docker/)
