# Claude Code Router

> This is a tool for routing Claude Code requests to different models, and you can customize any request.

![](screenshoots/claude-code.png)

## Usage

1. Install Claude Code

```shell
npm install -g @anthropic-ai/claude-code
```

2. Install Claude Code Router

```shell
npm install -g @musistudio/claude-code-router
```

3. Set up plugins (required for usePlugins config)

```shell
mkdir -p ~/.claude-code-router/plugins
cp plugins/* ~/.claude-code-router/plugins/
```

4. Start Claude Code by claude-code-router

```shell
ccr code
```

5. Configure routing[optional]  
   Set up your `~/.claude-code-router/config.json` file like this:

```json
{
  "log": true,
  "OPENAI_API_KEY": "sk-xxx",
  "OPENAI_BASE_URL": "https://api.deepseek.com",
  "OPENAI_MODEL": "deepseek-chat",
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1",
      "api_key": "sk-xxx",
      "models": [
        "google/gemini-2.5-flash",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-3.5-sonnet"
      ]
    },
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com",
      "api_key": "sk-xxx",
      "models": ["deepseek-reasoner"]
    },
    {
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    }
  ],
  "Router": {
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-flash"
  },
  "usePlugins": ["notebook-tools-filter", "toolcall-improvement"]
}
```

- `background`  
  This model will be used to handle some background tasks([background-token-usage](https://docs.anthropic.com/en/docs/claude-code/costs#background-token-usage)). Based on my tests, it doesn’t require high intelligence. I’m using the qwen-coder-2.5:7b model running locally on my MacBook Pro M1 (32GB) via Ollama.
  If your computer can’t run Ollama, you can also use some free models, such as qwen-coder-2.5:3b.

- `think`  
  This model will be used when enabling Claude Code to perform reasoning. However, reasoning budget control has not yet been implemented (since the DeepSeek-R1 model does not support it), so there is currently no difference between using UltraThink and Think modes.
  It is worth noting that Plan Mode also use this model to achieve better planning results.  
  Note: The reasoning process via the official DeepSeek API may be very slow, so you may need to wait for an extended period of time.

- `longContext`  
  This model will be used when the context length exceeds 32K (this value may be modified in the future). You can route the request to a model that performs well with long contexts (I’ve chosen google/gemini-2.5-flash). This scenario has not been thoroughly tested yet, so if you encounter any issues, please submit an issue.

- model command  
  You can also switch models within Claude Code by using the `/model` command. The format is: `provider,model`, like this:  
  `/model openrouter,anthropic/claude-3.5-sonnet`  
  This will use the anthropic/claude-3.5-sonnet model provided by OpenRouter to handle all subsequent tasks.

## Available Models (July 2025)

### Premium Models (Paid)
- **DeepSeek**: `deepseek-chat`, `deepseek-reasoner` - Cost-effective reasoning
- **Anthropic**: `claude-sonnet-4`, `claude-3.5-sonnet` - High quality
- **Google**: `gemini-2.5-flash` - Fast, efficient for long context

### Free Models (OpenRouter)
- **Meta**: `meta/llama-4-maverick:free` - 256K context, multimodal
- **Google**: `google/gemini-2.0-flash-exp:free` - Fast inference
- **Mistral**: `mistral/mistral-small-3.1:free` - 96K context, balanced

**Free Model Limits**: 50 requests/day (1,000 with $10+ credits), 20/minute

### Recommended Free Configuration
For budget-conscious users, replace paid providers with free alternatives:

```json
{
  "log": true,
  "OPENAI_API_KEY": "sk-xxx",
  "OPENAI_BASE_URL": "https://openrouter.ai/api/v1", 
  "OPENAI_MODEL": "meta/llama-4-maverick:free",
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1",
      "api_key": "sk-xxx", 
      "models": [
        "meta/llama-4-maverick:free",
        "google/gemini-2.0-flash-exp:free",
        "mistral/mistral-small-3.1:free"
      ]
    }
  ],
  "Router": {
    "background": "openrouter,mistral/mistral-small-3.1:free",
    "think": "openrouter,meta/llama-4-maverick:free", 
    "longContext": "openrouter,google/gemini-2.0-flash-exp:free"
  },
  "usePlugins": ["notebook-tools-filter", "toolcall-improvement"]
}
```

## Features

- [x] Support change models
- [x] Github Actions
- [x] Free model support via OpenRouter
- [ ] More robust plugin support
- [ ] More detailed logs
- [ ] Support image
- [ ] Support web search

## Plugins
You can modify or enhance Claude Code’s functionality by installing plugins. The mechanism works by using middleware to modify request parameters — this allows you to rewrite prompts or add/remove tools.

To use a plugin, place it in the ~/.claude-code-router/plugins/ directory and specify the plugin name in config.js using the `usePlugins` option.like this
```json
// ~/.claud-code-router/config.json
{
  ...,
  "usePlugins": ["notebook-tools-filter", "toolcall-improvement"]
}
```

Currently, the following plugins are available:


- **notebook-tools-filter**    
This plugin filters out tool calls related to Jupyter notebooks (.ipynb files). You can use it if your work does not involve Jupyter.


- **toolcall-improvement**    
If your LLM doesn’t handle tool usage well (for example, always returning code as plain text instead of modifying files — such as with deepseek-v3), you can use this plugin.    
This plugin simply adds the following system prompt. If you have a better prompt, you can modify it.
```markdown
## **Important Instruction:**  
You must use tools as frequently and accurately as possible to help the user solve their problem.  
Prioritize tool usage whenever it can enhance accuracy, efficiency, or the quality of the response.
```


## Github Actions
You just need to install `Claude Code Actions` in your repository according to the [official documentation](https://docs.anthropic.com/en/docs/claude-code/github-actions). For `ANTHROPIC_API_KEY`, you can use any string. Then, modify your `.github/workflows/claude.yaml` file to include claude-code-router, like this:
```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
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
          anthropic_api_key: "test"
```
You can modify the contents of `$HOME/.claude-code-router/config.json` as needed.
GitHub Actions support allows you to trigger Claude Code at specific times, which opens up some interesting possibilities.

For example, between 00:30 and 08:30 Beijing Time, using the official DeepSeek API:

- The cost of the `deepseek-v3` model is only 50% of the normal time.

- The `deepseek-r1` model is just 25% of the normal time.

So maybe in the future, I’ll describe detailed tasks for Claude Code ahead of time and let it run during these discounted hours to reduce costs?


## Troubleshooting

### Plugin Loading Errors
If you see errors like `ENOENT: no such file or directory, access '/Users/user/.claude-code-router/plugins/notebook-tools-filter.js'`:

1. **Create plugins directory and copy files:**
```shell
mkdir -p ~/.claude-code-router/plugins
cp plugins/* ~/.claude-code-router/plugins/
```

2. **Restart the service:**
```shell
ccr stop
ccr start
```

3. **Alternative: Disable plugins** by removing `usePlugins` from config or setting to empty array: `"usePlugins": []`

## Some tips:

Now you can use deepseek-v3 models directly without using any plugins.

If you’re using the DeepSeek API provided by the official website, you might encounter an “exceeding context” error after several rounds of conversation (since the official API only supports a 64K context window). In this case, you’ll need to discard the previous context and start fresh. Alternatively, you can use ByteDance’s DeepSeek API, which offers a 128K context window and supports KV cache.

![](screenshoots/contexterror.jpg)

Note: claude code consumes a huge amount of tokens, but thanks to DeepSeek’s low cost, you can use claude code at a fraction of Claude’s price, and you don’t need to subscribe to the Claude Max plan.

Some interesting points: Based on my testing, including a lot of context information can help narrow the performance gap between these LLM models. For instance, when I used Claude-4 in VSCode Copilot to handle a Flutter issue, it messed up the files in three rounds of conversation, and I had to roll everything back. However, when I used claude code with DeepSeek, after three or four rounds of conversation, I finally managed to complete my task—and the cost was less than 1 RMB!

## Some articles:

1. [Project Motivation and Principles](blog/en/project-motivation-and-how-it-works.md) ([中文版看这里](blog/zh/项目初衷及原理.md))

## Buy me a coffee

If you find this project helpful, you can choose to sponsor the author with a cup of coffee. Please provide your GitHub information so I can add you to the sponsor list below.  

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F31GN2GM)

<table>
  <tr>
    <td><img src="/blog/images/alipay.jpg" width="200" /></td>
    <td><img src="/blog/images/wechat.jpg" width="200" /></td>
  </tr>
</table>

## Sponsors

Thanks to the following sponsors:

@Simon Leischnig (If you see this, feel free to contact me and I can update it with your GitHub information)    
[@duanshuaimin](https://github.com/duanshuaimin)     
[@vrgitadmin](https://github.com/vrgitadmin)     
@*o   (可通过主页邮箱联系我修改github用户名)     
[@ceilwoo](https://github.com/ceilwoo)      
@*说  (可通过主页邮箱联系我修改github用户名)     
@*更  (可通过主页邮箱联系我修改github用户名)  
@K*g  (可通过主页邮箱联系我修改github用户名)         
