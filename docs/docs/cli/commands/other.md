---
sidebar_position: 4
---

# Other Commands

Additional CLI commands for managing Claude Code Router.

## ccr stop

Stop the running server.

```bash
ccr stop
```

## ccr restart

Restart the server.

```bash
ccr restart
```

## ccr code

Execute a claude command through the router.

```bash
ccr code [args...]
```

## ccr ui

Open the Web UI in your browser.

```bash
ccr ui
```

## ccr activate

Output shell environment variables for integration with external tools.

```bash
ccr activate
```

## Global Options

These options can be used with any command:

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help |
| `-v, --version` | Show version number |
| `--config <path>` | Path to configuration file |
| `--verbose` | Enable verbose output |

## Examples

### Stop the server

```bash
ccr stop
```

### Restart with custom config

```bash
ccr restart --config /path/to/config.json
```

### Open Web UI

```bash
ccr ui
```

## Related Documentation

- [Getting Started](/docs/intro) - Introduction to Claude Code Router
- [Configuration](/docs/config/basic) - Configuration guide
