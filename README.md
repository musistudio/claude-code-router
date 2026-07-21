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

<div align="center">

# Claude Code Router

### Manage every agent and provider from one place.

Connect Claude Code, Codex, Grok CLI, ZCode, and compatible API clients to the providers you choose—then route, fail over, extend, and observe every request from one app.

<p>
  <a href="https://github.com/musistudio/claude-code-router/releases"><img alt="Download Desktop" src="https://img.shields.io/badge/Download-Desktop_App-2563EB?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="#quick-start"><img alt="Quick Start" src="https://img.shields.io/badge/Get_Started-Quick_Start-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="https://ccrdesk.top/"><img alt="Read the Docs" src="https://img.shields.io/badge/Explore-Documentation-0F172A?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
</p>

<p>
  <a href="README_zh.md"><img alt="Chinese README" src="https://img.shields.io/badge/%F0%9F%87%A8%F0%9F%87%B3-%E4%B8%AD%E6%96%87%E7%89%88-ff0000?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
</p>

<br />

<img src="blog/images/claude-code-router.png" width="820" alt="Claude Code Router Desktop dashboard" />

</div>

## Why use Claude Code Router?

Claude Code Router (CCR) is a local model gateway and control plane for coding agents. It gives Claude Code, Codex, Grok CLI, ZCode, and compatible API clients **one stable local endpoint**, while you manage the providers, models, accounts, routing rules, and tools behind it from one place.

Use CCR to:

- **Manage all agents and providers together** instead of maintaining a separate model configuration for every client.
- **Switch providers or models without changing your workflow** or repeatedly editing agent configuration files.
- **Keep requests running** with retries, credential pools, key rotation, and ordered fallback models.
- **Add capabilities to existing models** with Fusion vision, web search, MCP tools, and ToolHub.
- **See what actually happened** through request logs, resolved routes, latency, token usage, cost estimates, and account status.

CCR supports OpenAI Chat / Responses, Anthropic Messages, Gemini Generate Content / Interactions, OpenRouter, DeepSeek, SiliconFlow, Moonshot, Kimi Code, Mistral, Z.AI, Bailian, and custom compatible providers.

## Quick Start

### Desktop app (recommended)

1. **[Download Claude Code Router](https://github.com/musistudio/claude-code-router/releases)** for macOS, Windows, or Linux, then launch the app.
2. Open **Providers → Add Provider**. Choose a built-in preset or a custom endpoint, enter the API key, select the protocol and models, then save.
3. Open **Server** and click **Start**. The local model gateway listens on `http://127.0.0.1:3456` by default.
4. Open **Agent Config**, choose Claude Code, Codex, Grok CLI, or ZCode, select a model, and apply the profile.
5. Start using your agent. Open **Logs** to confirm the resolved provider, model, status, tokens, latency, and errors.

Your agent is now connected to CCR. To add conditions, retries, request rewrites, or fallback models, open **Routing**.

<details>
<summary><strong>Desktop packages and local data locations</strong></summary>

- macOS Apple Silicon: `Claude-Code-Router_<version>-mac-Apple-Silicon-arm64.dmg` or `.zip`
- macOS Intel: `Claude-Code-Router_<version>-mac-Intel-x64.dmg` or `.zip`
- Windows: `Claude Code Router_<version>.exe`
- Linux: `Claude Code Router_<version>.AppImage`

Runtime configuration is stored in SQLite at `~/.claude-code-router/config.sqlite` on macOS/Linux and `%APPDATA%\claude-code-router\config.sqlite` on Windows. A legacy `config.json` is read once for migration only when no SQLite configuration exists.

</details>

### CLI

The npm CLI requires Node.js 22 or newer. It starts the same gateway and a browser-based management UI without Electron:

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

Open `http://127.0.0.1:3458`, then follow the same **Providers → Server → Agent Config** flow above. The model gateway remains at `http://127.0.0.1:3456`. See the [CLI reference](https://ccrdesk.top/en/guides/cli/) for service modes, authentication, and profile commands.

### Docker

```sh
docker compose up -d --build
```

Docker exposes the management UI and gateway routes through `http://127.0.0.1:3458` by default. Read the [Docker deployment guide](https://ccrdesk.top/en/guides/docker/) before exposing CCR remotely.

## How it works

```text
Claude Code · Codex · Grok CLI · ZCode · Compatible API clients
                              │
                              ▼
                 Claude Code Router :3456
          Profiles · Routing · Credentials · Tools · Logs
                              │
                              ▼
             Selected provider, model, and account
```

## Core capabilities

| Area | Highlights |
| --- | --- |
| **Agents** | Profiles for Claude Code, Codex, Grok CLI, and ZCode; model overrides; scopes; environment settings; CLI and app launch entries; multi-instance workflows |
| **Providers** | Presets and custom endpoints; protocol probing; model discovery; connectivity checks; local login import where supported; single keys and credential pools |
| **Models & routing** | Searchable catalog; model descriptions for task selection; conditions on headers and bodies; prefixes; rewrites; retries; ordered fallbacks |
| **Tools & extensions** | Fusion models; ToolHub; built-in browser automation; Chrome login-state import; wrapper and core gateway plugins; local routes and virtual models |
| **Access & quotas** | Separate CCR client keys with expiration and local request, token, and image limits |
| **Observability** | Request and response details; resolved provider, model, and credential; status; latency; tokens; estimated cost; tool calls; agent traces |
| **Network & relay** | Local HTTP / HTTPS proxy, optional CA, network capture, and bot relay through Weixin iLink, WeCom, Slack, Discord, Telegram, LINE, Feishu, and DingTalk |

## Go deeper when you are ready

The complete documentation lives at **[ccrdesk.top](https://ccrdesk.top/)**.

- [Install and launch CCR](https://ccrdesk.top/en/guides/install/)
- [Configure providers](https://ccrdesk.top/en/guides/provider/)
- [Explore routing and configuration](https://ccrdesk.top/en/configuration/)
- [Use the CLI](https://ccrdesk.top/en/guides/cli/)
- [Deploy with Docker](https://ccrdesk.top/en/guides/docker/)
- [Troubleshoot common issues](https://ccrdesk.top/en/troubleshooting/)

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
