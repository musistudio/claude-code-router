# Claude Code Router CLI

[中文](README_zh.md) · [Documentation](https://ccrdesk.top/en/) · [GitHub](https://github.com/musistudio/claude-code-router)

`@musistudio/claude-code-router` is the Node.js distribution of Claude Code Router. It provides the `ccr` command, the browser-based management UI, the local model gateway, and profile launch commands without requiring Electron.

Use the CLI on developer machines and headless hosts. If you want the tray, desktop notifications, automatic app updates, or desktop-only browser integrations, install the desktop application instead.

## Requirements And Installation

- Node.js 22 or newer
- A supported upstream model provider, or a locally logged-in agent account that CCR can import
- A locally installed agent executable when using profile launch commands

Install globally:

```sh
npm install -g @musistudio/claude-code-router
ccr --help
```

Upgrade or remove it with npm:

```sh
npm install -g @musistudio/claude-code-router@latest
npm uninstall -g @musistudio/claude-code-router
```

Removing the package does not delete CCR's local configuration or databases.

## Quick Start

Start the background service and open the management UI:

```sh
ccr ui
```

Then:

1. Add an upstream provider and at least one model.
2. Create a CCR client key under **API Keys**.
3. Configure routing if the default provider/model is not sufficient.
4. Confirm that the gateway is running under **Server**.
5. Point your client at the gateway URL shown in the UI. The default gateway is `http://127.0.0.1:3456`; the management UI defaults to `http://127.0.0.1:3458`.

The management token and CCR client API keys are different credentials. The management token protects the browser UI and RPC API. CCR client keys authenticate model requests sent to the gateway.

## Service Commands

| Command | Behavior |
| --- | --- |
| `ccr start` | Starts a detached background management service and gateway, then prints its authenticated management URL. |
| `ccr ui` | Reuses or starts the background service and opens the management UI. |
| `ccr stop` | Stops the detached service started by `ccr start` or `ccr ui`. |
| `ccr serve` | Runs the management service and gateway in the foreground. `ccr web` is an alias. |
| `ccr <profile>` | Opens an enabled Agent Config profile by name or ID. |

### `ccr start`

```text
ccr start [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

- `--host <host>`: management listener, default `127.0.0.1`.
- `--port <port>`: preferred management port, default `3458`.
- `--open` / `--no-open`: enable or disable opening a browser.
- `--gateway`: explicitly request gateway startup; this is the default.
- `--no-gateway`: start only the management service.

### `ccr ui`

```text
ccr ui [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`ui` opens the browser by default. Use `--no-open` on SSH or other headless sessions.

### `ccr serve`

```text
ccr serve [--host <host>] [--port <port>] [--open|--no-open] [--gateway|--no-gateway]
```

`serve` stays attached to the current terminal and handles `SIGINT`/`SIGTERM`. It is the appropriate mode for a process supervisor. `ccr stop` only manages the detached service; stop a foreground server through its terminal or supervisor.

If the preferred management port is occupied, CCR tries the next available ports and prints the actual URL. When `start` or `ui` reuses an existing service, new host, port, and `--no-gateway` choices do not reconfigure that process. Run `ccr stop` first when those settings must change.

## Agent Config Profiles

Create and enable profiles in **Agent Config**, then launch one by name or ID:

```sh
ccr "Codex - Work"
ccr "Codex - Work" app
ccr "Claude - Review" cli -- --model sonnet
ccr profile-id -- --help
```

The syntax is:

```text
ccr <profile-name-or-id> [cli|app] [-- <agent arguments>]
```

- `--cli` and `--app` are accepted alternatives to the positional surface.
- Put agent-specific arguments after `--` so they cannot be confused with CCR options.
- If the surface is omitted, CCR uses the first surface allowed by the profile: CLI for Claude Code, Codex, Grok CLI, and Kimi CLI; App for ZCode.
- Grok supports CLI only. ZCode supports App only. Claude App and ZCode App do not accept trailing agent arguments.
- Desktop App launches require that app to be installed and a graphical session to be available.
- Start the CCR service before opening most profiles. Grok CLI and Kimi CLI profiles can start a temporary shared service automatically and stop it after the last managed session exits.

The desktop application installs a related command named `ccr-app`. Commands copied from desktop Agent Config cards use `ccr-app`; the npm package documented here installs `ccr`.

## Configuration And Runtime Files

| Platform | Config directory |
| --- | --- |
| macOS / Linux | `~/.claude-code-router` |
| Windows | `%APPDATA%\claude-code-router` |

Important files include:

- `config.sqlite`: current application configuration.
- `app-data/`: API key, usage, request-log, certificate, and other runtime databases/files.
- `service.json`: state and private token for a detached CLI service.
- `gateway.config.json`: generated gateway runtime configuration.
- `profiles/` and `bin/`: isolated profile configuration and launch wrappers.

Do not edit or copy live SQLite files while CCR is writing to them. Use the UI export feature, or stop CCR before taking a filesystem backup.

## Environment And Security

| Variable | Description |
| --- | --- |
| `CCR_WEB_HOST` | Default management listener when `--host` is omitted. |
| `CCR_WEB_PORT` | Default management port when `--port` is omitted. |
| `CCR_WEB_AUTH_TOKEN` | Fixes the management UI/RPC token instead of generating a random token for the process. |

The authenticated management URL contains `ccr_web_token` in its query string. Treat that URL like a password and avoid copying it into logs, tickets, or shell history. Bind to `127.0.0.1` unless remote access is intentional. For remote access, use a firewall or private network plus TLS at a trusted reverse proxy.

Do not expose the gateway without creating CCR client API keys. Upstream provider credentials are stored in CCR's local data directory, so protect that directory and its backups.

## Troubleshooting

### `ccr` is not found

Confirm Node.js is version 22 or later and that npm's global binary directory is on `PATH`:

```sh
node --version
npm prefix -g
```

Open a new shell after installation if your shell caches command paths.

### The management URL changed ports

The requested port was already occupied. Use the URL printed by CCR, or stop the conflicting process and restart CCR.

### The UI opens but the gateway is unavailable

The management service can run without a usable gateway. Add a provider and model, create a client API key, then start or restart the gateway from **Server**. Check the foreground output from `ccr serve` when diagnosing startup errors.

### A profile cannot be found

Only enabled profiles are launchable. Names are matched without case and sanitized names are accepted, but ambiguous names require the profile ID. Re-save the profile if its generated launcher is missing.

### A background service uses old options

Stop and recreate it:

```sh
ccr stop
ccr start --host 127.0.0.1 --port 3458
```

## Docker

The repository also includes a Docker image for gateway and browser-UI deployments. It does not install the npm `ccr` command into the runtime image. See the [Docker deployment guide](https://github.com/musistudio/claude-code-router/blob/main/docker/README.md).

## License

[MIT](LICENSE)
