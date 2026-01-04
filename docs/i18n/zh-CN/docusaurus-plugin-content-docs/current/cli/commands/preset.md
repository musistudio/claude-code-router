---
sidebar_position: 5
---

# ccr preset

管理预设（Presets）——可共享和重用的配置模板。

## 概述

预设功能让您可以：
- 将当前配置保存为可重用的模板
- 与他人分享配置
- 安装社区提供的预配置方案
- 在不同配置之间轻松切换

## 命令

### export

将当前配置导出为预设。

```bash
ccr preset export <名称> [选项]
```

**选项：**
- `--output <路径>` - 自定义输出目录路径
- `--description <文本>` - 预设描述
- `--author <名称>` - 预设作者
- `--tags <标签>` - 逗号分隔的关键字
- `--include-sensitive` - 包含 API 密钥等敏感数据（不推荐）

**示例：**
```bash
ccr preset export my-config --description "我的生产环境配置" --author "您的名字"
```

**执行过程：**
1. 读取 `~/.claude-code-router/config.json` 中的当前配置
2. 提示输入描述、作者和关键字（如未通过命令行提供）
3. 自动清理敏感字段（API 密钥变为占位符）
4. 在 `~/.claude-code-router/presets/<名称>/` 创建预设目录
5. 生成包含配置和元数据的 `manifest.json`

### install

从本地目录安装预设。

```bash
ccr preset install <来源>
```

**来源：**
- 本地目录路径：`/path/to/preset-directory`
- 预设名称（用于重新配置已安装的预设）：`preset-name`

**示例：**
```bash
# 从目录安装
ccr preset install ./my-preset

# 重新配置已安装的预设
ccr preset install my-preset
```

**执行过程：**
1. 从预设目录读取 `manifest.json`
2. 验证预设结构
3. 如果预设包含 `schema`，提示输入必需的值（API 密钥等）
4. 将预设复制到 `~/.claude-code-router/presets/<名称>/`
5. 在 `manifest.json` 中保存用户输入

**注意：** 目前不支持从 URL 安装。请先下载预设目录。

### list

列出所有已安装的预设。

```bash
ccr preset list
```

**示例输出：**
```
Available presets:

• my-config (v1.0.0)
  My production setup
  by Your Name

• openai-setup
  Basic OpenAI configuration
```

### info

显示预设的详细信息。

```bash
ccr preset info <名称>
```

**显示内容：**
- 版本、描述、作者、关键字
- 配置摘要（Providers、Router 规则）
- 必需输入（如果有）

**示例：**
```bash
ccr preset info my-config
```

### delete / rm / remove

删除已安装的预设。

```bash
ccr preset delete <名称>
ccr preset rm <名称>
ccr preset remove <名称>
```

**示例：**
```bash
ccr preset delete my-config
```

## 预设结构

预设是一个包含 `manifest.json` 文件的目录：

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "我的配置",
  "author": "作者姓名",
  "keywords": ["openai", "production"],

  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "{{apiKey}}",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  ],

  "Router": {
    "default": "openai,gpt-4"
  },

  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "OpenAI API 密钥",
      "prompt": "请输入您的 OpenAI API 密钥"
    }
  ]
}
```

### Schema 系统

`schema` 字段定义用户在安装时必须提供的输入：

**字段类型：**
- `password` - 隐藏输入（用于 API 密钥）
- `input` - 文本输入
- `select` - 单选下拉框
- `multiselect` - 多选下拉框
- `confirm` - 是/否确认
- `editor` - 多行文本编辑器
- `number` - 数字输入

**动态选项：**
```json
{
  "id": "provider",
  "type": "select",
  "label": "选择提供商",
  "options": {
    "type": "providers"
  }
}
```

**条件显示：**
```json
{
  "id": "model",
  "type": "select",
  "label": "选择模型",
  "when": {
    "field": "provider",
    "operator": "exists"
  },
  "options": {
    "type": "models",
    "providerField": "#{selectedProvider}"
  }
}
```

## 分享预设

分享预设的步骤：

1. **导出配置：**
   ```bash
   ccr preset export my-preset
   ```

2. **分享目录：**
   ```bash
   ~/.claude-code-router/presets/my-preset/
   ```

3. **分发方式：**
   - 上传到 GitHub 仓库
   - 创建 GitHub Gist
   - 打包为 zip 文件分享
   - 发布到 npm（未来功能）

4. **用户安装：**
   ```bash
   ccr preset install /path/to/my-preset
   ```

## 安全性

### 自动清理

默认情况下，`export` 会清理敏感字段：
- 名为 `api_key`、`apikey`、`password`、`secret` 的字段会被替换为 `{{字段名}}` 占位符
- 这些占位符会成为 schema 中的必需输入
- 用户在安装时会被提示提供自己的值

### 包含敏感数据

要包含实际值（不推荐）：
```bash
ccr preset export my-preset --include-sensitive
```

**警告：** 永远不要分享包含敏感数据的预设！

## 相关文档

- [配置指南](/zh/docs/cli/config/basic) - 基础配置
- [项目级配置](/zh/docs/cli/config/project-level) - 项目特定设置
- [预设](/zh/docs/presets/intro) - 高级预设主题
