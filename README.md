# Claude Code Router

[中文版](README_zh.md)

> A powerful tool to route Claude Code requests to different models and customize any request.

![](blog/images/claude-code.png)

## ✨ Features

-   **Model Routing**: Route requests to different models based on your needs (e.g., background tasks, thinking, long context).
-   **Multi-Provider Support**: Supports various model providers like OpenRouter, DeepSeek, Ollama, Gemini, Volcengine, and SiliconFlow.
-   **Request/Response Transformation**: Customize requests and responses for different providers using transformers.
-   **Dynamic Model Switching**: Switch models on-the-fly within Claude Code using the `/model` command.
-   **GitHub Actions Integration**: Trigger Claude Code tasks in your GitHub workflows.
-   **Plugin System**: Extend functionality with custom transformers.

## 🚀 Getting Started

### 1. Installation

First, ensure you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart) installed:

```shell
npm install -g @anthropic-ai/claude-code
```

Then, install Claude Code Router:

```shell
npm install -g @musistudio/claude-code-router
```

### 2. Configuration

Create and configure your `~/.claude-code-router/config.json` file. For more details, you can refer to `config.example.json`.

The `config.json` file has several key sections:
- **`PORT`** (optional): Sets the server port for API requests. Defaults to `3456` if not specified. Example: `"PORT": "7890"`.
- **`LOG`** (optional): You can enable logging by setting it to `true`. The log file will be located at `$HOME/.claude-code-router.log`.
- **`APIKEY`** (optional): You can set a secret key to authenticate requests. When set, clients must provide this key in the `Authorization` header (e.g., `Bearer your-secret-key`) or the `x-api-key` header. Example: `"APIKEY": "your-secret-key"`.
- **`HOST`** (optional): You can set the host address for the server. If `APIKEY` is not set, the host will be forced to `127.0.0.1` for security reasons to prevent unauthorized access. Example: `"HOST": "0.0.0.0"`.

- **`Providers`**: Used to configure different model providers.
- **`Router`**: Used to set up routing rules. `default` specifies the default model, which will be used for all requests if no other route is configured.

Here is a comprehensive example:

```json
{
  "APIKEY": "your-secret-key",
  "PORT": "7890",
  "LOG": true,
  "Providers": [
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
    },
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "sk-xxx",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek"],
        "deepseek-chat": { "use": ["tooluse"] }
      }
    },
    {
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview"
  }
}
```


### 3. Running Claude Code with the Router

Start Claude Code using the router:

```shell
ccr code
```

#### Providers

The `Providers` array is where you define the different model providers you want to use. Each provider object requires:

-   `name`: A unique name for the provider.
-   `api_base_url`: The full API endpoint for chat completions.
-   `api_key`: Your API key for the provider.
-   `models`: A list of model names available from this provider.
-   `transformer` (optional): Specifies transformers to process requests and responses.

#### Transformers

Transformers allow you to modify the request and response payloads to ensure compatibility with different provider APIs.

-   **Global Transformer**: Apply a transformer to all models from a provider. In this example, the `openrouter` transformer is applied to all models under the `openrouter` provider.
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
-   **Model-Specific Transformer**: Apply a transformer to a specific model. In this example, the `deepseek` transformer is applied to all models, and an additional `tooluse` transformer is applied only to the `deepseek-chat` model.
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

-   **Passing Options to a Transformer**: Some transformers, like `maxtoken`, accept options. To pass options, use a nested array where the first element is the transformer name and the second is an options object.
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

**Available Built-in Transformers:**

-   `deepseek`: Adapts requests/responses for DeepSeek API.
-   `gemini`: Adapts requests/responses for Gemini API.
-   `openrouter`: Adapts requests/responses for OpenRouter API.
-   `groq`: Adapts requests/responses for groq API.
-   `maxtoken`: Sets a specific `max_tokens` value.
-   `tooluse`: Optimizes tool usage for certain models via `tool_choice`.
-   `gemini-cli` (experimental): Unofficial support for Gemini via Gemini CLI [gemini-cli.js](https://gist.github.com/musistudio/1c13a65f35916a7ab690649d3df8d1cd).

**Custom Transformers:**

You can also create your own transformers and load them via the `transformers` field in `config.json`.

```json
{
  "transformers": [
      {
        "path": "$HOME/.claude-code-router/plugins/gemini-cli.js",
        "options": {
          "project": "xxx"
        }
      }
  ]
}
```

#### Router

The `Router` object defines which model to use for different scenarios:

-   `default`: The default model for general tasks.
-   `background`: A model for background tasks. This can be a smaller, local model to save costs.
-   `think`: A model for reasoning-heavy tasks, like Plan Mode.
-   `longContext`: A model for handling long contexts (e.g., > 60K tokens).

You can also switch models dynamically in Claude Code with the `/model` command:
`/model provider_name,model_name`
Example: `/model openrouter,anthropic/claude-3.5-sonnet`


## 🤖 GitHub Actions

Integrate Claude Code Router into your CI/CD pipeline. After setting up [Claude Code Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions), modify your `.github/workflows/claude.yaml` to use the router:

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

This setup allows for interesting automations, like running tasks during off-peak hours to reduce API costs.

## 📝 Further Reading

-   [Project Motivation and How It Works](blog/en/project-motivation-and-how-it-works.md)
-   [Maybe We Can Do More with the Router](blog/en/maybe-we-can-do-more-with-the-route.md)

## ❤️ Support & Sponsoring

If you find this project helpful, please consider sponsoring its development. Your support is greatly appreciated!

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F31GN2GM)

<table>
  <tr>
    <td><img src="/blog/images/alipay.jpg" width="200" alt="Alipay" /></td>
    <td><img src="/blog/images/wechat.jpg" width="200" alt="WeChat Pay" /></td>
  </tr>
</table>

### Our Sponsors

A huge thank you to all our sponsors for their generous support!

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
<<<<<<< HEAD
- @*琢
- @*成
- @**磊
=======
- *汀
- *涯
- *:-）
>>>>>>> 2fc79dcf377ade7c4fc8883c94a6779fce830a5a

(If your name is masked, please contact me via my homepage email to update it with your GitHub username.)
