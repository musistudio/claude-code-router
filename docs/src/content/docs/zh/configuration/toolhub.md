---
title: ToolHub
pageTitle: ToolHub
eyebrow: ToolHub
lead: 将多个 MCP server 收束成一个紧凑入口，让 Agent 按任务懒加载需要的工具，减少工具列表占用的上下文。
---

## 适用场景

当你接入的 MCP server 越来越多时，直接把所有工具暴露给 Agent 会让工具列表变长，也更容易选错工具。ToolHub 会向 Agent 暴露一个 `ccr-toolhub` MCP server，里面只有两个元工具：

- `tool_hub.resolve`：根据用户任务和上下文检索可用 MCP 工具。
- `tool_hub.invoke`：调用已经被本轮任务选中的真实 MCP 工具。

它适合把不常用但偶尔会用到的工具统一懒加载，在任务真正需要时才交给 Agent 使用。核心价值是节省上下文：避免把大量低频工具常驻在 Agent 的工具列表里，减少上下文占用和选错工具的概率。简单本地代码、文件或普通聊天任务通常不需要经过 ToolHub。

## 工作方式

1. 在 **设置 → ToolHub** 中启用 ToolHub。
2. 选择一个已配置模型作为 **检索模型**。它负责阅读 MCP 工具目录并挑选本轮任务需要的工具；建议使用 `deepseek-v4-flash`，或同等 Flash 价位、响应稳定的轻量模型。
3. 添加或导入后端 MCP server。ToolHub 支持 `stdio`、`streamable-http` 和 `sse`。
4. 从 CCR 打开 Claude Code 或 Codex。CCR 会在对应 Agent 配置中写入 `ccr-toolhub`。
5. Agent 遇到外部服务、已安装 MCP 能力或业务 API 相关请求时，先调用 `tool_hub.resolve`，再用 `tool_hub.invoke` 执行选中的工具。

ToolHub 会合并 **ToolHub 页面配置的 MCP servers** 和兼容旧配置中的全局 Agent MCP servers，并自动排除 `ccr-toolhub` 自身，避免递归调用。

## 内置浏览器自动化

在 CCR Desktop 中启用 ToolHub，并打开 **内置浏览器自动化** 开关后，Agent 可以使用桌面端内置浏览器完成网页操作。不需要在 ToolHub 页面手动添加浏览器后端，也不需要额外 API Key；CCR 会使用本地网关鉴权连接它。

启用步骤：

1. 打开 **设置 → ToolHub**，先开启 **启用 ToolHub**。
2. 在同一页打开 **内置浏览器自动化** 开关。该开关只会在 ToolHub 已启用时显示。
3. 保存设置后，从 CCR 重新打开 Claude Code 或 Codex，让新的 Agent 实例加载最新配置。

> 已经运行中的 Agent 实例通常不会立即拿到这个开关变化。要让现有会话生效，请重启该 Agent 实例，或使用 Agent 自身能力重启 ToolHub。

内置浏览器自动化适合让 Agent 处理需要真实浏览器状态的任务，例如打开网站、读取页面、填写表单、点击按钮、在页面中滚动，或在没有专用业务能力时完成下单、预约、查询、结账等网页流程。开启后 Agent 可以：

- 打开或附加内置浏览器标签页、导航 URL 或搜索词。
- 读取页面内容，并找到按钮、链接、输入框等页面元素。
- 点击、输入、选择、按键和滚动页面元素。
- 等待页面加载、跳转、弹窗或人类接管结果，再继续后续步骤。
- 在登录、验证码、CAPTCHA、人机验证或人工确认时请求用户接管。

当网页流程需要登录、验证码、CAPTCHA、人机验证或人工确认时，CCR 会显示内置浏览器窗口，并在顶部工具栏提示用户需要完成的步骤。用户点击 **Done** 或 **Hide** 后，Agent 会收到结果并继续执行。接管等待最长支持 10 分钟。

### Chrome 登录态导入扩展

内置浏览器自动化还支持把系统 Chrome 中指定域名的登录状态导入 CCR 内置浏览器。这样 Agent 处理网页任务时，可以复用你已经在 Chrome 中登录过的网站状态。该能力需要安装仓库里的 Chrome 解包扩展：`extension/chrome`。

安装方式：

1. 在 Chrome 打开 `chrome://extensions`。
2. 开启 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择仓库中的 `extension/chrome` 目录。

导入流程：

1. 当任务需要复用 Chrome 登录状态时，Agent 会请求导入；用户也可以在 CCR 内置浏览器工具栏点击钥匙按钮主动发起。
2. CCR 创建一次性导入任务，并打开确认页。请使用已安装扩展的 Chrome 打开确认页 URL。
3. 用户在确认页检查要导入的域名，点击 **Confirm and Import**。
4. Chrome 扩展读取这些域名的 cookies 和 localStorage，提交给 CCR；完成后 Agent 可以继续使用内置浏览器执行任务。

扩展只读取 CCR 导入任务列出的域名，不会枚举 Chrome 中的全部 cookies。读取 localStorage 时，扩展会临时打开对应 origin 的非激活标签页，读取后自动关闭。若确认页提示扩展没有站点访问权限，请在 Chrome 扩展设置中允许该扩展访问目标域名，然后重新加载解包扩展再重试。

> 注意：内置浏览器自动化依赖 CCR Desktop 的内置浏览器，只在桌面端可用。CLI、服务器部署或纯 Web 环境没有这项内置能力，请改用外部浏览器自动化 MCP server。

## 配置项

| 配置项 | 说明 |
| --- | --- |
| 启用 ToolHub | 开启后才会向 Agent 暴露 `ccr-toolhub`。如果没有可用后端 MCP server，CCR 不会生成 ToolHub MCP 配置。 |
| 内置浏览器自动化 | 仅在启用 ToolHub 后显示。开启后让 Agent 可以使用 CCR Desktop 的内置浏览器完成网页操作。 |
| 检索模型 | 从已配置供应商模型中选择。建议使用 `deepseek-v4-flash`，或同等 Flash 价位、响应稳定、工具理解能力足够的轻量模型。 |
| 最大工具数 | 单次解析最多返回的工具数量，范围 `1` 到 `20`，默认 `10`。 |
| 超时毫秒 | ToolHub 解析和调用的基础超时时间，范围 `8000` 到 `300000`，默认 `60000`。如果后端 MCP server 需要更长 request timeout，CCR 会按后端超时自动抬高实际调用超时。 |
| MCP servers | 后端工具来源。每个 server 需要唯一名称，并配置 transport、命令或 URL、环境变量、headers 和超时。 |
| Import JSON | 导入常见 MCP JSON。支持根对象、数组、`mcpServers` 或 `mcp_servers`。 |

## 添加 MCP Server

### stdio

`stdio` 适合本地命令行 MCP server。需要填写：

- **Command**：启动命令，例如 `npx`、`node`、`python`。
- **Arguments**：命令参数。
- **Working directory**：可选工作目录。
- **Stdio message mode**：默认 `content-length`，如果 server 使用逐行 JSON，选择 `newline-json`。
- **Environment variables**：只放这个 MCP server 需要的变量。

### streamable-http / sse

远程 MCP server 需要填写 URL。鉴权可以使用：

- **API key**：直接保存在配置中。
- **API key env**：从环境变量读取。
- **Headers**：添加自定义请求头。

如果远程服务启动慢或请求耗时长，可以单独调高该 server 的 **Startup timeout** 或 **Request timeout**。

## JSON 示例

桌面 App 的 SQLite 配置是当前生效来源，建议优先通过 UI 修改。下面字段适用于备份、迁移或排查时理解 ToolHub 配置结构：

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

导入 MCP JSON 时也可以使用常见格式：

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

## 与 Fusion MCP 的区别

| 能力 | ToolHub | Fusion 自定义 MCP 工具 |
| --- | --- | --- |
| 使用入口 | Agent 侧的 `ccr-toolhub` MCP server | 某个 Fusion 模型内部能力 |
| 工具选择 | 每个任务动态检索并返回工具包 | 模型配置中固定选择工具 |
| 适合场景 | MCP server 很多、工具目录经常变化、希望 Agent 自主发现能力 | 给某个模型补一组明确工具 |
| 可见范围 | 通过 CCR 打开的 Claude Code 或 Codex 配置 | 选择该 Fusion 模型的路由或 Agent |

## 排查

- Agent 看不到 ToolHub：确认已启用 ToolHub，并且至少配置了一个后端 MCP server 或开启了 **内置浏览器自动化**，然后从 CCR 重新打开 Claude Code 或 Codex。
- 提示缺少检索模型或 API Key：在 **检索模型** 中选择已配置模型，并确认供应商凭据可用。
- Agent 无法使用内置浏览器自动化：确认正在使用 CCR Desktop，并且已在 **设置 → ToolHub** 中开启 **内置浏览器自动化**，然后从 CCR 重新打开 Claude Code 或 Codex。CLI、服务器部署或纯 Web 环境没有这项内置能力。
- Chrome 登录态导入确认页一直等待扩展：确认已在 Chrome 中加载 `extension/chrome` 解包扩展，并允许扩展访问要导入的目标域名。请使用 Chrome 打开确认页 URL。
- 解析不到工具：检查 MCP server 是否能正常列出工具，工具名称和描述是否足够清楚，必要时提高 **最大工具数**。
- 调用超时：分别检查 ToolHub 的 **超时毫秒** 和单个 MCP server 的 request/startup timeout。
- 导入失败：检查 JSON 是否有效、server 名称是否重复、`stdio` 是否有 command，远程 transport 是否有 URL。
