---
id: quick-start
title: 快速开始
sidebar_position: 3
---

# 快速开始

5 分钟内启动并运行 Claude Code Router。

## 1. 启动路由器

```bash
ccr start
```

路由器默认将在 `http://localhost:8080` 上启动。

## 2. 配置环境变量

在您的 shell 中设置以下环境变量：

```bash
export ANTHROPIC_API_URL="http://localhost:8080/v1"
export ANTHROPIC_API_KEY="your-provider-api-key"
```

或者使用 `ccr activate` 命令获取环境变量：

```bash
eval "$(ccr activate)"
```

## 3. 使用 Claude Code

现在您可以正常使用 Claude Code：

```bash
claude code
```

您的请求将通过 Claude Code Router 路由到您配置的提供商。

## 4. 配置提供商（可选）

要配置多个提供商或自定义路由，使用：

```bash
ccr model
```

这将打开一个交互式菜单来选择和配置模型。

或者直接编辑配置文件：

```bash
# 在默认编辑器中打开配置
ccr config edit
```

配置文件示例 (`~/.claude-code-router/config.json`)：

```json
{
  "Providers": [
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "your-deepseek-api-key",
      "models": ["deepseek-chat", "deepseek-coder"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat"
  }
}
```

## 下一步

- [基础配置](/zh/docs/config/basic) - 了解配置选项
- [路由配置](/zh/docs/config/routing) - 配置智能路由规则
- [CLI 命令](/zh/docs/cli/start) - 探索所有 CLI 命令
