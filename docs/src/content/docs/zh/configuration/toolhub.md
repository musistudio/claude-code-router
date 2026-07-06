---
title: ToolHub
pageTitle: ToolHub
eyebrow: 详细配置
lead: 将多个 MCP server 收束成一个紧凑入口，让 Agent 先按任务检索需要的工具，再通过 ToolHub 调用真实工具。
---

## 适用场景

当你接入的 MCP server 越来越多时，直接把所有工具暴露给 Agent 会让工具列表变长，也更容易选错工具。ToolHub 会向 Agent 暴露一个 `ccr-toolhub` MCP server，里面只有两个元工具：

- `tool_hub.resolve`：根据用户任务和上下文检索可用 MCP 工具。
- `tool_hub.invoke`：调用已经被本轮任务选中的真实 MCP 工具。

它适合把内部系统、业务 API、浏览器自动化、订单/账户/门店/优惠券等工具统一交给 Agent 使用。简单本地代码、文件或普通聊天任务通常不需要经过 ToolHub。

## 工作方式

1. 在 **设置 → ToolHub** 中启用 ToolHub。
2. 选择一个已配置模型作为 **检索模型**。它负责阅读 MCP 工具目录并挑选本轮任务需要的工具。
3. 添加或导入后端 MCP server。ToolHub 支持 `stdio`、`streamable-http` 和 `sse`。
4. 从 CCR 打开 Claude Code 或 Codex。CCR 会在对应 Agent 配置中写入 `ccr-toolhub`。
5. Agent 遇到外部服务、已安装 MCP 能力或业务 API 相关请求时，先调用 `tool_hub.resolve`，再用 `tool_hub.invoke` 执行选中的工具。

ToolHub 会合并 **ToolHub 页面配置的 MCP servers** 和兼容旧配置中的全局 Agent MCP servers，并自动排除 `ccr-toolhub` 自身，避免递归调用。

## 配置项

| 配置项 | 说明 |
| --- | --- |
| 启用 ToolHub | 开启后才会向 Agent 暴露 `ccr-toolhub`。如果没有可用后端 MCP server，CCR 不会生成 ToolHub MCP 配置。 |
| 检索模型 | 从已配置供应商模型中选择。建议选择响应稳定、工具理解能力好的模型。 |
| 最大工具数 | 单次解析最多返回的工具数量，范围 `1` 到 `20`，默认 `10`。 |
| 超时毫秒 | ToolHub 解析和调用的总超时时间，范围 `8000` 到 `300000`，默认 `60000`。 |
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

- Agent 看不到 ToolHub：确认已启用 ToolHub、至少配置了一个后端 MCP server，并从 CCR 重新打开 Claude Code 或 Codex。
- 提示缺少检索模型或 API Key：在 **检索模型** 中选择已配置模型，并确认供应商凭据可用。
- 解析不到工具：检查 MCP server 是否能正常列出工具，工具名称和描述是否足够清楚，必要时提高 **最大工具数**。
- 调用超时：分别检查 ToolHub 的 **超时毫秒** 和单个 MCP server 的 request/startup timeout。
- 导入失败：检查 JSON 是否有效、server 名称是否重复、`stdio` 是否有 command，远程 transport 是否有 URL。
