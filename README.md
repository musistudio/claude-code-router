<h1 align="center">Claude Code Router</h1>

<p align="center">
  <a href="README_zh.md"><img alt="Chinese README" src="https://img.shields.io/badge/%F0%9F%87%A8%F0%9F%87%B3-%E4%B8%AD%E6%96%87%E7%89%88-ff0000?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
  <a href="https://github.com/musistudio/claude-code-router/releases"><img alt="Desktop downloads" src="https://img.shields.io/github/downloads/musistudio/claude-code-router/total?label=Desktop%20downloads&logo=github" /></a>
  <a href="https://ccrdesk.top/"><img alt="Documentation" src="https://img.shields.io/badge/Docs-ccrdesk.top-0ea5e9?style=flat" /></a>
</p>

<div align="center">

<table width="100%">
  <tr>
    <td align="center">
      <a href="https://www.kimi.com/code?aff=ccr">
        <img src="https://gcdn.moonshot.cn/growth-cdn/sponsor/kimi-en.png" width="960" alt="Kimi K2.7 Code sponsor banner" />
      </a>
      <br />
      <sub>
        <a href="https://www.kimi.com/code?aff=ccr"><strong>Kimi Code Subscription</strong></a>
        &nbsp;·&nbsp;
        <a href="https://platform.kimi.ai?aff=ccr"><strong>API Global</strong></a>
        &nbsp;·&nbsp;
        <a href="https://platform.kimi.com?aff=ccr">API China</a>
      </sub>
    </td>
  </tr>
  <tr>
    <td align="left">
      <p>
        <strong>Thanks to Kimi for sponsoring this project!</strong> Kimi K2.7 Code is an open-source, coding-focused agentic model developed by Moonshot AI, with substantial gains on real-world long-horizon coding tasks and higher end-to-end success across complex software engineering workflows. It also cuts thinking-token usage by approximately 30% compared with K2.6. Inside CCR, Kimi ships as built-in provider presets: import the pay-as-you-go API or the Kimi Code subscription in one click and route your coding agent's requests to Kimi, the subscription endpoint passes straight through natively with no protocol conversion, API endpoints are adapted automatically, and your balance and subscription usage show up right in the CCR dashboard.
      </p>
      <p align="center">
        CCR already supports Kimi. Visit the Kimi Open Platform (<a href="https://platform.kimi.com?aff=ccr">中文站</a> | <a href="https://platform.kimi.ai?aff=ccr">Global</a>) to try the API, or explore the <a href="https://www.kimi.com/code?aff=ccr">cost-effective Coding Plan</a>.
      </p>
    </td>
  </tr>
</table>

</div>

Claude Code Router Desktop is a local control plane for coding agents. It gives Claude Code, Codex, Grok CLI, Kimi CLI, ZCode, and compatible API clients one stable local endpoint, then lets you decide which provider, model, routing policy, tool stack, and account should handle each request.

Instead of wiring every agent to every model service by hand, CCR centralizes the model layer on your own machine: provider presets, custom endpoints, credential pools, fallback chains, Fusion-enhanced models, MCP tools, request logs, account usage, and desktop launch profiles all live in one app.

<p align="center">
  <img src="blog/images/claude-code-router.png" width="720" alt="Claude Code Router Desktop screenshot" />
</p>

## What CCR Helps You Do

| Goal | CCR gives you |
| --- | --- |
| Keep the same agent workflow while switching models | Local profiles for Claude Code, Codex, Grok CLI, Kimi CLI, and ZCode, with CLI/app launch entries and per-profile model selection |
| Try many providers without rebuilding config every time | Built-in provider presets, custom OpenAI/Anthropic/Gemini-compatible endpoints, protocol probing, model discovery, and connectivity checks |
| Make routing a runtime policy | Built-in agent routing, conditional rules, request rewrites, model-prefix routing, retries, and fallback model chains |
| Control cost and quota pressure | Credential pools, key rotation, local usage limits, account balance snapshots, token/cost dashboards, and tray status |
| Upgrade a model without replacing it | Fusion models that add vision, web search, or selected MCP tools to an existing base model |
| Keep large tool sets usable | ToolHub, a compact MCP entry point that lets agents resolve and invoke the tools needed for the current task |
| Debug what actually happened | Request logs, resolved provider/model fields, latency, token usage, estimated cost, network capture, and agent observability |

## Why Use CCR

- **One gateway for your agent stack**: point clients at CCR once, then move routing, models, keys, and providers from scattered client configs into a single desktop UI.
- **Provider freedom without workflow churn**: use OpenAI Chat/Responses, Anthropic Messages, Gemini Generate Content/Interactions, OpenRouter, DeepSeek, SiliconFlow, Moonshot, Kimi Code, Mistral, Z.AI, Bailian, and custom compatible providers.
- **Reliability policies you can see and change**: define when a request should be rewritten, retried, or moved to another model, then verify the result in local logs.
- **Operational visibility for AI work**: track requests, tokens, cost estimates, success rate, latency, model distribution, provider usage, and account balances from the dashboard or tray.
- **Agent-native tools and extensions**: add Fusion capabilities, expose dynamic MCP tools through ToolHub, automate the built-in browser, relay agents through IM bots, or install local extensions.

## Feature Highlights

- **Agent profiles**: create profiles for Claude Code, Codex, Grok CLI, Kimi CLI, and ZCode with model overrides, scopes, CLI/app launch surfaces, environment settings, and multi-instance app workflows.
- **Provider management**: add preset providers or custom endpoints; probe supported protocols; detect model lists; run real connectivity checks; manage single keys or credential pools; import local agent login state where supported.
- **Model catalog**: search all configured models, edit model descriptions, and use those descriptions to guide Claude Code subagent, Task, and Workflow model selection.
- **Routing engine**: combine built-in agent routing, request-header/body conditions, model-prefix routing, request rewrites, retry policy, and ordered fallback targets.
- **Fusion models**: publish reusable virtual models that keep a base model's behavior while adding vision, hosted web search, or selected MCP tools.
- **ToolHub**: merge multiple MCP servers into one dynamic MCP server so agents can resolve tools only when a task needs them; desktop builds can also expose built-in browser automation and Chrome login-state import.
- **API keys and quotas**: create CCR client keys with expiration and local request/token/image limits, separate from upstream provider credentials.
- **Logs and observability**: inspect request/response details, resolved provider and model, credential, status, latency, token usage, estimated cost, tool calls, and agent execution traces.
- **Proxy and networking**: run CCR as a local HTTP/HTTPS proxy, optionally install the CA certificate, route supported API traffic through CCR, and capture network exchanges for debugging.
- **Bot relay**: connect agent profiles to supported IM platforms including Weixin iLink, WeCom, Slack, Discord, Telegram, LINE, Feishu, and DingTalk.
- **Extensions**: install wrapper plugins and core gateway plugins that can register local routes, proxy routes, provider account connectors, apps, and virtual models.

## Documentation

Read the full documentation at [ccrdesk.top](https://ccrdesk.top/), including the [CLI reference](https://ccrdesk.top/en/guides/cli/) and [Docker deployment guide](https://ccrdesk.top/en/guides/docker/).

## Download And Install

1. Open the [GitHub Releases page](https://github.com/musistudio/claude-code-router/releases).
2. Download the package for your platform:
   - macOS Apple Silicon: `Claude-Code-Router_<version>-mac-Apple-Silicon-arm64.dmg` or `.zip`
   - macOS Intel: `Claude-Code-Router_<version>-mac-Intel-x64.dmg` or `.zip`
   - Windows: `Claude Code Router_<version>.exe`
   - Linux: `Claude Code Router_<version>.AppImage`
3. Install and launch **Claude Code Router**.
4. On first launch, CCR creates its local configuration database:
   - macOS/Linux: `~/.claude-code-router/config.sqlite`
   - Windows: `%APPDATA%\claude-code-router\config.sqlite`

CCR stores runtime configuration in SQLite. A legacy `config.json` is read only once for migration when no SQLite config exists.

After the service is started from the **Server** page, CCR listens on `http://127.0.0.1:3456` by default. The **Server** page controls the gateway `Host`, `Port`, proxy mode, system proxy, network capture, and CA certificate status.

## CLI And Docker

The npm CLI requires Node.js 22 or newer and provides the browser management UI, gateway, and Agent Config launch commands without Electron:

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

The CLI management UI defaults to `http://127.0.0.1:3458`, while its model gateway defaults to `http://127.0.0.1:3456`. See the [complete CLI reference](https://ccrdesk.top/en/guides/cli/) for background/foreground service commands, options, profile launching, authentication, and data locations.

To run the browser UI and gateway behind one Nginx port with persistent Docker storage:

```sh
docker compose up -d --build
```

Docker exposes both management and gateway routes at `http://127.0.0.1:3458` by default. Read the [Docker deployment guide](https://ccrdesk.top/en/guides/docker/) before remote exposure; it covers the internal port topology, management and gateway authentication, `CCR_PUBLIC_BASE_URL`, volumes, backup/restore, upgrades, and health checks.

## Quick Start

CCR can be configured entirely from the desktop UI. Use this setup order for a clean first run.

### 1. Add a provider

Open **Providers**, click **Add Provider**, then choose a built-in preset, import a supported local agent login state, or select **Other / custom API endpoint**. Fill in the provider name, base URL, protocol, API key, and model list. Run protocol probing and model connectivity checks when available, then save the provider.

### 2. Configure routing

Open **Routing** to enable built-in agent routes, add conditional rules, configure request rewrites, and set fallback behavior. Use **Add Routing Rule** for request conditions, model-prefix routing, or rule-level fallback targets.

### 3. Start the gateway

Open **Server** and click **Start**. After the page shows Running, CCR listens on `http://127.0.0.1:3456` by default. Enable **Auto start** if you want CCR to start the local gateway whenever the desktop app opens.

### 4. Connect your agent tool

Open **Agent Config** and choose the client you want to use. Configure Claude Code, Codex, Grok CLI, Kimi CLI, or ZCode, select the target model and effect scope, then apply the config. For app entries, use **Open Agent** to launch the target app through CCR.

### 5. Monitor and adjust

Use **Settings → Logs & Observability** to enable request logs and agent observability. Use **Logs** to confirm `request model`, `resolved provider`, `resolved model`, status, tokens, latency, and errors. Use the dashboard and tray window for token, cost, model distribution, and account status.

## Acknowledgements

Codex support is powered by [musistudio/codexl](https://github.com/musistudio/codexl).

## Support & Sponsoring

<div align="center">

<p>If you find this project helpful, please consider sponsoring its development. Your support is greatly appreciated.</p>

<table>
  <tr>
    <td align="center" width="220">
      <a href="https://ko-fi.com/F1F31GN2GM">
        <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi" />
      </a>
      <br />
      <sub>One-time support via Ko-fi</sub>
    </td>
    <td align="center" width="220">
      <a href="https://paypal.me/musistudio1999">
        <img src="https://img.shields.io/badge/PayPal-Sponsor-003087?logo=paypal&logoColor=white" alt="Sponsor with PayPal" />
      </a>
      <br />
      <sub>International sponsorship</sub>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td align="center" width="220">
      <strong>Alipay</strong>
      <br />
      <img src="/blog/images/alipay.jpg" width="160" alt="Alipay QR code" />
    </td>
    <td align="center" width="220">
      <strong>WeChat Pay</strong>
      <br />
      <img src="/blog/images/wechat.jpg" width="160" alt="WeChat Pay QR code" />
    </td>
  </tr>
</table>

</div>

### Our Sponsors

<div align="center">

<p>A huge thank you to all our sponsors for their generous support.</p>

<table width="100%">
  <tr>
    <td align="center" width="330">
      <a href="https://www.bigmodel.cn/claude-code?ic=FPF9IVAGFJ">
        <img src="/docs/public/provider-icons/zhipu-cn-general.png" width="42" height="42" alt="Zhipu icon" />
        <br />
        <strong>Z智谱</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://aihubmix.com/">
        <img src="https://www.google.com/s2/favicons?domain=aihubmix.com&amp;sz=128" width="42" height="42" alt="AIHubmix icon" />
        <br />
        <strong>AIHubmix</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://ai.burncloud.com">
        <img src="https://www.burncloud.com/favicon.png" width="42" height="42" alt="BurnCloud icon" />
        <br />
        <strong>BurnCloud</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://share.302.ai/ZGVF9w">
        <img src="https://www.google.com/s2/favicons?domain=302.ai&amp;sz=128" width="42" height="42" alt="302.AI icon" />
        <br />
        <strong>302.AI</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="330">
      <a href="https://runapi.co/register?aff=IX1t">
        <img src="/docs/public/provider-icons/runapi.jpg" width="42" height="42" alt="RunAPI icon" />
        <br />
        <strong>RunAPI</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://teamorouter.com/">
        <img src="/docs/public/provider-icons/teamorouter.png" width="42" height="42" alt="TeamoRouter icon" />
        <br />
        <strong>TeamoRouter</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://code0.ai/agent/register/9n9jOsSnYQoemIVL?utm_source=claudecoderouter&amp;utm_medium=partner&amp;utm_campaign=claudecoderouter_2026&amp;utm_content=default">
        <img src="/docs/public/provider-icons/code0.png" width="42" height="42" alt="code0.ai icon" />
        <br />
        <strong>code0.ai</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://console.claudeapi.com/agent/register/LbmB7Y9kPloyzhwF?utm_source=claudecoderouter&amp;utm_medium=partner&amp;utm_campaign=claudecoderouter_2026&amp;utm_content=default">
        <img src="/docs/public/provider-icons/claudeapi.png" width="42" height="42" alt="claudeapi icon" />
        <br />
        <strong>claudeapi</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="330">
      <a href="https://s.qiniu.com/AVjMVf">
        <img src="/docs/public/provider-icons/qiniu-ai.png" width="42" height="42" alt="Qiniu Cloud AI icon" />
        <br />
        <strong>Qiniu Cloud AI</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&amp;aff=9HHHAB5QLAES">
        <img src="/docs/public/provider-icons/fenno.jpg" width="42" height="42" alt="Fenno.ai icon" />
        <br />
        <strong>Fenno.ai</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://unity2.ai/register?source=claudecoderouter">
        <img src="/docs/public/provider-icons/unity2.jpg" width="42" height="42" alt="Unity2.Ai icon" />
        <br />
        <strong>Unity2.Ai</strong>
      </a>
    </td>
  </tr>
</table>

<h4>Community Sponsors</h4>

<table width="100%">
  <tr>
    <td align="center" width="220">@Simon Leischnig</td>
    <td align="center" width="220"><a href="https://github.com/duanshuaimin">@duanshuaimin</a></td>
    <td align="center" width="220"><a href="https://github.com/vrgitadmin">@vrgitadmin</a></td>
    <td align="center" width="220">@*o</td>
    <td align="center" width="220"><a href="https://github.com/ceilwoo">@ceilwoo</a></td>
    <td align="center" width="220">@*说</td>
  </tr>
  <tr>
    <td align="center" width="220">@*更</td>
    <td align="center" width="220">@K*g</td>
    <td align="center" width="220">@R*R</td>
    <td align="center" width="220"><a href="https://github.com/bobleer">@bobleer</a></td>
    <td align="center" width="220">@*苗</td>
    <td align="center" width="220">@*划</td>
  </tr>
  <tr>
    <td align="center" width="220"><a href="https://github.com/Clarence-pan">@Clarence-pan</a></td>
    <td align="center" width="220"><a href="https://github.com/carter003">@carter003</a></td>
    <td align="center" width="220">@S*r</td>
    <td align="center" width="220">@*晖</td>
    <td align="center" width="220">@*敏</td>
    <td align="center" width="220">@Z*z</td>
  </tr>
  <tr>
    <td align="center" width="220">@*然</td>
    <td align="center" width="220"><a href="https://github.com/cluic">@cluic</a></td>
    <td align="center" width="220">@*苗</td>
    <td align="center" width="220"><a href="https://github.com/PromptExpert">@PromptExpert</a></td>
    <td align="center" width="220">@*应</td>
    <td align="center" width="220"><a href="https://github.com/yusnake">@yusnake</a></td>
  </tr>
  <tr>
    <td align="center" width="220">@*飞</td>
    <td align="center" width="220">@董*</td>
    <td align="center" width="220">@*汀</td>
    <td align="center" width="220">@*涯</td>
    <td align="center" width="220">@*:-）</td>
    <td align="center" width="220">@**磊</td>
  </tr>
  <tr>
    <td align="center" width="220">@*琢</td>
    <td align="center" width="220">@*成</td>
    <td align="center" width="220">@Z*o</td>
    <td align="center" width="220">@*琨</td>
    <td align="center" width="220"><a href="https://github.com/congzhangzh">@congzhangzh</a></td>
    <td align="center" width="220">@*_</td>
  </tr>
  <tr>
    <td align="center" width="220">@Z*m</td>
    <td align="center" width="220">@*鑫</td>
    <td align="center" width="220">@c*y</td>
    <td align="center" width="220">@*昕</td>
    <td align="center" width="220"><a href="https://github.com/witsice">@witsice</a></td>
    <td align="center" width="220">@b*g</td>
  </tr>
  <tr>
    <td align="center" width="220">@*亿</td>
    <td align="center" width="220">@*辉</td>
    <td align="center" width="220">@JACK</td>
    <td align="center" width="220">@*光</td>
    <td align="center" width="220">@W*l</td>
    <td align="center" width="220"><a href="https://github.com/kesku">@kesku</a></td>
  </tr>
  <tr>
    <td align="center" width="220"><a href="https://github.com/biguncle">@biguncle</a></td>
    <td align="center" width="220">@二吉吉</td>
    <td align="center" width="220">@a*g</td>
    <td align="center" width="220">@*林</td>
    <td align="center" width="220">@*咸</td>
    <td align="center" width="220">@*明</td>
  </tr>
  <tr>
    <td align="center" width="220">@S*y</td>
    <td align="center" width="220">@f*o</td>
    <td align="center" width="220">@*智</td>
    <td align="center" width="220">@F*t</td>
    <td align="center" width="220">@r*c</td>
    <td align="center" width="220"><a href="https://github.com/qierkang">@qierkang</a></td>
  </tr>
  <tr>
    <td align="center" width="220">@*军</td>
    <td align="center" width="220"><a href="https://github.com/snrise-z">@snrise-z</a></td>
    <td align="center" width="220">@*王</td>
    <td align="center" width="220"><a href="https://github.com/greatheart1000">@greatheart1000</a></td>
    <td align="center" width="220">@*王</td>
    <td align="center" width="220">@zcutlip</td>
  </tr>
  <tr>
    <td align="center" width="220"><a href="https://github.com/Peng-YM">@Peng-YM</a></td>
    <td align="center" width="220">@*更</td>
    <td align="center" width="220">@*.</td>
    <td align="center" width="220">@F*t</td>
    <td align="center" width="220">@*政</td>
    <td align="center" width="220">@*铭</td>
  </tr>
  <tr>
    <td align="center" width="220">@*叶</td>
    <td align="center" width="220">@七*o</td>
    <td align="center" width="220">@*青</td>
    <td align="center" width="220">@**晨</td>
    <td align="center" width="220">@*远</td>
    <td align="center" width="220">@*霄</td>
  </tr>
  <tr>
    <td align="center" width="220">@**吉</td>
    <td align="center" width="220">@**飞</td>
    <td align="center" width="220">@**驰</td>
    <td align="center" width="220">@x*g</td>
    <td align="center" width="220">@**东</td>
    <td align="center" width="220">@*落</td>
  </tr>
  <tr>
    <td align="center" width="220">@哆*k</td>
    <td align="center" width="220">@*涛</td>
    <td align="center" width="220"><a href="https://github.com/WitMiao">@苗大</a></td>
    <td align="center" width="220">@*呢</td>
    <td align="center" width="220">@d*u</td>
    <td align="center" width="220">@crizcraig</td>
  </tr>
  <tr>
    <td align="center" width="220">s*s</td>
    <td align="center" width="220">*火</td>
    <td align="center" width="220">*勤</td>
    <td align="center" width="220">**锟</td>
    <td align="center" width="220">*涛</td>
    <td align="center" width="220">**明</td>
  </tr>
  <tr>
    <td align="center" width="220">*知</td>
    <td align="center" width="220">*语</td>
    <td align="center" width="220">*瓜</td>
    <td align="center" width="220"></td>
    <td align="center" width="220"></td>
    <td align="center" width="220"></td>
  </tr>
</table>

<sub>If your name is masked, please contact me via my homepage email to update it with your GitHub username.</sub>

</div>

## License

This project is licensed under the [MIT License](LICENSE).
