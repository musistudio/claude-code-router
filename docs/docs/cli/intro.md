---
title: CLI Introduction
---

# CLI Introduction

Claude Code Router CLI (`ccr`) is a command-line tool for managing and controlling the Claude Code Router service.

## Feature Overview

`ccr` provides the following functionality:

- **Service Management**: Start, stop, restart service
- **Configuration Management**: Interactive model selection configuration
- **Status Viewing**: View service running status
- **Code Execution**: Directly execute `claude` command
- **Environment Integration**: Output environment variables for shell integration
- **Web UI**: Open Web management interface
- **Status Bar**: Display customizable session status with `ccr statusline`

## Installation

```bash
npm install -g @musistudio/claude-code-router
```

## Basic Usage

### Configuration

Before using Claude Code Router, you need to configure your providers. You can either:

1. **Edit configuration file directly**: Edit `~/.claude-code-router/config.json` manually
2. **Use Web UI**: Run `ccr ui` to open the web interface and configure visually

After making configuration changes, restart the service:

```bash
ccr restart
```

Or restart directly through the Web UI.

### Start Claude Code

Once configured, you can start Claude Code with:

```bash
ccr code
```

This will launch Claude Code and route your requests through the configured provider.

### Service Management

```bash
ccr start    # Start the router service
ccr status   # View service status
ccr stop     # Stop the router service
ccr restart  # Restart the router service
```

### Web UI

```bash
ccr ui       # Open Web management interface
```

## Configuration File

`ccr` uses the configuration file at `~/.claude-code-router/config.json`

Configure once, and both CLI and Server will use it.

## Next Steps

- [Installation Guide](/docs/cli/installation) - Detailed installation instructions
- [Quick Start](/docs/cli/quick-start) - Get started in 5 minutes
- [Command Reference](/docs/category/cli-commands) - Complete command list
- [Status Line](/docs/cli/commands/statusline) - Customize your status bar
- [Configuration Guide](/docs/category/cli-config) - Configuration file details
