---
title: 预设配置
sidebar_position: 3
---

# 预设配置

使用预定义配置进行快速设置。

## 什么是预设？

预设是预配置的设置，包括针对特定用例优化的提供商配置、路由规则和转换器。

## 使用预设

### CLI 方式（命令行）

CLI 方式适合开发者通过命令行快速操作。

#### 安装预设

**从本地目录安装：**

```bash
ccr preset install /path/to/preset-directory
```

**重新配置已安装的预设：**

```bash
ccr preset install my-preset
```

#### 使用预设

安装预设后，可以使用预设名称启动 Claude Code：

```bash
# 使用指定预设启动
ccr my-preset "your prompt"
```

预设会：
- 自动加载预配置的 Provider
- 应用预设的路由规则
- 使用预设中配置的 transformer

#### 列出所有预设

```bash
ccr preset list
```

此命令将显示所有已安装的预设及其名称、版本和描述。

#### 查看预设信息

```bash
ccr preset info my-preset
```

#### 删除预设

```bash
ccr preset delete my-preset
```

### Web UI 方式

Web UI 提供更友好的可视化界面，支持更多安装方式。

#### 访问 Web UI

```bash
ccr ui
```

然后在浏览器中打开 `http://localhost:3000`

#### 从 GitHub 仓库安装

1. 点击"预设商城"按钮
2. 在预设列表中选择要安装的预设
3. 点击"安装"按钮

#### 重新配置预设

1. 在预设列表中点击"查看详情"按钮
2. 在详情页面中修改配置项
3. 点击"应用"保存配置

#### 管理预设

- **查看**：点击预设右侧的信息图标
- **删除**：点击预设右侧的删除图标

## 创建自定义预设

### 预设目录结构

预设以目录形式存储，每个预设包含以下结构：

```
~/.claude-code-router/presets/<preset-name>/
├── manifest.json           # 必填：预设配置文件
├── transformers/           # 可选：自定义转换器
│   └── custom-transformer.js
├── scripts/               # 可选：自定义脚本
│   └── status.js
└── README.md              # 可选：说明文档
```

### 动态配置系统

CCR 引入了强大的动态配置系统，支持：

- **多种输入类型**：选择器、多选、确认框、文本输入、数字输入等
- **条件逻辑**：根据用户输入动态显示/隐藏配置项
- **变量引用**：配置项之间可以互相引用
- **动态选项**：选项列表可以从预设配置或用户输入中动态生成

#### Schema 字段类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `password` | 密码输入（隐藏显示） | API Key |
| `input` | 单行文本输入 | Base URL |
| `number` | 数字输入 | 最大Token数 |
| `select` | 单选下拉框 | 选择Provider |
| `multiselect` | 多选框 | 启用功能 |
| `confirm` | 确认框 | 是否使用代理 |
| `editor` | 多行文本编辑器 | 自定义配置 |

#### 条件运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | `{"field": "provider", "operator": "eq", "value": "openai"}` |
| `ne` | 不等于 | `{"field": "advanced", "operator": "ne", "value": true}` |
| `in` | 包含于 | `{"field": "feature", "operator": "in", "value": ["a", "b"]}` |
| `nin` | 不包含于 | `{"field": "type", "operator": "nin", "value": ["x", "y"]}` |
| `exists` | 字段存在 | `{"field": "apiKey", "operator": "exists"}` |
| `gt/lt/gte/lte` | 大于/小于/大于等于/小于等于 | 用于数字比较 |

#### 动态选项类型

##### static - 静态选项
```json
"options": {
  "type": "static",
  "options": [
    {"label": "选项1", "value": "value1"},
    {"label": "选项2", "value": "value2"}
  ]
}
```

##### providers - 从 Providers 配置提取
```json
"options": {
  "type": "providers"
}
```
自动从 `Providers` 数组中提取 name 作为选项。

##### models - 从指定 Provider 的 models 提取
```json
"options": {
  "type": "models",
  "providerField": "{{selectedProvider}}"
}
```
根据用户选择的 Provider，动态显示该 Provider 的 models。

#### 模板变量

使用 `{{变量名}}` 语法在 template 中引用用户输入：

```json
"template": {
  "Providers": [
    {
      "name": "{{providerName}}",
      "api_key": "{{apiKey}}"
    }
  ]
}
```

#### 配置映射

对于复杂的配置需求，使用 `configMappings` 精确控制值的位置：

```json
"configMappings": [
  {
    "target": "Providers[0].api_key",
    "value": "{{apiKey}}"
  },
  {
    "target": "PROXY_URL",
    "value": "{{proxyUrl}}",
    "when": {
      "field": "useProxy",
      "operator": "eq",
      "value": true
    }
  }
]
```

#### 完整示例

```json
{
  "name": "multi-provider-example",
  "version": "1.0.0",
  "description": "多Provider配置示例 - 支持OpenAI和DeepSeek切换",
  "author": "CCR Team",
  "keywords": ["openai", "deepseek", "multi-provider"],
  "ccrVersion": "2.0.0",
  "schema": [
    {
      "id": "primaryProvider",
      "type": "select",
      "label": "主要Provider",
      "prompt": "选择您主要使用的LLM提供商",
      "options": {
        "type": "static",
        "options": [
          {
            "label": "OpenAI",
            "value": "openai",
            "description": "使用OpenAI的GPT模型"
          },
          {
            "label": "DeepSeek",
            "value": "deepseek",
            "description": "使用DeepSeek的高性价比模型"
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
      "prompt": "请输入您的API Key",
      "placeholder": "sk-...",
      "required": true
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
      "id": "enableProxy",
      "type": "confirm",
      "label": "启用代理",
      "prompt": "是否通过代理访问API？",
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
      }
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "{{primaryProvider}}",
        "api_base_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "{{apiKey}}",
        "models": ["{{defaultModel}}"]
      }
    ],
    "Router": {
      "default": "{{primaryProvider}},{{defaultModel}}"
    },
    "PROXY_URL": "{{proxyUrl}}"
  },
  "configMappings": [
    {
      "target": "PROXY_URL",
      "value": "{{proxyUrl}}",
      "when": {
        "field": "enableProxy",
        "operator": "eq",
        "value": true
      }
    }
  ]
}
```

### manifest.json 完整字段说明

`manifest.json` 是预设的核心配置文件，使用 JSON5 格式（支持注释）。

#### 1. 元数据字段（Metadata）

这些字段用于描述预设的基本信息：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 预设名称（唯一标识符） |
| `version` | string | ✓ | 版本号（遵循 semver 规范） |
| `description` | string | - | 预设描述 |
| `author` | string | - | 作者信息 |
| `homepage` | string | - | 项目主页 URL |
| `repository` | string | - | 源代码仓库 URL |
| `license` | string | - | 许可证类型 |
| `keywords` | string[] | - | 关键词标签 |
| `ccrVersion` | string | - | 兼容的 CCR 版本 |

示例：

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "我的自定义预设",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/ccr-presets",
  "repository": "https://github.com/yourname/ccr-presets.git",
  "license": "MIT",
  "keywords": ["openai", "production"],
  "ccrVersion": "2.0.0"
}
```

#### 2. 配置字段（Configuration）

这些字段会直接合并到 CCR 的配置中，所有 `config.json` 支持的字段都可以在这里使用：

| 字段 | 类型 | 说明 |
|------|------|------|
| `Providers` | array | Provider 配置数组 |
| `Router` | object | 路由配置 |
| `transformers` | array | 转换器配置 |
| `StatusLine` | object | 状态栏配置 |
| `NON_INTERACTIVE_MODE` | boolean | 启用非交互模式（用于 CI/CD） |

**CLI 专用字段**（这些字段仅在 CLI 模式下有效，服务器不使用）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `noServer` | boolean | 跳过本地服务器启动，直接使用 Provider 的 API |
| `claudeCodeSettings` | object | Claude Code 特定设置（环境变量、状态栏等） |

示例：

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini"
  },
  "PORT": 8080
}
```

#### 3. 动态配置系统字段

这些字段用于创建可交互的配置模板：

| 字段 | 类型 | 说明 |
|------|------|------|
| `schema` | array | 配置输入表单定义 |
| `template` | object | 配置模板（使用变量引用） |
| `configMappings` | array | 配置映射规则 |
| `userValues` | object | 用户填写的值（运行时使用） |

**schema 字段类型：**

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `password` | 密码输入（隐藏） | API Key |
| `input` | 单行文本输入 | URL |
| `number` | 数字输入 | 端口号 |
| `select` | 单选下拉框 | 选择 Provider |
| `multiselect` | 多选框 | 启用功能 |
| `confirm` | 确认框 | 是否启用 |
| `editor` | 多行文本编辑器 | 自定义配置 |

动态配置示例：

```json
{
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "请输入您的 API Key",
      "required": true
    },
    {
      "id": "provider",
      "type": "select",
      "label": "Provider",
      "options": {
        "type": "static",
        "options": [
          {"label": "OpenAI", "value": "openai"},
          {"label": "DeepSeek", "value": "deepseek"}
        ]
      },
      "defaultValue": "openai"
    }
  ],
  "template": {
    "Providers": [
      {
        "name": "#{provider}",
        "api_key": "#{apiKey}"
      }
    ]
  }
}
```

### 创建预设示例

#### 示例 1：简单预设（无动态配置）

```bash
# 创建预设目录
mkdir -p ~/.claude-code-router/presets/simple-openai

# 创建 manifest.json
cat > ~/.claude-code-router/presets/simple-openai/manifest.json << 'EOF'
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
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini"
  }
}
EOF

# 配置预设（输入 API Key）
ccr preset install simple-openai

# 使用预设
ccr simple-openai "your prompt"
```

#### 示例 2：高级预设（动态配置）

```bash
# 创建预设目录
mkdir -p ~/.claude-code-router/presets/advanced-config

# 创建 manifest.json
cat > ~/.claude-code-router/presets/advanced-config/manifest.json << 'EOF'
{
  "name": "advanced-config",
  "version": "1.0.0",
  "description": "支持多 Provider 选择的高级配置",
  "author": "Your Name",
  "keywords": ["openai", "deepseek", "multi-provider"],

  "schema": [
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
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "请输入您的 API Key",
      "placeholder": "sk-...",
      "required": true
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
      }
    }
  ],

  "template": {
    "Providers": [
      {
        "name": "#{provider}",
        "api_base_url": "#{provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/v1/chat/completions'}",
        "api_key": "#{apiKey}",
        "models": ["gpt-4o", "gpt-4o-mini"]
      }
    ],
    "Router": {
      "default": "#{provider},gpt-4o",
      "background": "#{provider},gpt-4o-mini"
    }
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
    }
  ]
}
EOF

# 配置预设（会提示输入）
ccr preset install advanced-config

# 使用预设
ccr advanced-config "your prompt"
```

### 导出当前配置为预设

如果您已经配置好了 CCR，可以导出当前配置：

```bash
# 导出当前配置
ccr preset export my-exported-preset
```

导出时会自动：
- 识别敏感字段（如 `api_key`）并替换为环境变量占位符
- 生成 `schema` 用于收集用户输入
- 生成 `template` 和 `configMappings`

可选项：

```bash
ccr preset export my-exported-preset \
  --description "导出的配置" \
  --author "Your Name" \
  --tags "production,openai"
```

## 预设文件位置

预设保存在：

```
~/.claude-code-router/presets/
```

每个预设都是一个目录，包含 `manifest.json` 文件。

## 最佳实践

1. **使用动态配置**：为需要用户输入的配置项使用schema系统
2. **提供默认值**：为非必填项提供合理的默认值
3. **条件显示**：使用when条件避免不必要的输入
4. **清晰的标签**：为每个字段提供清晰的label和prompt
5. **验证输入**：使用validator确保输入的有效性
6. **版本控制**：将常用预设保存在版本控制中
7. **文档化**：为自定义预设添加描述和版本信息

## 下一步

- [CLI 参考](/zh/docs/cli/start) - 完整的 CLI 命令参考
- [配置](/zh/docs/config/basic) - 详细配置指南
