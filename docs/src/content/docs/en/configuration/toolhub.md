---
title: ToolHub
pageTitle: ToolHub
eyebrow: Detailed Configuration
lead: Collapse many MCP servers into one compact entry point so agents lazy-load task-specific tools and save context.
---

## When To Use It

As your MCP setup grows, exposing every tool directly to an agent makes the eager tool list large and easier to misuse. ToolHub exposes one `ccr-toolhub` MCP server with two meta tools:

- `tool_hub.resolve`: searches the available MCP tool catalog for the current task.
- `tool_hub.invoke`: calls a real MCP tool that was selected for this task.

Use ToolHub for tools that are not needed often but are still useful occasionally. It lazy-loads them only when a task actually needs them. The main value is saving context: large low-frequency tool catalogs do not have to stay in the agent's eager tool list, which reduces context use and the chance of selecting the wrong tool. Simple local code, file, or conversation tasks usually do not need ToolHub.

## How It Works

1. Enable ToolHub in **Settings → ToolHub**.
2. Select a configured model as the **Resolver model**. It reads the MCP tool catalog and chooses the tools needed for the task. Prefer `deepseek-v4-flash`, or another stable lightweight model in a similar flash-price tier.
3. Add or import backend MCP servers. ToolHub supports `stdio`, `streamable-http`, and `sse`.
4. Open Claude Code or Codex from CCR. CCR writes the `ccr-toolhub` MCP server into that agent config.
5. When the agent receives a request about external services, installed MCP capabilities, or business APIs, it calls `tool_hub.resolve` first, then uses `tool_hub.invoke` to run the selected tools.

ToolHub combines MCP servers configured on the ToolHub page with compatible global Agent MCP servers from older configs, and excludes `ccr-toolhub` itself to avoid recursive calls.

## Built-In Browser Automation

When ToolHub is enabled in CCR Desktop and **Built-in browser automation** is turned on, agents can use the desktop built-in browser for web tasks. You do not need to add a browser backend on the ToolHub page, and you do not need a separate API key; CCR connects to it through the local gateway authentication path.

To enable it:

1. Open **Settings → ToolHub** and turn on **Enable ToolHub**.
2. Turn on **Built-in browser automation** on the same page. This switch is shown only after ToolHub is enabled.
3. After saving settings, reopen Claude Code or Codex from CCR so the new agent instance loads the latest configuration.

> Already-running agent instances usually do not pick up this switch immediately. Restart the agent instance, or use the agent's own controls to restart ToolHub.

Built-in browser automation is useful for tasks that need real browser state, such as opening sites, reading pages, filling forms, clicking buttons, scrolling, or completing web flows like ordering, booking, lookup, and checkout when no domain-specific capability exists. After it is enabled, the agent can:

- Open or attach built-in browser tabs, then navigate to URLs or search queries.
- Read page content and find buttons, links, form fields, and other page elements.
- Click, type, select, press keys, and scroll page elements.
- Wait for page loads, navigation, dialogs, or human handoff results before continuing.
- Request human help for login, verification codes, CAPTCHA, human checks, or manual confirmation.

When a web flow needs login, verification codes, CAPTCHA, a human check, or manual confirmation, CCR shows the built-in browser window and displays the requested action in the top toolbar. After the user clicks **Done** or **Hide**, the agent receives the result and continues. Handoff waits support up to 10 minutes.

### Chrome Login Import Extension

Built-in browser automation can also import login state for selected domains from system Chrome into CCR's in-app browser. This lets the agent reuse sites where you are already signed in to Chrome. It requires the unpacked Chrome extension in this repository: `extension/chrome`.

Install it:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/chrome` directory.

Import flow:

1. When a task needs existing Chrome login state, the agent can request an import; the user can also click the key button in CCR's in-app browser toolbar.
2. CCR creates a one-time import job and opens a confirmation page. If your default browser is not Chrome, copy the confirmation URL into Chrome with the extension installed.
3. Review the requested domains on the confirmation page, then click **Confirm and Import**.
4. The Chrome extension reads cookies and localStorage for those domains and submits them to CCR. After it completes, the agent can continue the task in the built-in browser.

The extension reads only the domains listed in the CCR import job. It does not enumerate every Chrome cookie. For localStorage, the extension temporarily opens non-active tabs for the selected origins, reads `localStorage`, and closes those tabs. If the confirmation page says the extension does not have site access, allow the extension to access the target domains in Chrome extension settings, reload the unpacked extension, and try again.

> Note: Built-in browser automation depends on CCR Desktop's built-in browser and is only available in the desktop app. CLI, server deployments, and pure web environments do not include this built-in capability; use an external browser automation MCP server instead.

## Options

| Option | Description |
| --- | --- |
| Enable ToolHub | Exposes `ccr-toolhub` to agents. If no backend MCP server is available, CCR does not generate a ToolHub MCP config. |
| Built-in browser automation | Shown only after ToolHub is enabled. Lets agents use CCR Desktop's built-in browser for web tasks. |
| Resolver model | Choose from configured provider models. Prefer `deepseek-v4-flash`, or another stable lightweight model in a similar flash-price tier with enough tool-description understanding. |
| Max tools | Maximum tools returned by one resolve call. Range `1` to `20`, default `10`. |
| Timeout ms | Base timeout for ToolHub resolving and invocation. Range `8000` to `300000`, default `60000`. If a backend MCP server needs a longer request timeout, CCR raises the effective invocation timeout to match the backend. |
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
    "browserAutomation": true,
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

- Agent cannot see ToolHub: make sure ToolHub is enabled and at least one backend MCP server is configured or **Built-in browser automation** is turned on, then reopen Claude Code or Codex from CCR.
- Missing resolver model or API key: select a configured resolver model and confirm the provider credential works.
- The agent cannot use built-in browser automation: make sure you are using CCR Desktop, turned on **Built-in browser automation** in **Settings → ToolHub**, and reopened Claude Code or Codex from CCR. CLI, server deployments, and pure web environments do not include this built-in capability.
- Chrome login import confirmation keeps waiting for the extension: make sure the unpacked `extension/chrome` extension is loaded in Chrome and has site access for the target domains. If your default browser is not Chrome, copy the confirmation URL into Chrome manually.
- No tools are resolved: confirm the MCP server can list tools, improve tool names and descriptions, or increase **Max tools**.
- Calls time out: check ToolHub **Timeout ms** and the backend server request/startup timeouts.
- Import fails: validate JSON, avoid duplicate server names, make sure `stdio` entries have a command and remote entries have a URL.
