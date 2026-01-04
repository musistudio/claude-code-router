---
sidebar_position: 5
---

# ccr statusline

Display a customizable status bar showing real-time information about your Claude Code session, including workspace, Git branch, model, token usage, and more.

## Overview

The `ccr statusline` command reads JSON data from stdin and renders a beautifully formatted status bar in your terminal. It's designed to integrate with Claude Code's hook system to display real-time session information.

## Usage

### Basic Usage

```bash
ccr statusline
```

The command expects JSON data via stdin, typically piped from a Claude Code hook:

```bash
echo '{"hook_event_name":"...","session_id":"...","..."}' | ccr statusline
```

### Hook Integration

Configure in your Claude Code settings:

```json
{
  "hooks": {
    "postResponse": {
      "command": "ccr statusline",
      "input": "json"
    }
  }
}
```

## Available Themes

### Default Theme

A clean, minimal theme with Nerd Font icons and colored text:

```
 󰉋 my-project   main  󰚩 claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

### Powerline Theme

A vim-powerline inspired style with colored backgrounds and arrow separators:

```
 󰉋 my-project   main  󰚩 claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

Activate by setting `currentStyle: "powerline"` in your config.

### Simple Theme

Fallback theme without icons for terminals that don't support Nerd Fonts:

```
my-project  main  claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

Automatically used when `USE_SIMPLE_ICONS=true` or on unsupported terminals.

## Available Modules

Status line modules display different types of information:

| Module | Description | Variables |
|--------|-------------|-----------|
| **workDir** | Current working directory name | `{{workDirName}}` |
| **gitBranch** | Current Git branch | `{{gitBranch}}` |
| **model** | Model being used | `{{model}}` |
| **usage** | Token usage (input/output) | `{{inputTokens}}`, `{{outputTokens}}` |
| **context** | Context window usage | `{{contextPercent}}`, `{{contextWindowSize}}` |
| **speed** | Token processing speed | `{{tokenSpeed}}`, `{{isStreaming}}` |
| **cost** | API cost | `{{cost}}` |
| **duration** | Session duration | `{{duration}}` |
| **lines** | Code changes | `{{linesAdded}}`, `{{linesRemoved}}` |
| **script** | Custom script output | Dynamic |

## Configuration

Configure statusline in `~/.claude-code-router/config.json`:

### Default Style Example

```json
{
  "StatusLine": {
    "currentStyle": "default",
    "default": {
      "modules": [
        {
          "type": "workDir",
          "icon": "󰉋",
          "text": "{{workDirName}}",
          "color": "bright_blue"
        },
        {
          "type": "gitBranch",
          "icon": "",
          "text": "{{gitBranch}}",
          "color": "bright_magenta"
        },
        {
          "type": "model",
          "icon": "󰚩",
          "text": "{{model}}",
          "color": "bright_cyan"
        },
        {
          "type": "usage",
          "icon": "↑",
          "text": "{{inputTokens}}",
          "color": "bright_green"
        },
        {
          "type": "usage",
          "icon": "↓",
          "text": "{{outputTokens}}",
          "color": "bright_yellow"
        }
      ]
    }
  }
}
```

### Powerline Style Example

```json
{
  "StatusLine": {
    "currentStyle": "powerline",
    "powerline": {
      "modules": [
        {
          "type": "workDir",
          "icon": "󰉋",
          "text": "{{workDirName}}",
          "color": "white",
          "background": "bg_bright_blue"
        },
        {
          "type": "gitBranch",
          "icon": "",
          "text": "{{gitBranch}}",
          "color": "white",
          "background": "bg_bright_magenta"
        }
      ]
    }
  }
}
```

### Full Featured Example

```json
{
  "StatusLine": {
    "currentStyle": "default",
    "default": {
      "modules": [
        {
          "type": "workDir",
          "icon": "󰉋",
          "text": "{{workDirName}}",
          "color": "bright_blue"
        },
        {
          "type": "gitBranch",
          "icon": "",
          "text": "{{gitBranch}}",
          "color": "bright_magenta"
        },
        {
          "type": "model",
          "icon": "󰚩",
          "text": "{{model}}",
          "color": "bright_cyan"
        },
        {
          "type": "context",
          "icon": "🪟",
          "text": "{{contextPercent}}% / {{contextWindowSize}}",
          "color": "bright_green"
        },
        {
          "type": "speed",
          "icon": "⚡",
          "text": "{{tokenSpeed}} t/s {{isStreaming}}",
          "color": "bright_yellow"
        },
        {
          "type": "cost",
          "icon": "💰",
          "text": "{{cost}}",
          "color": "bright_magenta"
        },
        {
          "type": "duration",
          "icon": "⏱️",
          "text": "{{duration}}",
          "color": "bright_white"
        },
        {
          "type": "lines",
          "icon": "📝",
          "text": "+{{linesAdded}}/-{{linesRemoved}}",
          "color": "bright_cyan"
        }
      ]
    }
  }
}
```

## Custom Scripts

You can create custom modules by executing scripts:

```json
{
  "type": "script",
  "icon": "🔧",
  "scriptPath": "/path/to/script.js",
  "options": {
    "customOption": "value"
  }
}
```

Script format (CommonJS):

```javascript
// my-status-module.js
module.exports = function(variables, options) {
  // Access variables like model, gitBranch, etc.
  // Access options from configuration
  return `Custom: ${variables.model}`;
};

// Or async
module.exports = async function(variables, options) {
  const data = await fetchSomeData();
  return data;
};
```

## Color Options

### Standard Colors

- `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
- `bright_black`, `bright_red`, `bright_green`, `bright_yellow`, `bright_blue`, `bright_magenta`, `bright_cyan`, `bright_white`

### Background Colors

Prefix with `bg_`: `bg_blue`, `bg_bright_red`, etc.

### Hexadecimal Colors

Use 24-bit TrueColor with hex codes:

```json
{
  "color": "#FF5733",
  "background": "bg_#1E90FF"
}
```

## Available Variables

All variables are accessible in module text using `{{variableName}}`:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{workDirName}}` | Current directory name | `my-project` |
| `{{gitBranch}}` | Git branch name | `main` |
| `{{model}}` | Model name | `claude-3-5-sonnet-20241022` |
| `{{inputTokens}}` | Input tokens (formatted) | `12.3k` |
| `{{outputTokens}}` | Output tokens (formatted) | `5.2k` |
| `{{tokenSpeed}}` | Tokens per second | `45` |
| `{{isStreaming}}` | Streaming status | `streaming` or empty |
| `{{contextPercent}}` | Context usage percentage | `45` |
| `{{contextWindowSize}}` | Total context window | `200k` |
| `{{cost}}` | Total cost | `$0.15` |
| `{{duration}}` | Session duration | `2m34s` |
| `{{linesAdded}}` | Lines added | `150` |
| `{{linesRemoved}}` | Lines removed | `25` |
| `{{sessionId}}` | Session ID (first 8 chars) | `a1b2c3d4` |

## Environment Variables

Control behavior with environment variables:

| Variable | Values | Description |
|----------|--------|-------------|
| `USE_SIMPLE_ICONS` | `true`/`false` | Force simple theme without icons |
| `NERD_FONT` | Any value | Auto-detect Nerd Font support |

## Examples

### Minimal Status Line

```json
{
  "StatusLine": {
    "default": {
      "modules": [
        {
          "type": "model",
          "text": "{{model}}"
        },
        {
          "type": "usage",
          "text": "↑{{inputTokens}} ↓{{outputTokens}}"
        }
      ]
    }
  }
}
```

Output: `claude-3-5-sonnet-20241022 ↑12.3k ↓5.2k`

### Developer Productivity Focus

```json
{
  "StatusLine": {
    "default": {
      "modules": [
        {
          "type": "gitBranch",
          "icon": "",
          "text": "{{gitBranch}}",
          "color": "bright_magenta"
        },
        {
          "type": "lines",
          "icon": "📝",
          "text": "+{{linesAdded}}/-{{linesRemoved}}",
          "color": "bright_cyan"
        },
        {
          "type": "duration",
          "icon": "⏱️",
          "text": "{{duration}}",
          "color": "bright_white"
        }
      ]
    }
  }
}
```

Output: ` feature/auth  📝 +150/-25  ⏱️ 2m34s`

## Preset Integration

Statusline themes can be included in presets. When you install a preset with statusline configuration, it will automatically apply when you activate that preset.

See [Presets](/docs/presets/intro) for more information.

## Troubleshooting

### Icons Not Displaying

Set `USE_SIMPLE_ICONS=true` in your environment:

```bash
export USE_SIMPLE_ICONS=true
```

### Colors Not Working

Ensure your terminal supports TrueColor (24-bit color):

```bash
export COLORTERM=truecolor
```

### Git Branch Not Showing

Ensure you're in a Git repository and have the `git` command installed.

## Related Commands

- [ccr status](/docs/cli/commands/status) - Check server status
- [ccr preset](/docs/cli/commands/preset) - Manage presets with statusline themes
