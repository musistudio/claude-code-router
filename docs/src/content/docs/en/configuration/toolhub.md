---
title: ToolHub
pageTitle: ToolHub
eyebrow: Detailed Configuration
lead: Collapse many MCP servers into one compact entry point, then let the agent resolve the tools it needs for each task before invoking the real backend tool.
---

## When To Use It

As your MCP setup grows, exposing every tool directly to an agent makes the eager tool list large and easier to misuse. ToolHub exposes one `ccr-toolhub` MCP server with two meta tools:

- `tool_hub.resolve`: searches the available MCP tool catalog for the current task.
- `tool_hub.invoke`: calls a real MCP tool that was selected for this task.

Use ToolHub for internal systems, business APIs, browser automation, orders, accounts, stores, coupons, and other external capabilities. Simple local code, file, or conversation tasks usually do not need ToolHub.

## How It Works

1. Enable ToolHub in **Settings → ToolHub**.
2. Select a configured model as the **Resolver model**. It reads the MCP tool catalog and chooses the tools needed for the task.
3. Add or import backend MCP servers. ToolHub supports `stdio`, `streamable-http`, and `sse`.
4. Open Claude Code or Codex from CCR. CCR writes the `ccr-toolhub` MCP server into that agent config.
5. When the agent receives a request about external services, installed MCP capabilities, or business APIs, it calls `tool_hub.resolve` first, then uses `tool_hub.invoke` to run the selected tools.

ToolHub combines MCP servers configured on the ToolHub page with compatible global Agent MCP servers from older configs, and excludes `ccr-toolhub` itself to avoid recursive calls.

## Options

| Option | Description |
| --- | --- |
| Enable ToolHub | Exposes `ccr-toolhub` to agents. If no backend MCP server is available, CCR does not generate a ToolHub MCP config. |
| Resolver model | Choose from configured provider models. Prefer a stable model that understands tool descriptions well. |
| Max tools | Maximum tools returned by one resolve call. Range `1` to `20`, default `10`. |
| Timeout ms | Overall timeout for ToolHub resolving and invocation. Range `8000` to `300000`, default `60000`. |
| MCP servers | Backend tool sources. Each server needs a unique name plus transport, command or URL, environment variables, headers, and timeouts. |
| Import JSON | Imports common MCP JSON shapes. Supports a root object, array, `mcpServers`, or `mcp_servers`. |

## Add MCP Servers

### stdio

Use `stdio` for local command-line MCP servers. Configure:

- **Command**: launch command, such as `npx`, `node`, or `python`.
- **Arguments**: command arguments.
- **Working directory**: optional working directory.
- **Stdio message mode**: keep `content-length` by default; use `newline-json` for line-delimited JSON servers.
- **Environment variables**: variables needed only by this MCP server.

### streamable-http / sse

Remote MCP servers need a URL. Authentication can use:

- **API key**: stored directly in the config.
- **API key env**: read from an environment variable.
- **Headers**: custom request headers.

If a remote server starts slowly or has long-running calls, adjust that server's **Startup timeout** or **Request timeout**.

## JSON Example

The desktop app's SQLite config is the effective source, so prefer editing through the UI. The fields below are useful for backups, migration, or troubleshooting:

```json
{
  "toolHub": {
    "enabled": true,
    "llm": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-5-mini"
    },
    "maxTools": 10,
    "requestTimeoutMs": 60000,
    "mcpServers": [
      {
        "name": "filesystem",
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": {},
        "stdioMessageMode": "content-length",
        "requestTimeoutMs": 30000,
        "startupTimeoutMs": 600000
      }
    ]
  }
}
```

The import dialog also accepts common MCP JSON:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

## ToolHub vs Fusion MCP

| Capability | ToolHub | Fusion Custom MCP Tool |
| --- | --- | --- |
| Entry point | Agent-side `ccr-toolhub` MCP server | Capability inside one Fusion model |
| Tool selection | Dynamically resolves a tool bundle for each task | Fixed tools selected in the model config |
| Best for | Many MCP servers, changing tool catalogs, agent-led capability discovery | Adding a known tool set to one model |
| Visibility | Claude Code or Codex configs opened through CCR | Routes or agents that select that Fusion model |

## Troubleshooting

- Agent cannot see ToolHub: make sure ToolHub is enabled, at least one backend MCP server is configured, and reopen Claude Code or Codex from CCR.
- Missing resolver model or API key: select a configured resolver model and confirm the provider credential works.
- No tools are resolved: confirm the MCP server can list tools, improve tool names and descriptions, or increase **Max tools**.
- Calls time out: check ToolHub **Timeout ms** and the backend server request/startup timeouts.
- Import fails: validate JSON, avoid duplicate server names, make sure `stdio` entries have a command and remote entries have a URL.
