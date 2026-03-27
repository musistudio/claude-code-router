![](blog/images/claude-code-router-img.png)

[![](https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat)](README.md)
[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white)](https://discord.gg/rdftVMaUcS)
[![](https://img.shields.io/github/license/musistudio/claude-code-router)](https://github.com/musistudio/claude-code-router/blob/main/LICENSE)

<hr>

![](blog/images/sponsors/glm-zh.jpg)
> 本项目由 Z智谱 提供赞助, 他们通过 GLM CODING PLAN 对本项目提供技术支持。
> GLM CODING PLAN 是专为AI编码打造的订阅套餐，每月最低仅需20元，即可在十余款主流AI编码工具如 Claude Code、Cline、Roo Code 中畅享智谱旗舰模型GLM-4.7（受限于算力，目前仅限Pro用户开放），为开发者提供顶尖的编码体验。
> 智谱AI为本产品提供了特别优惠，使用以下链接购买可以享受九折优惠：https://www.bigmodel.cn/claude-code?ic=RRVJPB5SII

> [从CLI工具风格看工具渐进式披露](/blog/zh/从CLI工具风格看工具渐进式披露.md)

> 一款强大的工具，可将 Claude Code 请求路由到不同的模型，并自定义任何请求。

![](blog/images/claude-code.png)


## ✨ 功能

-   **模型路由**: 根据您的需求将请求路由到不同的模型（例如，后台任务、思考、长上下文）。
-   **多提供商支持**: 支持 OpenRouter、DeepSeek、Ollama、Gemini、Volcengine 和 SiliconFlow 等各种模型提供商。
-   **请求/响应转换**: 使用转换器为不同的提供商自定义请求和响应。
-   **动态模型切换**: 在 Claude Code 中使用 `/model` 命令动态切换模型。
-   **GitHub Actions 集成**: 在您的 GitHub 工作流程中触发 Claude Code 任务。
-   **插件系统**: 使用自定义转换器扩展功能。

## 🚀 快速入门

### ⚡ 一键安装（推荐）

使用 `install.sh` 脚本可以自动完成所有安装和配置步骤，无需手动操作：

```shell
# 下载并执行安装脚本
curl -fsSL https://raw.githubusercontent.com/w13263569508-crypto/claude-code-router/main/install.sh | bash
```

或者克隆仓库后本地执行：

```shell
git clone https://github.com/w13263569508-crypto/claude-code-router.git
cd claude-code-router
chmod +x install.sh
./install.sh
```

安装脚本会自动完成：
- ✅ 检测运行环境（Node.js / npm）
- ✅ 安装 Claude Code
- ✅ 安装 Claude Code Router（CCR）
- ✅ 交互式配置 Provider、API Key、模型和路由规则
- ✅ 生成 `~/.claude-code-router/config.json`
- ✅ 同步默认模型到 `~/.claude/settings.json`
- ✅ 创建 `/ccr-model` Skill（在 Claude Code 中快速切换模型）

安装完成后按提示执行：

```shell
ccr restart   # 启动服务
ccr status    # 确认服务状态
ccr code      # 开启 Claude Code
```

---

### 手动安装

### 1. 安装

首先，请确保您已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart)：

```shell
npm install -g @anthropic-ai/claude-code
```

然后，安装 Claude Code Router：

```shell
npm install -g @musistudio/claude-code-router
```

### 2. 配置

创建并配置您的 `~/.claude-code-router/config.json` 文件。有关更多详细信息，您可以参考 `config.example.json`。

`config.json` 文件有几个关键部分：
- **`PROXY_URL`** (可选): 您可以为 API 请求设置代理，例如：`"PROXY_URL": "http://127.0.0.1:7890"`。
- **`LOG`** (可选): 您可以通过将其设置为 `true` 来启用日志记录。当设置为 `false` 时，将不会创建日志文件。默认值为 `true`。
- **`LOG_LEVEL`** (可选): 设置日志级别。可用选项包括：`"fatal"`、`"error"`、`"warn"`、`"info"`、`"debug"`、`"trace"`。默认值为 `"debug"`。
- **日志系统**: Claude Code Router 使用两个独立的日志系统：
  - **服务器级别日志**: HTTP 请求、API 调用和服务器事件使用 pino 记录在 `~/.claude-code-router/logs/` 目录中，文件名类似于 `ccr-*.log`
  - **应用程序级别日志**: 路由决策和业务逻辑事件记录在 `~/.claude-code-router/claude-code-router.log` 文件中
- **`APIKEY`** (可选): 您可以设置一个密钥来进行身份验证。设置后，客户端请求必须在 `Authorization` 请求头 (例如, `Bearer your-secret-key`) 或 `x-api-key` 请求头中提供此密钥。例如：`"APIKEY": "your-secret-key"`。
- **`HOST`** (可选): 您可以设置服务的主机地址。如果未设置 `APIKEY`，出于安全考虑，主机地址将强制设置为 `127.0.0.1`，以防止未经授权的访问。例如：`"HOST": "0.0.0.0"`。
- **`NON_INTERACTIVE_MODE`** (可选): 当设置为 `true` 时，启用与非交互式环境（如 GitHub Actions、Docker 容器或其他 CI/CD 系统）的兼容性。这会设置适当的环境变量（`CI=true`、`FORCE_COLOR=0` 等）并配置 stdin 处理，以防止进程在自动化环境中挂起。例如：`"NON_INTERACTIVE_MODE": true`。
- **`Providers`**: 用于配置不同的模型提供商。
- **`Router`**: 用于设置路由规则。`default` 指定默认模型，如果未配置其他路由，则该模型将用于所有请求。
- **`API_TIMEOUT_MS`**: API 请求超时时间，单位为毫秒。

这是一个综合示例：

```json
{
  "APIKEY": "your-secret-key",
  "PROXY_URL": "http://127.0.0.1:7890",
  "LOG": true,
  "API_TIMEOUT_MS": 600000,
  "NON_INTERACTIVE_MODE": false,
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": [
        "google/gemini-2.5-pro-preview",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3.7-sonnet:thinking"
      ],
      "transformer": {
        "use": ["openrouter"]
      }
    },
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "sk-xxx",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek"],
        "deepseek-chat": {
          "use": ["tooluse"]
        }
      }
    },
    {
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    },
    {
      "name": "gemini",
      "api_base_url": "https://generativelanguage.googleapis.com/v1beta/models/",
      "api_key": "sk-xxx",
      "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
      "transformer": {
        "use": ["gemini"]
      }
    },
    {
      "name": "volcengine",
      "api_base_url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      "api_key": "sk-xxx",
      "models": ["deepseek-v3-250324", "deepseek-r1-250528"],
      "transformer": {
        "use": ["deepseek"]
      }
    },
    {
      "name": "modelscope",
      "api_base_url": "https://api-inference.modelscope.cn/v1/chat/completions",
      "api_key": "",
      "models": ["Qwen/Qwen3-Coder-480B-A35B-Instruct", "Qwen/Qwen3-235B-A22B-Thinking-2507"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool"
        ],
        "Qwen/Qwen3-235B-A22B-Thinking-2507": {
          "use": ["reasoning"]
        }
      }
    },
    {
      "name": "dashscope",
      "api_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "api_key": "",
      "models": ["qwen3-coder-plus"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool"
        ]
      }
    },
    {
      "name": "aihubmix",
      "api_base_url": "https://aihubmix.com/v1/chat/completions",
      "api_key": "sk-",
      "models": [
        "Z/glm-4.5",
        "claude-opus-4-20250514",
        "gemini-2.5-pro"
      ]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "gemini,gemini-2.5-flash"
  }
}
```


### 3. 使用 Router 运行 Claude Code

使用 router 启动 Claude Code：

```shell
ccr code
```

> **注意**: 修改配置文件后，需要重启服务使配置生效：
> ```shell
> ccr restart
> ```

### 4. UI 模式

为了获得更直观的体验，您可以使用 UI 模式来管理您的配置：

```shell
ccr ui
```

这将打开一个基于 Web 的界面，您可以在其中轻松查看和编辑您的 `config.json` 文件。

![UI](/blog/images/ui.png)

### 5. CLI 模型管理

对于偏好终端工作流的用户，可以使用交互式 CLI 模型选择器：

```shell
ccr model
```

该命令提供交互式界面来：

- 查看当前配置
- 查看所有配置的模型（default、background、think、longContext、webSearch、image）
- 切换模型：快速更改每个路由器类型使用的模型
- 添加新模型：向现有提供商添加模型
- 创建新提供商：设置完整的提供商配置，包括：
   - 提供商名称和 API 端点
   - API 密钥
   - 可用模型
   - Transformer 配置，支持：
     - 多个转换器（openrouter、deepseek、gemini 等）
     - Transformer 选项（例如，带自定义限制的 maxtoken）
     - 特定于提供商的路由（例如，OpenRouter 提供商偏好）

CLI 工具验证所有输入并提供有用的提示来引导您完成配置过程，使管理复杂的设置变得容易，无需手动编辑 JSON 文件。

### 6. 预设管理

预设允许您轻松保存、共享和重用配置。您可以将当前配置导出为预设，并从文件或 URL 安装预设。

```shell
# 将当前配置导出为预设
ccr preset export my-preset

# 使用元数据导出
ccr preset export my-preset --description "我的 OpenAI 配置" --author "您的名字" --tags "openai,生产环境"

# 从本地目录安装预设
ccr preset install /path/to/preset

# 列出所有已安装的预设
ccr preset list

# 显示预设信息
ccr preset info my-preset

# 删除预设
ccr preset delete my-preset
```

**预设功能：**
- **导出**：将当前配置保存为预设目录（包含 manifest.json）
- **安装**：从本地目录安装预设
- **敏感数据处理**：导出期间自动清理 API 密钥和其他敏感数据（标记为 `{{field}}` 占位符）
- **动态配置**：预设可以包含输入架构，用于在安装期间收集所需信息
- **版本控制**：每个预设包含版本元数据，用于跟踪更新

**预设文件结构：**
```
~/.claude-code-router/presets/
├── my-preset/
│   └── manifest.json    # 包含配置和元数据
```

### 7. Activate 命令（环境变量设置）

`activate` 命令允许您在 shell 中全局设置环境变量，使您能够直接使用 `claude` 命令或将 Claude Code Router 与使用 Agent SDK 构建的应用程序集成。

要激活环境变量，请运行：

```shell
eval "$(ccr activate)"
```

此命令会以 shell 友好的格式输出必要的环境变量，这些变量将在当前的 shell 会话中设置。激活后，您可以：

- **直接使用 `claude` 命令**：无需使用 `ccr code` 即可运行 `claude` 命令。`claude` 命令将自动通过 Claude Code Router 路由请求。
- **与 Agent SDK 应用程序集成**：使用 Anthropic Agent SDK 构建的应用程序将自动使用配置的路由器和模型。

`activate` 命令设置以下环境变量：

- `ANTHROPIC_AUTH_TOKEN`: 来自配置的 API 密钥
- `ANTHROPIC_BASE_URL`: 本地路由器端点（默认：`http://127.0.0.1:3456`）
- `NO_PROXY`: 设置为 `127.0.0.1` 以防止代理干扰
- `DISABLE_TELEMETRY`: 禁用遥测
- `DISABLE_COST_WARNINGS`: 禁用成本警告
- `API_TIMEOUT_MS`: 来自配置的 API 超时时间

> **注意**：在使用激活的环境变量之前，请确保 Claude Code Router 服务正在运行（`ccr start`）。环境变量仅在当前 shell 会话中有效。要使其持久化，您可以将 `eval "$(ccr activate)"` 添加到您的 shell 配置文件（例如 `~/.zshrc` 或 `~/.bashrc`）中。

#### Providers

`Providers` 数组是您定义要使用的不同模型提供商的地方。每个提供商对象都需要：

-   `name`: 提供商的唯一名称。
-   `api_base_url`: 聊天补全的完整 API 端点。
-   `api_key`: 您提供商的 API 密钥。
-   `models`: 此提供商可用的模型名称列表。
-   `transformer` (可选): 指定用于处理请求和响应的转换器。

#### Transformers

Transformers 允许您修改请求和响应负载，以确保与不同提供商 API 的兼容性。

-   **全局 Transformer**: 将转换器应用于提供商的所有模型。在此示例中，`openrouter` 转换器将应用于 `openrouter` 提供商下的所有模型。
    ```json
     {
       "name": "openrouter",
       "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
       "api_key": "sk-xxx",
       "models": [
         "google/gemini-2.5-pro-preview",
         "anthropic/claude-sonnet-4",
         "anthropic/claude-3.5-sonnet"
       ],
       "transformer": { "use": ["openrouter"] }
     }
    ```
-   **特定于模型的 Transformer**: 将转换器应用于特定模型。在此示例中，`deepseek` 转换器应用于所有模型，而额外的 `tooluse` 转换器仅应用于 `deepseek-chat` 模型。
    ```json
     {
       "name": "deepseek",
       "api_base_url": "https://api.deepseek.com/chat/completions",
       "api_key": "sk-xxx",
       "models": ["deepseek-chat", "deepseek-reasoner"],
       "transformer": {
         "use": ["deepseek"],
         "deepseek-chat": { "use": ["tooluse"] }
       }
     }
    ```

-   **向 Transformer 传递选项**: 某些转换器（如 `maxtoken`）接受选项。要传递选项，请使用嵌套数组，其中第一个元素是转换器名称，第二个元素是选项对象。
    ```json
    {
      "name": "siliconflow",
      "api_base_url": "https://api.siliconflow.cn/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": ["moonshotai/Kimi-K2-Instruct"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 16384
            }
          ]
        ]
      }
    }
    ```

**可用的内置 Transformer：**

-   `Anthropic`: 如果你只使用这一个转换器，则会直接透传请求和响应(你可以用它来接入其他支持Anthropic端点的服务商)。
-   `deepseek`: 适配 DeepSeek API 的请求/响应。
-   `gemini`: 适配 Gemini API 的请求/响应。
-   `openrouter`: 适配 OpenRouter API 的请求/响应。它还可以接受一个 `provider` 路由参数，以指定 OpenRouter 应使用哪些底层提供商。有关更多详细信息，请参阅 [OpenRouter 文档](https://openrouter.ai/docs/features/provider-routing)。请参阅下面的示例：
    ```json
      "transformer": {
        "use": ["openrouter"],
        "moonshotai/kimi-k2": {
          "use": [
            [
              "openrouter",
              {
                "provider": {
                  "only": ["moonshotai/fp8"]
                }
              }
            ]
          ]
        }
      }
    ```
-   `groq`: 适配 groq API 的请求/响应
-   `maxtoken`: 设置特定的 `max_tokens` 值。
-   `tooluse`: 优化某些模型的工具使用(通过`tool_choice`参数)。
-   `gemini-cli` (实验性): 通过 Gemini CLI [gemini-cli.js](https://gist.github.com/musistudio/1c13a65f35916a7ab690649d3df8d1cd) 对 Gemini 的非官方支持。
-   `reasoning`: 用于处理 `reasoning_content` 字段。
-   `sampling`: 用于处理采样信息字段，如 `temperature`、`top_p`、`top_k` 和 `repetition_penalty`。
-   `enhancetool`: 对 LLM 返回的工具调用参数增加一层容错处理（这会导致不再流式返回工具调用信息）。
-   `cleancache`: 清除请求中的 `cache_control` 字段。
-   `vertex-gemini`: 处理使用 vertex 鉴权的 gemini api。
-   `qwen-cli` (实验性): 通过 Qwen CLI [qwen-cli.js](https://gist.github.com/musistudio/f5a67841ced39912fd99e42200d5ca8b) 对 qwen3-coder-plus 的非官方支持。
-   `rovo-cli` (experimental): 通过 Atlassian Rovo Dev CLI [rovo-cli.js](https://gist.github.com/SaseQ/c2a20a38b11276537ec5332d1f7a5e53) 对 GPT-5 的非官方支持。

**自定义 Transformer:**

您还可以创建自己的转换器，并通过 `config.json` 中的 `transformers` 字段加载它们。

```json
{
  "transformers": [
      {
        "path": "/User/xxx/.claude-code-router/plugins/gemini-cli.js",
        "options": {
          "project": "xxx"
        }
      }
  ]
}
```

#### Router

`Router` 对象定义了在不同场景下使用哪个模型：

-   `default`: 用于常规任务的默认模型。
-   `background`: 用于后台任务的模型。这可以是一个较小的本地模型以节省成本。
-   `think`: 用于推理密集型任务（如计划模式）的模型。
-   `longContext`: 用于处理长上下文（例如，> 60K 令牌）的模型。
-   `longContextThreshold` (可选): 触发长上下文模型的令牌数阈值。如果未指定，默认为 60000。
-   `webSearch`: 用于处理网络搜索任务，需要模型本身支持。如果使用`openrouter`需要在模型后面加上`:online`后缀。
-   `image`(测试版): 用于处理图片类任务（采用CCR内置的agent支持），如果该模型不支持工具调用，需要将`config.forceUseImageAgent`属性设置为`true`。

您还可以使用 `/model` 命令在 Claude Code 中动态切换模型：
`/model provider_name,model_name`
示例: `/model openrouter,anthropic/claude-3.5-sonnet`

#### 自定义路由器

对于更高级的路由逻辑，您可以在 `config.json` 中通过 `CUSTOM_ROUTER_PATH` 字段指定一个自定义路由器脚本。这允许您实现超出默认场景的复杂路由规则。

在您的 `config.json` 中配置:

```json
{
  "CUSTOM_ROUTER_PATH": "/User/xxx/.claude-code-router/custom-router.js"
}
```

自定义路由器文件必须是一个导出 `async` 函数的 JavaScript 模块。该函数接收请求对象和配置对象作为参数，并应返回提供商和模型名称的字符串（例如 `"provider_name,model_name"`），如果返回 `null` 则回退到默认路由。

这是一个基于 `custom-router.example.js` 的 `custom-router.js` 示例：

```javascript
// /User/xxx/.claude-code-router/custom-router.js

/**
 * 一个自定义路由函数，用于根据请求确定使用哪个模型。
 *
 * @param {object} req - 来自 Claude Code 的请求对象，包含请求体。
 * @param {object} config - 应用程序的配置对象。
 * @returns {Promise<string|null>} - 一个解析为 "provider,model_name" 字符串的 Promise，如果返回 null，则使用默认路由。
 */
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find(m => m.role === 'user')?.content;

  if (userMessage && userMessage.includes('解释这段代码')) {
    // 为代码解释任务使用更强大的模型
    return 'openrouter,anthropic/claude-3.5-sonnet';
  }

  // 回退到默认的路由配置
  return null;
};
```

##### 子代理路由

对于子代理内的路由，您必须在子代理提示词的**开头**包含 `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` 来指定特定的提供商和模型。这样可以将特定的子代理任务定向到指定的模型。

**示例：**

```
<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-3.5-sonnet</CCR-SUBAGENT-MODEL>
请帮我分析这段代码是否存在潜在的优化空间...
```

## Status Line (Beta)
为了在运行时更好的查看claude-code-router的状态，claude-code-router在v1.0.40内置了一个statusline工具，你可以在UI中启用它，
![statusline-config.png](/blog/images/statusline-config.png)

效果如下：
![statusline](/blog/images/statusline.png)

## 🤖 GitHub Actions

将 Claude Code Router 集成到您的 CI/CD 管道中。在设置 [Claude Code Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions) 后，修改您的 `.github/workflows/claude.yaml` 以使用路由器：

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  # ... other triggers

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      # ... other conditions
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Prepare Environment
        run: |
          curl -fsSL https://bun.sh/install | bash
          mkdir -p $HOME/.claude-code-router
          cat << 'EOF' > $HOME/.claude-code-router/config.json
          {
            "log": true,
            "NON_INTERACTIVE_MODE": true,
            "OPENAI_API_KEY": "${{ secrets.OPENAI_API_KEY }}",
            "OPENAI_BASE_URL": "https://api.deepseek.com",
            "OPENAI_MODEL": "deepseek-chat"
          }
          EOF
        shell: bash

      - name: Start Claude Code Router
        run: |
          nohup ~/.bun/bin/bunx @musistudio/claude-code-router@1.0.8 start &
        shell: bash

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@beta
        env:
          ANTHROPIC_BASE_URL: http://localhost:3456
        with:
          anthropic_api_key: "any-string-is-ok"
```

这种设置可以实现有趣的自动化，例如在非高峰时段运行任务以降低 API 成本。

## 📝 深入阅读

-   [项目动机和工作原理](blog/zh/项目初衷及原理.md)
-   [也许我们可以用路由器做更多事情](blog/zh/或许我们能在Router中做更多事情.md)

## ❤️ 支持与赞助

如果您觉得这个项目有帮助，请考虑赞助它的开发。非常感谢您的支持！

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F31GN2GM)

[Paypal](https://paypal.me/musistudio1999)

<table>
  <tr>
    <td><img src="/blog/images/alipay.jpg" width="200" alt="Alipay" /></td>
    <td><img src="/blog/images/wechat.jpg" width="200" alt="WeChat Pay" /></td>
  </tr>
</table>

### 我们的赞助商

非常感谢所有赞助商的慷慨支持！

- [AIHubmix](https://aihubmix.com/)
- [BurnCloud](https://ai.burncloud.com)
- [302.AI](https://share.302.ai/ZGVF9w)
- [Z智谱](https://www.bigmodel.cn/claude-code?ic=FPF9IVAGFJ)
- @Simon Leischnig
- [@duanshuaimin](https://github.com/duanshuaimin)
- [@vrgitadmin](https://github.com/vrgitadmin)
- @*o
- [@ceilwoo](https://github.com/ceilwoo)
- @*说
- @*更
- @K*g
- @R*R
- [@bobleer](https://github.com/bobleer)
- @*苗
- @*划
- [@Clarence-pan](https://github.com/Clarence-pan)
- [@carter003](https://github.com/carter003)
- @S*r
- @*晖
- @*敏
- @Z*z
- @*然
- [@cluic](https://github.com/cluic)
- @*苗
- [@PromptExpert](https://github.com/PromptExpert)
- @*应
- [@yusnake](https://github.com/yusnake)
- @*飞
- @董*
- @*汀
- @*涯
- @*:-）
- @**磊
- @*琢
- @*成
- @Z*o
- @\*琨
- [@congzhangzh](https://github.com/congzhangzh)
- @*_
- @Z\*m
- @*鑫
- @c\*y
- @\*昕
- [@witsice](https://github.com/witsice)
- @b\*g
- @\*亿
- @\*辉
- @JACK 
- @\*光
- @W\*l
- [@kesku](https://github.com/kesku)
- [@biguncle](https://github.com/biguncle)
- @二吉吉
- @a\*g
- @\*林
- @\*咸
- @\*明
- @S\*y
- @f\*o
- @\*智
- @F\*t
- @r\*c
- [@qierkang](http://github.com/qierkang)
- @\*军
- [@snrise-z](http://github.com/snrise-z)
- @\*王
- [@greatheart1000](http://github.com/greatheart1000)
- @\*王
- @zcutlip
- [@Peng-YM](http://github.com/Peng-YM)
- @\*更
- @\*.
- @F\*t
- @\*政
- @\*铭
- @\*叶
- @七\*o
- @\*青
- @\*\*晨
- @\*远
- @\*霄
- @\*\*吉
- @\*\*飞
- @\*\*驰
- @x\*g
- @\*\*东
- @\*落
- @哆\*k
- @\*涛
- [@苗大](https://github.com/WitMiao)
- @\*呢
- @\d*u
- @crizcraig
- s\*s
- \*火
- \*勤
- \*\*锟
- \*涛
- \*\*明
- \*知
- \*语
- \*瓜

（如果您的名字被屏蔽，请通过我的主页电子邮件与我联系，以便使用您的 GitHub 用户名进行更新。）


## 交流群
<img src="/blog/images/wechat_group.jpg" width="200" alt="wechat_group" />
