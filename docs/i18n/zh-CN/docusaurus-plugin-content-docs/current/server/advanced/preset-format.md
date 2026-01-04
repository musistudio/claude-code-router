---
title: Preset 格式规范
sidebar_position: 4
---

# Preset 格式规范

本文档详细说明了 Preset 配置文件的格式规范、字段定义和使用方法。

## 概述

Preset 是一个预定义的配置包，用于快速配置 Claude Code Router。Preset 以目录形式存储，内部包含一个 `manifest.json` 文件。

### 文件结构

```
~/.claude-code-router/presets/<preset-name>/
└── manifest.json
```

### 存储位置

- **预设目录**: `~/.claude-code-router/presets/<preset-name>/`

## manifest.json 结构

`manifest.json` 是一个扁平化的 JSON 文件（支持 JSON5 格式），包含三个主要部分：

1. **元数据（Metadata）**: 描述预设的基本信息
2. **配置（Configuration）**: 实际的配置内容
3. **动态配置系统**: Schema、Template 和 ConfigMappings

```json
{
  // === 元数据字段 ===
  "name": "my-preset",
  "version": "1.0.0",
  "description": "我的预设配置",
  "author": "作者名",
  "homepage": "https://example.com",
  "repository": "https://github.com/user/repo",
  "license": "MIT",
  "keywords": ["openai", "production"],
  "ccrVersion": "2.0.0",

  // === 配置字段 ===
  "Providers": [...],
  "Router": {...},
  "transformers": [...],
  "StatusLine": {...},
  "PROXY_URL": "...",
  "PORT": 8080,

  // === 动态配置系统 ===
  "schema": [...],
  "template": {...},
  "configMappings": [...],
  "userValues": {...}
}
```

## 元数据字段

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | Preset 名称，唯一标识符 |
| `version` | string | 版本号（遵循 semver 规范） |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | string | Preset 描述 |
| `author` | string | 作者信息 |
| `homepage` | string | 项目主页 URL |
| `repository` | string | 源代码仓库 URL |
| `license` | string | 许可证类型 |
| `keywords` | string[] | 关键词标签 |
| `ccrVersion` | string | 兼容的 CCR 版本 |
| `source` | string | Preset 来源 URL |
| `sourceType` | string | 来源类型（`local`/`gist`/`registry`） |
| `checksum` | string | 内容校验和（SHA256） |

### 元数据示例

```json
{
  "name": "openai-production",
  "version": "1.2.0",
  "description": "OpenAI 生产环境配置，包含代理和多模型支持",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/ccr-presets",
  "repository": "https://github.com/yourname/ccr-presets.git",
  "license": "MIT",
  "keywords": ["openai", "production", "proxy"],
  "ccrVersion": "2.0.0"
}
```

## 配置字段

配置字段直接对应 CCR 的配置文件结构（`config.json`）。

### Providers

Provider 配置数组，定义 LLM 服务提供商。

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "transformer": "anthropic",
      "timeout": 60000,
      "max_retries": 3
    }
  ]
}
```

#### Provider 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Provider 名称（唯一标识） |
| `api_base_url` | string | 是 | API 基础地址 |
| `api_key` | string | 是 | API 密钥（可以是环境变量） |
| `models` | string[] | 是 | 支持的模型列表 |
| `transformer` | string | 否 | 使用的转换器 |
| `timeout` | number | 否 | 超时时间（毫秒） |
| `max_retries` | number | 否 | 最大重试次数 |
| `headers` | object | 否 | 自定义 HTTP 头 |

### Router

路由配置，定义请求如何路由到不同的模型。

```json
{
  "Router": {
    "default": "openai/gpt-4o",
    "background": "openai/gpt-4o-mini",
    "think": "openai/gpt-4o",
    "longContext": "openai/gpt-4o",
    "longContextThreshold": 100000,
    "webSearch": "openai/gpt-4o",
    "image": "openai/gpt-4o"
  }
}
```

#### Router 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `default` | string | 默认路由（格式：`provider,model`） |
| `background` | string | 后台任务路由 |
| `think` | string | 思考模式路由 |
| `longContext` | string | 长上下文路由 |
| `longContextThreshold` | number | 长上下文阈值（token 数） |
| `webSearch` | string | 网络搜索路由 |
| `image` | string | 图像处理路由 |

### Transformers

转换器配置数组，用于处理不同 Provider 的 API 差异。

```json
{
  "transformers": [
    {
      "path": "./transformers/custom-transformer.js",
      "use": ["provider1", "provider2"],
      "options": {
        "max_tokens": 4096
      }
    },
    {
      "use": [
        ["provider3", { "option": "value" }]
      ]
    }
  ]
}
```

#### Transformer 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 自定义转换器路径（相对或绝对） |
| `use` | array | 应用到哪些 Provider |
| `options` | object | 转换器选项 |

### StatusLine

状态栏配置，自定义终端状态显示。

```json
{
  "StatusLine": {
    "default": {
      "modules": [
        {
          "type": "text",
          "text": "CCR",
          "color": "cyan"
        },
        {
          "type": "provider",
          "showModel": true
        },
        {
          "type": "script",
          "scriptPath": "./scripts/status.js"
        }
      ]
    }
  }
}
```

### 其他配置字段

支持所有 `config.json` 中的字段：

```json
{
  "PORT": 8080,
  "HOST": "0.0.0.0",
  "PROXY_URL": "http://127.0.0.1:7890",
  "LOG_LEVEL": "info",
  "NON_INTERACTIVE_MODE": false
}
```

## 动态配置系统

动态配置系统是 CCR 2.0 的核心功能，允许创建可交互的配置模板。

### Schema（配置输入表单）

Schema 定义了安装时需要用户输入的字段。

#### Schema 字段类型

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `password` | 密码输入（隐藏） | API Key、密钥 |
| `input` | 单行文本输入 | URL、名称 |
| `number` | 数字输入 | 端口号、超时时间 |
| `select` | 单选下拉框 | 选择 Provider、模型 |
| `multiselect` | 多选框 | 启用功能列表 |
| `confirm` | 确认框 | 是否启用某功能 |
| `editor` | 多行文本编辑器 | 自定义配置、脚本 |

#### Schema 字段定义

```json
{
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "请输入您的 OpenAI API Key",
      "placeholder": "sk-...",
      "required": true,
      "validator": "^sk-.*"
    },
    {
      "id": "provider",
      "type": "select",
      "label": "选择 Provider",
      "prompt": "选择您主要使用的 LLM 提供商",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "使用 OpenAI 的 GPT 模型"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "使用 DeepSeek 的高性价比模型"
          }
        ]
      },
      "defaultValue": "openai",
      "required": true
    },
    {
      "id": "model",
      "type": "select",
      "label": "模型",
      "prompt": "选择默认使用的模型",
      "options": {
        "type": "models",
        "providerField": "#{provider}"
      },
      "when": {
        "field": "provider",
        "operator": "exists"
      },
      "required": true
    },
    {
      "id": "maxTokens",
      "type": "number",
      "label": "最大 Token 数",
      "prompt": "设置请求的最大 token 数",
      "min": 1,
      "max": 128000,
      "defaultValue": 4096
    },
    {
      "id": "useProxy",
      "type": "confirm",
      "label": "使用代理",
      "prompt": "是否通过代理访问 API？",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "代理地址",
      "prompt": "输入代理服务器地址",
      "placeholder": "http://127.0.0.1:7890",
      "required": true,
      "when": {
        "field": "useProxy",
        "operator": "eq",
        "value": true
      }
    },
    {
      "id": "customConfig",
      "type": "editor",
      "label": "自定义配置",
      "prompt": "输入 JSON 格式的自定义配置",
      "rows": 10
    }
  ]
}
```

#### Schema 字段详细说明

##### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 字段唯一标识符（用于变量引用） |
| `type` | string | 否 | 字段类型（默认 `password`） |
| `label` | string | 否 | 显示标签 |
| `prompt` | string | 否 | 提示信息/描述 |
| `placeholder` | string | 否 | 占位符文本 |

##### 验证字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `required` | boolean | 是否必填（默认 `true`） |
| `validator` | RegExp/string/function | 验证规则 |
| `min` | number | 最小值（number 类型） |
| `max` | number | 最大值（number 类型） |

##### 选项字段（select/multiselect）

| 字段 | 类型 | 说明 |
|------|------|------|
| `options` | array/object | 静态选项数组或动态选项配置 |

##### 条件字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `when` | object/object[] | 显示条件（支持 AND 逻辑） |
| `defaultValue` | any | 默认值 |
| `dependsOn` | string[] | 显式声明依赖字段 |

#### 条件运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | `{"field": "type", "operator": "eq", "value": "openai"}` |
| `ne` | 不等于 | `{"field": "advanced", "operator": "ne", "value": true}` |
| `in` | 包含于（数组） | `{"field": "feature", "operator": "in", "value": ["a", "b"]}` |
| `nin` | 不包含于（数组） | `{"field": "type", "operator": "nin", "value": ["x", "y"]}` |
| `exists` | 字段存在 | `{"field": "apiKey", "operator": "exists"}` |
| `gt` | 大于 | `{"field": "count", "operator": "gt", "value": 0}` |
| `lt` | 小于 | `{"field": "count", "operator": "lt", "value": 100}` |
| `gte` | 大于等于 | `{"field": "count", "operator": "gte", "value": 1}` |
| `lte` | 小于等于 | `{"field": "count", "operator": "lte", "value": 99}` |

#### 动态选项类型

##### static - 静态选项

```json
{
  "options": {
    "type": "static",
    "options": [
      {"label": "选项1", "value": "value1"},
      {"label": "选项2", "value": "value2"}
    ]
  }
}
```

##### providers - 从 Providers 配置提取

```json
{
  "options": {
    "type": "providers"
  }
}
```
自动从 `Providers` 数组中提取 `name` 作为选项。

##### models - 从指定 Provider 的 models 提取

```json
{
  "options": {
    "type": "models",
    "providerField": "#{selectedProvider}"
  }
}
```
根据用户选择的 Provider，动态显示该 Provider 的 models。

### Template（配置模板）

Template 定义了如何根据用户输入生成配置。

#### 变量语法

使用 `#{变量名}` 语法引用用户输入：

```json
{
  "template": {
    "Providers": [
      {
        "name": "#{providerName}",
        "api_base_url": "#{baseUrl}",
        "api_key": "#{apiKey}",
        "models": ["#{defaultModel}"]
      }
    ],
    "Router": {
      "default": "#{providerName}/#{defaultModel}"
    }
  }
}
```

#### Template 示例

```json
{
  "template": {
    "Providers": [
      {
        "name": "#{primaryProvider}",
        "api_base_url": "#{baseUrl}",
        "api_key": "#{apiKey}",
        "models": ["#{defaultModel}"],
        "timeout": #{timeout}
      }
    ],
    "Router": {
      "default": "#{primaryProvider}/#{defaultModel}",
      "background": "#{primaryProvider}/#{backgroundModel}"
    },
    "PROXY_URL": "#{proxyUrl}",
    "PORT": #{port}
  }
}
```

### ConfigMappings（配置映射）

ConfigMappings 用于精确控制用户输入值如何映射到配置的特定位置。

#### ConfigMapping 结构

```json
{
  "configMappings": [
    {
      "target": "Providers[0].api_key",
      "value": "#{apiKey}"
    },
    {
      "target": "PROXY_URL",
      "value": "#{proxyUrl}",
      "when": {
        "field": "useProxy",
        "operator": "eq",
        "value": true
      }
    },
    {
      "target": "PORT",
      "value": 8080
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `target` | string | 目标字段路径（支持数组语法） |
| `value` | string/any | 值来源（变量引用或固定值） |
| `when` | object/object[] | 应用条件 |

#### 目标路径语法

- `Providers[0].api_key` - 第一个 Provider 的 api_key
- `Router.default` - Router 的 default 字段
- `PORT` - 顶层配置字段

### userValues（用户值存储）

userValues 存储用户在安装时填写的值，运行时自动应用。

```json
{
  "userValues": {
    "apiKey": "sk-xxx...",
    "provider": "openai",
    "defaultModel": "gpt-4o",
    "useProxy": true,
    "proxyUrl": "http://127.0.0.1:7890"
  }
}
```

## 敏感字段处理

CCR 会自动识别敏感字段（如 `api_key`、`secret`、`password` 等），并将其替换为环境变量占位符。

### 自动识别的敏感字段

- `api_key`, `apiKey`, `apikey`
- `api_secret`, `apiSecret`
- `secret`, `SECRET`
- `token`, `TOKEN`
- `password`, `PASSWORD`
- `private_key`, `privateKey`
- `access_key`, `accessKey`

### 环境变量占位符格式

```bash
# 推荐格式
${VARIABLE_NAME}

# 也支持
$VARIABLE_NAME
```

### 示例

**原始配置:**
```json
{
  "Providers": [
    {
      "name": "openai",
      "api_key": "sk-abc123..."
    }
  ]
}
```

**导出后:**
```json
{
  "Providers": [
    {
      "name": "openai",
      "api_key": "${OPENAI_API_KEY}"
    }
  ]
}
```

## 完整示例

### 简单预设（无动态配置）

```json
{
  "name": "simple-openai",
  "version": "1.0.0",
  "description": "简单的 OpenAI 配置",
  "author": "Your Name",

  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  ],

  "Router": {
    "default": "openai/gpt-4o",
    "background": "openai/gpt-4o-mini"
  }
}
```

### 高级预设（动态配置）

```json
{
  "name": "multi-provider-advanced",
  "version": "2.0.0",
  "description": "多 Provider 高级配置，支持动态选择和代理",
  "author": "Your Name",
  "keywords": ["openai", "deepseek", "proxy", "multi-provider"],
  "ccrVersion": "2.0.0",

  "schema": [
    {
      "id": "primaryProvider",
      "type": "select",
      "label": "主要 Provider",
      "prompt": "选择您主要使用的 LLM 提供商",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "使用 OpenAI 的 GPT 模型，质量高"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "使用 DeepSeek 的高性价比模型"
          }
        ]
      },
      "required": true,
      "defaultValue": "openai"
    },
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "请输入您的 API Key",
      "placeholder": "sk-...",
      "required": true,
      "validator": "^sk-.+"
    },
    {
      "id": "defaultModel",
      "type": "select",
      "label": "默认模型",
      "prompt": "选择默认使用的模型",
      "options": {
        "type": "static",
        "options": [
          {"label": "GPT-4o", "value": "gpt-4o"},
          {"label": "GPT-4o-mini", "value": "gpt-4o-mini"}
        ]
      },
      "required": true,
      "defaultValue": "gpt-4o",
      "when": {
        "field": "primaryProvider",
        "operator": "eq",
        "value": "openai"
      }
    },
    {
      "id": "backgroundModel",
      "type": "select",
      "label": "后台任务模型",
      "prompt": "选择用于后台任务的轻量级模型",
      "options": {
        "type": "static",
        "options": [
          {"label": "GPT-4o-mini", "value": "gpt-4o-mini"}
        ]
      },
      "required": true,
      "defaultValue": "gpt-4o-mini",
      "when": {
        "field": "primaryProvider",
        "operator": "eq",
        "value": "openai"
      }
    },
    {
      "id": "maxTokens",
      "type": "number",
      "label": "最大 Token 数",
      "prompt": "设置单次请求的最大 token 数",
      "min": 1,
      "max": 128000,
      "defaultValue": 4096
    },
    {
      "id": "timeout",
      "type": "number",
      "label": "超时时间（秒）",
      "prompt": "设置 API 请求超时时间",
      "min": 10,
      "max": 300,
      "defaultValue": 60
    },
    {
      "id": "enableProxy",
      "type": "confirm",
      "label": "启用代理",
      "prompt": "是否通过代理访问 API？",
      "defaultValue": false
    },
    {
      "id": "proxyUrl",
      "type": "input",
      "label": "代理地址",
      "prompt": "输入代理服务器地址",
      "placeholder": "http://127.0.0.1:7890",
      "required": true,
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      },
      "validator": "^https?://.+"
    },
    {
      "id": "features",
      "type": "multiselect",
      "label": "启用功能",
      "prompt": "选择要启用的额外功能",
      "options": {
        "type": "static",
        "options": [
          {"label": "长上下文支持", "value": "longContext"},
          {"label": "网络搜索", "value": "webSearch"},
          {"label": "图像处理", "value": "image"}
        ]
      },
      "defaultValue": []
    }
  ],

  "template": {
    "Providers": [
      {
        "name": "#{primaryProvider}",
        "api_base_url": "#{primaryProvider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions'}",
        "api_key": "#{apiKey}",
        "models": [
          "#{defaultModel}",
          "#{backgroundModel}"
        ],
        "timeout": #{timeout * 1000}
      }
    ],
    "Router": {
      "default": "#{primaryProvider}/#{defaultModel}",
      "background": "#{primaryProvider}/#{backgroundModel}"
    },
    "NON_INTERACTIVE_MODE": false
  },

  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "#{proxyUrl}",
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    },
    {
      "target": "Router.longContext",
      "value": "#{primaryProvider}/#{defaultModel}",
      "when": {
        "field": "features",
        "operator": "in",
        "value": ["longContext"]
      }
    },
    {
      "target": "Router.webSearch",
      "value": "#{primaryProvider}/#{defaultModel}",
      "when": {
        "field": "features",
        "operator": "in",
        "value": ["webSearch"]
      }
    },
    {
      "target": "Router.image",
      "value": "#{primaryProvider}/#{defaultModel}",
      "when": {
        "field": "features",
        "operator": "in",
        "value": ["image"]
      }
    }
  ]
}
```

## 验证规则

### Preset 验证检查项

1. **元数据验证**
   - ✓ `name` 字段存在
   - ✓ `version` 字段存在（警告）

2. **配置验证**
   - ✓ `config` 部分存在
   - ✓ 每个 Provider 有 `name` 字段
   - ✓ 每个 Provider 有 `api_base_url` 字段
   - ✓ 每个 Provider 有 `models` 数组（警告）

3. **Schema 验证**
   - ✓ 字段 `id` 唯一
   - ✓ 条件字段引用存在
   - ✓ 动态选项配置正确

### 错误和警告

**错误（Error）:**
- 缺少必填字段
- Provider 配置不完整
- Schema 字段重复

**警告（Warning）:**
- 缺少可选字段
- Provider 没有 models
- 未使用的 schema 字段

## 最佳实践

### 1. 使用动态配置系统

```json
{
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "required": true
    }
  ],
  "template": {
    "Providers": [
      {
        "api_key": "#{apiKey}"
      }
    ]
  }
}
```

### 2. 提供合理的默认值

```json
{
  "id": "timeout",
  "type": "number",
  "label": "超时时间",
  "defaultValue": 60,
  "min": 10,
  "max": 300
}
```

### 3. 使用条件显示减少不必要的输入

```json
{
  "id": "proxyUrl",
  "type": "input",
  "label": "代理地址",
  "when": {
    "field": "useProxy",
    "operator": "eq",
    "value": true
  }
}
```

### 4. 清晰的标签和提示

```json
{
  "id": "apiKey",
  "type": "password",
  "label": "OpenAI API Key",
  "prompt": "请输入您的 OpenAI API Key（以 sk- 开头）",
  "placeholder": "sk-...",
  "validator": "^sk-.+"
}
```

### 5. 使用验证确保数据质量

```json
{
  "id": "port",
  "type": "number",
  "label": "端口号",
  "min": 1024,
  "max": 65535,
  "validator": (value) => {
    if (value < 1024 || value > 65535) {
      return "端口号必须在 1024-65535 之间";
    }
    return true;
  }
}
```

### 6. 版本控制

遵循 semver 规范：
- `1.0.0` - 初始版本
- `1.1.0` - 新增功能（向后兼容）
- `1.0.1` - Bug 修复
- `2.0.0` - 破坏性变更

### 7. 文档化

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "详细的预设描述，说明用途和特点",
  "author": "作者名 <email@example.com>",
  "homepage": "https://github.com/user/preset",
  "repository": "https://github.com/user/preset.git",
  "keywords": ["openai", "production", "proxy"],
  "license": "MIT"
}
```

### 8. 使用相对路径

对于预设中的自定义文件（如转换器、脚本），使用相对路径：

```json
{
  "transformers": [
    {
      "path": "./transformers/custom.js"
    }
  ],
  "StatusLine": {
    "default": {
      "modules": [
        {
          "type": "script",
          "scriptPath": "./scripts/status.js"
        }
      ]
    }
  }
}
```

相对路径会在安装时自动转换为绝对路径。

## 导出和导入

### 导出当前配置

```bash
ccr preset export my-preset
```

可选项：

```bash
ccr preset export my-preset \
  --description "我的预设" \
  --author "Your Name" \
  --tags "openai,production"
```

### 安装预设

**CLI 方式：**

```bash
# 从本地目录安装
ccr preset install /path/to/preset

# 重新配置已安装的预设
ccr preset install my-preset
```

:::note 注意
CLI 方式**不支持**从 URL 安装。如需从 GitHub 安装，请使用 Web UI 或先克隆到本地。
:::

**Web UI 方式：**

1. 访问 Web UI：`ccr ui`
2. 点击"预设商城"按钮
3. 选择预设或输入 GitHub 仓库 URL
4. 点击安装

### 管理预设

```bash
# 列出所有预设
ccr preset list

# 查看预设信息
ccr preset info my-preset

# 删除预设
ccr preset delete my-preset
```

## 常见问题

### Q: 如何处理多个 Provider？

A: 在 template 中定义多个 Provider，使用条件逻辑：

```json
{
  "schema": [
    {
      "id": "useSecondary",
      "type": "confirm",
      "label": "启用备用 Provider"
    },
    {
      "id": "secondaryKey",
      "type": "password",
      "label": "备用 API Key",
      "when": {
        "field": "useSecondary",
        "operator": "eq",
        "value": true
      }
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "primary",
        "api_key": "#{primaryKey}"
      },
      {
        "name": "secondary",
        "api_key": "#{secondaryKey}"
      }
    ]
  },
  "configMappings": [
    {
      "target": "Providers",
      "value": [
        {
          "name": "primary",
          "api_key": "#{primaryKey}"
        }
      ],
      "when": {
        "field": "useSecondary",
        "operator": "ne",
        "value": true
      }
    }
  ]
}
```

### Q: 如何支持条件配置？

A: 使用 `when` 条件和 `configMappings`：

```json
{
  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "#{proxyUrl}",
      "when": {
        "field": "useProxy",
        "operator": "eq",
        "value": true
      }
    }
  ]
}
```

### Q: 如何验证用户输入？

A: 使用 `validator` 字段：

```json
{
  "id": "url",
  "type": "input",
  "label": "API 地址",
  "validator": "^https?://.+"
}
```

### Q: 如何创建多语言预设？

A: 使用条件选择语言：

```json
{
  "schema": [
    {
      "id": "language",
      "type": "select",
      "label": "语言",
      "options": [
        {"label": "中文", "value": "zh"},
        {"label": "English", "value": "en"}
      ]
    }
  ]
}
```

## 相关文档

- [预设配置使用指南](/zh/docs/advanced/presets)
- [配置基础](/zh/docs/config/basic)
- [Provider 配置](/zh/docs/config/providers)
- [路由配置](/zh/docs/config/routing)
- [转换器配置](/zh/docs/config/transformers)
