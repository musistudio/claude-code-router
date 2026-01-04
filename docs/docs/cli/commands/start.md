---
sidebar_position: 1
---

# ccr start

Start the Claude Code Router server.

## Usage

```bash
ccr start [options]
```

## Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--port <number>` | `-p` | Port to listen on (default: 8080) |
| `--config <path>` | `-c` | Path to configuration file |
| `--daemon` | `-d` | Run as daemon (background process) |
| `--log-level <level>` | `-l` | Log level (fatal/error/warn/info/debug/trace) |

## Examples

### Start with default settings

```bash
ccr start
```

### Start on custom port

```bash
ccr start --port 3000
```

### Start with custom config

```bash
ccr start --config /path/to/config.json
```

### Start as daemon

```bash
ccr start --daemon
```

### Start with debug logging

```bash
ccr start --log-level debug
```

## Environment Variables

You can also configure the server using environment variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on |
| `CONFIG_PATH` | Path to configuration file |
| `LOG_LEVEL` | Logging level |
| `CUSTOM_ROUTER_PATH` | Path to custom router function |
| `HOST` | Host to bind to (default: 0.0.0.0) |

## Output

When started successfully, you'll see:

```
Claude Code Router is running on http://localhost:8080
API endpoint: http://localhost:8080/v1
```

## Related Commands

- [ccr stop](/docs/cli/other-commands#ccr-stop) - Stop the server
- [ccr restart](/docs/cli/other-commands#ccr-restart) - Restart the server
- [ccr status](/docs/cli/other-commands#ccr-status) - Check server status
