# CLI 简介

Claude Code Router CLI (`ccr`) 是一个命令行工具，用于管理和控制 Claude Code Router 服务。

## 功能概述

`ccr` 提供以下功能：

- **服务管理**：启动、停止、重启服务
- **配置管理**：交互式配置模型选择
- **状态查看**：查看服务运行状态
- **代码执行**：直接执行 `claude` 命令
- **环境集成**：输出环境变量用于 shell 集成
- **Web UI**：打开 Web 管理界面
- **状态栏**：使用 `ccr statusline` 显示自定义会话状态

## 安装

```bash
npm install -g @musistudio/claude-code-router
```

或使用项目别名：

```bash
npm install -g claude-code-router
```

## 基本使用

### 启动服务

```bash
ccr start
```

### 查看状态

```bash
ccr status
```

### 停止服务

```bash
ccr stop
```

### 查看模型

```bash
ccr model
```

## 与 Claude Code 集成

`ccr` 可以与 Claude Code 无缝集成，将请求路由到你选择的 LLM 提供商。

### 方式一：设置 API 地址

```bash
export ANTHROPIC_BASE_URL="http://localhost:3456/v1"
export ANTHROPIC_API_KEY="your-api-key"
```

### 方式二：使用 activate 命令

```bash
eval "$(ccr activate)"
```

## 配置文件

`ccr` 使用与 Server 相同的配置文件：`~/.claude-code-router/config.json`

配置一次，CLI 和 Server 都会使用。

## 下一步

- [安装指南](/docs/cli/installation) - 详细安装说明
- [快速开始](/docs/cli/quick-start) - 5 分钟上手
- [命令参考](/docs/category/cli-commands) - 完整命令列表
- [状态栏](/docs/cli/commands/statusline) - 自定义状态栏
- [配置说明](/docs/category/cli-config) - 配置文件详解
