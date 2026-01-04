---
id: cli/model
title: ccr model
sidebar_position: 2
---

# ccr model

交互式模型选择和配置。

## 用法

```bash
ccr model [命令]
```

## 命令

### 选择模型

交互式选择模型：

```bash
ccr model
```

这将显示一个包含可用提供商和模型的交互式菜单。

### 设置默认模型

直接设置默认模型：

```bash
ccr model set <provider>,<model>
```

示例：

```bash
ccr model set deepseek,deepseek-chat
```

### 列出模型

列出所有配置的模型：

```bash
ccr model list
```

### 添加模型

添加新模型到配置：

```bash
ccr model add <provider>,<model>
```

示例：

```bash
ccr model add groq,llama-3.3-70b-versatile
```

### 删除模型

从配置中删除模型：

```bash
ccr model remove <provider>,<model>
```

## 示例

### 交互式选择

```bash
$ ccr model

? 选择一个提供商: deepseek
? 选择一个模型: deepseek-chat

默认模型设置为: deepseek,deepseek-chat
```

### 直接配置

```bash
ccr model set deepseek,deepseek-chat
```

### 查看当前配置

```bash
ccr model list
```

输出：

```
已配置的模型:
  deepseek,deepseek-chat (默认)
  groq,llama-3.3-70b-versatile
  gemini,gemini-2.5-pro
```

## 交互式功能

`ccr model` 命令提供以下功能：

1. **查看当前配置**：查看所有已配置的模型和路由器设置
2. **切换模型**：快速更改每个路由器类型使用的模型
3. **添加新模型**：向现有提供商添加模型
4. **创建新提供商**：设置完整的提供商配置，包括：
   - 提供商名称和 API 端点
   - API 密钥
   - 可用模型
   - 转换器配置，支持：
     - 多个转换器（openrouter、deepseek、gemini 等）
     - 转换器选项（例如，带自定义限制的 maxtoken）
     - 提供商特定路由（例如，OpenRouter 提供商偏好）

CLI 工具会验证所有输入并提供有用的提示来引导您完成配置过程，使管理复杂设置变得容易，无需手动编辑 JSON 文件。

## 相关命令

- [ccr start](/zh/docs/cli/start) - 启动服务器
- [ccr config](/zh/docs/cli/other-commands#ccr-config) - 编辑配置
