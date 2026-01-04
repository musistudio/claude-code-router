---
title: ccr statusline
sidebar_position: 5
---

# ccr statusline

显示可自定义的状态栏，实时展示 Claude Code 会话信息，包括工作区、Git 分支、模型、token 使用情况等。

## 概述

`ccr statusline` 命令从 stdin 读取 JSON 数据，并在终端中渲染格式精美的状态栏。它设计用于与 Claude Code 的 hook 系统集成，以显示实时会话信息。

## 使用方法

### 基本用法

```bash
ccr statusline
```

该命令期望通过 stdin 接收 JSON 数据，通常通过管道从 Claude Code hook 传递：

```bash
echo '{"hook_event_name":"...","session_id":"...","..."}' | ccr statusline
```

### Hook 集成

在您的 Claude Code 设置中配置：

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

## 可用主题

### 默认主题

简洁优雅的主题，使用 Nerd Font 图标和彩色文本：

```
 󰉋 my-project   main  󰚩 claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

### Powerline 主题

vim-powerline 风格，带背景色和箭头分隔符：

```
 󰉋 my-project   main  󰚩 claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

通过在配置中设置 `currentStyle: "powerline"` 激活。

### 简单主题

回退主题，不带图标，适用于不支持 Nerd Font 的终端：

```
my-project  main  claude-3-5-sonnet-20241022  ↑ 12.3k  ↓ 5.2k
```

当 `USE_SIMPLE_ICONS=true` 或在不支持的终端上自动使用。

## 可用模块

状态栏模块显示不同类型的信息：

| 模块 | 说明 | 变量 |
|------|------|------|
| **workDir** | 当前工作目录名称 | `{{workDirName}}` |
| **gitBranch** | 当前 Git 分支 | `{{gitBranch}}` |
| **model** | 使用的模型 | `{{model}}` |
| **usage** | Token 使用情况（输入/输出） | `{{inputTokens}}`, `{{outputTokens}}` |
| **context** | 上下文窗口使用情况 | `{{contextPercent}}`, `{{contextWindowSize}}` |
| **speed** | Token 处理速度 | `{{tokenSpeed}}`, `{{isStreaming}}` |
| **cost** | API 成本 | `{{cost}}` |
| **duration** | 会话持续时间 | `{{duration}}` |
| **lines** | 代码变更 | `{{linesAdded}}`, `{{linesRemoved}}` |
| **script** | 自定义脚本输出 | 动态 |

## 配置

在 `~/.claude-code-router/config.json` 中配置 statusline：

### 默认样式示例

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

### Powerline 样式示例

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

### 完整功能示例

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

## 自定义脚本

您可以通过执行脚本创建自定义模块：

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

脚本格式（CommonJS）：

```javascript
// my-status-module.js
module.exports = function(variables, options) {
  // 访问变量如 model、gitBranch 等
  // 从配置中访问选项
  return `Custom: ${variables.model}`;
};

// 或异步
module.exports = async function(variables, options) {
  const data = await fetchSomeData();
  return data;
};
```

## 颜色选项

### 标准颜色

- `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
- `bright_black`, `bright_red`, `bright_green`, `bright_yellow`, `bright_blue`, `bright_magenta`, `bright_cyan`, `bright_white`

### 背景颜色

添加前缀 `bg_`：`bg_blue`, `bg_bright_red` 等。

### 十六进制颜色

使用 24 位 TrueColor 和十六进制代码：

```json
{
  "color": "#FF5733",
  "background": "bg_#1E90FF"
}
```

## 可用变量

所有变量都可以在模块文本中使用 `{{variableName}}` 访问：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{workDirName}}` | 当前目录名称 | `my-project` |
| `{{gitBranch}}` | Git 分支名称 | `main` |
| `{{model}}` | 模型名称 | `claude-3-5-sonnet-20241022` |
| `{{inputTokens}}` | 输入 tokens（格式化） | `12.3k` |
| `{{outputTokens}}` | 输出 tokens（格式化） | `5.2k` |
| `{{tokenSpeed}}` | 每秒 tokens 数 | `45` |
| `{{isStreaming}}` | 流式传输状态 | `streaming` 或空 |
| `{{contextPercent}}` | 上下文使用百分比 | `45` |
| `{{contextWindowSize}}` | 总上下文窗口 | `200k` |
| `{{cost}}` | 总成本 | `$0.15` |
| `{{duration}}` | 会话持续时间 | `2m34s` |
| `{{linesAdded}}` | 添加的行数 | `150` |
| `{{linesRemoved}}` | 删除的行数 | `25` |
| `{{sessionId}}` | 会话 ID（前 8 个字符） | `a1b2c3d4` |

## 环境变量

使用环境变量控制行为：

| 变量 | 值 | 说明 |
|------|------|------|
| `USE_SIMPLE_ICONS` | `true`/`false` | 强制使用不带图标的简单主题 |
| `NERD_FONT` | 任意值 | 自动检测 Nerd Font 支持 |

## 示例

### 极简状态栏

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

输出：`claude-3-5-sonnet-20241022 ↑12.3k ↓5.2k`

### 开发者生产力重点

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

输出：` feature/auth  📝 +150/-25  ⏱️ 2m34s`

## Preset 集成

Statusline 主题可以包含在 presets 中。当您安装带有 statusline 配置的 preset 时，激活该 preset 时会自动应用。

查看 [Presets](/zh/docs/presets/intro) 了解更多信息。

## 故障排除

### 图标不显示

在环境中设置 `USE_SIMPLE_ICONS=true`：

```bash
export USE_SIMPLE_ICONS=true
```

### 颜色不工作

确保您的终端支持 TrueColor（24 位颜色）：

```bash
export COLORTERM=truecolor
```

### Git 分支不显示

确保您在 Git 仓库中并安装了 `git` 命令。

## 相关命令

- [ccr status](/docs/cli/commands/status) - 检查服务状态
- [ccr preset](/docs/cli/commands/preset) - 管理带 statusline 主题的 presets
