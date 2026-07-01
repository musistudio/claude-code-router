<h1 align="center">Claude Code Router Desktop</h1>

<p align="center">
  <a href="README_zh.md"><img alt="Chinese README" src="https://img.shields.io/badge/%F0%9F%87%A8%F0%9F%87%B3-%E4%B8%AD%E6%96%87%E7%89%88-ff0000?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
  <a href="https://ccrdesk.top/"><img alt="Documentation" src="https://img.shields.io/badge/Docs-ccrdesk.top-0ea5e9?style=flat" /></a>
</p>

<p align="center">
  <img src="blog/images/claude-code-router.png" alt="Claude Code Router Desktop screenshot" />
</p>

Claude Code Router Desktop is a local gateway and desktop control panel for routing agent requests from Claude Code, Codex, ZCode, and compatible clients to the model provider you actually want to use.

CCR runs on your machine, keeps provider configuration in your local config directory, and exposes the local gateway at `http://localhost:8080` by default.

## Why Use CCR

- Use one local endpoint for multiple agent tools instead of configuring every client separately.
- Route requests with default routing, conditional rules, fallback targets, and request rewrites instead of editing client configuration by hand.
- Mix providers without changing your workflow. CCR supports OpenAI-compatible APIs, Anthropic Messages, Gemini Generate Content, OpenRouter, DeepSeek, SiliconFlow, Moonshot, Kimi Code, Mistral, Z.AI, Bailian, and custom providers.
- Control cost and reliability with fallback routing, API key rotation, usage statistics, and request logs.
- Manage everything from a desktop UI instead of editing JSON by hand.
- Extend the gateway with plugins, proxy routes, local HTTP backends, and provider deeplinks.

## Features

- **Overview dashboard**: inspect system status, usage widgets, account balances, model distribution, and share cards.
- **Provider management**: add provider presets or custom endpoints, probe protocol support, test model connectivity, manage credentials, and monitor supported account balances where available.
- **Routing rules**: configure default routing, conditional and model-prefix rules, fallback handling, and request rewrites.
- **Agent Config**: configure Claude Code, Codex, and ZCode launch entries, models, scopes, and multi-instance app profiles.
- **Gateway compatibility**: translate supported client requests through the local CCR model gateway.
- **Proxy mode**: capture supported API traffic through a local proxy with optional system proxy integration and network capture.
- **Extensions**: install or load wrapper plugins, including routes for Claude Design and Cursor Proxy style integrations.
- **Fusion models**: combine a base model with vision, web search, or MCP tools into a reusable selectable model.
- **Provider deeplinks**: import provider configuration, manifests, and embeddable one-click provider buttons through `ccr://provider?...` links after user confirmation.

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
   - Windows: `%APPDATA%\Claude Code Router\config.sqlite`

CCR stores runtime configuration in SQLite. A legacy `config.json` is read only once for migration when no SQLite config exists.

After the service is started from the **Server** page, CCR listens on `http://localhost:8080` by default. The **Server** page controls the gateway `Host`, `Port`, proxy mode, system proxy, network capture, and CA certificate status.

## Quick Start

CCR can be configured entirely from the desktop UI. Use this setup order for a clean first run.

### 1. Add a provider

Open **Providers**, click **Add Provider**, then choose a built-in preset or **Other / custom API endpoint**. Fill in the provider name, base URL, protocol, API key, and model list. Run protocol probing and model connectivity checks when available, then save the provider.

### 2. Configure routing

Open **Routing** to choose the default route, add conditional rules, configure request rewrites, and set fallback behavior.

Use **Add Routing Rule** for request conditions, model-prefix routing, or rule-level fallback targets.

### 3. Start the gateway

Open **Server** and click **Start**. After the page shows Running, CCR listens on `http://localhost:8080`. Enable **Auto start** if you want CCR to start the local gateway whenever the desktop app opens.

### 4. Connect your agent tool

Open **Agent Config** and choose the client you want to use. Configure Claude Code, Codex, or ZCode, select the target model and effect scope, then apply the config. For app entries, use the **Open Agent** action to open the target app through CCR.

### 5. Monitor and adjust

Use **Settings → Logs & Observability** to enable request logs and agent observability. Use **Logs** to confirm `request model`, `resolved provider`, `resolved model`, status, tokens, latency, and errors; use the tray window for quick token and account status.

## Provider Deeplink

Provider websites can open CCR and import a model provider with a custom protocol link:

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&api_key=sk-example&models=example-chat%2Cexample-coder&protocol=openai_chat_completions
```

Supported query parameters include:

- `name`: display name for the provider.
- `base_url`: provider API base URL; required for direct imports.
- `api_key`: optional provider API key.
- `models`: comma-separated or newline-separated model list. You can also repeat `models=...`.
- `protocol`: one of `openai_chat_completions`, `openai_responses`, `anthropic_messages`, or `gemini_generate_content`.
- `icon`: provider icon URL.
- `source`: provider website or config source.
- `manifest`: remote HTTPS manifest URL.
- `usage_url`, `fetch_usage`, `usage_method`, `usage_headers`, `usage_body`: optional account usage fetching configuration.
- `balance`, `balance_unit`, `subscription`, `subscription_limit`, `subscription_reset`, `subscription_unit`, `subscription_window`: optional usage field mappings.

For larger payloads, pass `payload` as URL-encoded JSON or base64url JSON with the same fields, or pass `manifest` to let CCR fetch a remote provider manifest. Manifest URLs must use HTTPS, return JSON, avoid local or private network hosts, and stay under 128 KB. Parameter names and protocol values must use the exact names above; aliases such as `baseUrl`, `apiKey`, `model`, `type`, or `openai` are not accepted.

CCR always opens a confirmation dialog before writing a provider imported from an external link.

## Extensions

CCR has two extension layers:

- Wrapper plugins: use top-level `plugins` to extend the Electron wrapper, register local HTTP routes, start local HTTP backends, route proxy-mode traffic to plugin backends, add built-in browser entries, and connect provider account meters.
- Core gateway plugins: use `providerPlugins` or `plugins[].coreGateway.providerPlugins` to extend upstream provider, auth, or core gateway behavior. `plugins[].coreGateway.virtualModelProfiles` can inject virtual model profiles.

Example wrapper plugin route:

```json
{
  "plugins": [
    {
      "id": "local-admin-api",
      "enabled": true,
      "proxy": {
        "routes": [
          {
            "id": "admin-api",
            "host": "api.example.com",
            "paths": ["/v1/admin"],
            "upstream": "http://127.0.0.1:4510",
            "stripPathPrefix": false
          }
        ]
      }
    }
  ]
}
```

Plugin modules export a function or an object with `setup(ctx)` or `activate(ctx)`. The context supports:

- `ctx.registerGatewayRoute({ method, path, auth, handler })`
- `ctx.registerHttpBackend({ id, host, port, handler })`
- `ctx.registerProxyRoute({ host, paths, upstream, stripPathPrefix, rewritePathPrefix, headers })`
- `ctx.registerApp(app)`
- `ctx.openSqliteStore({ filename, migrate })`
- `ctx.registerProviderAccountConnector(connector)`
- `ctx.registerCoreGatewayProviderPlugin(plugin)`
- `ctx.registerCoreGatewayVirtualModelProfile(profile)`

Local plugin examples are available in [examples/plugins](examples/plugins).

## Further Reading

- [Project Motivation and How It Works](blog/en/project-motivation-and-how-it-works.md)
- [Maybe We Can Do More with the Router](blog/en/maybe-we-can-do-more-with-the-route.md)

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

<table>
  <tr>
    <td align="center" width="260">
      <a href="https://www.bigmodel.cn/claude-code?ic=FPF9IVAGFJ">
        <img src="/docs/public/provider-icons/zhipu-cn-general.png" width="42" height="42" alt="Zhipu icon" />
        <br />
        <strong>Z智谱</strong>
      </a>
    </td>
    <td align="center" width="260">
      <a href="https://aihubmix.com/">
        <img src="https://www.google.com/s2/favicons?domain=aihubmix.com&amp;sz=128" width="42" height="42" alt="AIHubmix icon" />
        <br />
        <strong>AIHubmix</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="260">
      <a href="https://ai.burncloud.com">
        <img src="https://www.burncloud.com/favicon.png" width="42" height="42" alt="BurnCloud icon" />
        <br />
        <strong>BurnCloud</strong>
      </a>
    </td>
    <td align="center" width="260">
      <a href="https://share.302.ai/ZGVF9w">
        <img src="https://www.google.com/s2/favicons?domain=302.ai&amp;sz=128" width="42" height="42" alt="302.AI icon" />
        <br />
        <strong>302.AI</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="260">
      <a href="https://runapi.co/register?aff=IX1t">
        <img src="/docs/public/provider-icons/runapi.jpg" width="42" height="42" alt="RunAPI icon" />
        <br />
        <strong>RunAPI</strong>
      </a>
    </td>
    <td align="center" width="260">
    </td>
  </tr>
</table>

<h4>Community Sponsors</h4>

<table>
  <tr>
    <td align="center" width="25%">@Simon Leischnig</td>
    <td align="center" width="25%"><a href="https://github.com/duanshuaimin">@duanshuaimin</a></td>
    <td align="center" width="25%"><a href="https://github.com/vrgitadmin">@vrgitadmin</a></td>
    <td align="center" width="25%">@*o</td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/ceilwoo">@ceilwoo</a></td>
    <td align="center">@*说</td>
    <td align="center">@*更</td>
    <td align="center">@K*g</td>
  </tr>
  <tr>
    <td align="center">@R*R</td>
    <td align="center"><a href="https://github.com/bobleer">@bobleer</a></td>
    <td align="center">@*苗</td>
    <td align="center">@*划</td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Clarence-pan">@Clarence-pan</a></td>
    <td align="center"><a href="https://github.com/carter003">@carter003</a></td>
    <td align="center">@S*r</td>
    <td align="center">@*晖</td>
  </tr>
  <tr>
    <td align="center">@*敏</td>
    <td align="center">@Z*z</td>
    <td align="center">@*然</td>
    <td align="center"><a href="https://github.com/cluic">@cluic</a></td>
  </tr>
  <tr>
    <td align="center">@*苗</td>
    <td align="center"><a href="https://github.com/PromptExpert">@PromptExpert</a></td>
    <td align="center">@*应</td>
    <td align="center"><a href="https://github.com/yusnake">@yusnake</a></td>
  </tr>
  <tr>
    <td align="center">@*飞</td>
    <td align="center">@董*</td>
    <td align="center">@*汀</td>
    <td align="center">@*涯</td>
  </tr>
  <tr>
    <td align="center">@*:-）</td>
    <td align="center">@**磊</td>
    <td align="center">@*琢</td>
    <td align="center">@*成</td>
  </tr>
  <tr>
    <td align="center">@Z*o</td>
    <td align="center">@*琨</td>
    <td align="center"><a href="https://github.com/congzhangzh">@congzhangzh</a></td>
    <td align="center">@*_</td>
  </tr>
  <tr>
    <td align="center">@Z*m</td>
    <td align="center">@*鑫</td>
    <td align="center">@c*y</td>
    <td align="center">@*昕</td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/witsice">@witsice</a></td>
    <td align="center">@b*g</td>
    <td align="center">@*亿</td>
    <td align="center">@*辉</td>
  </tr>
  <tr>
    <td align="center">@JACK</td>
    <td align="center">@*光</td>
    <td align="center">@W*l</td>
    <td align="center"><a href="https://github.com/kesku">@kesku</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/biguncle">@biguncle</a></td>
    <td align="center">@二吉吉</td>
    <td align="center">@a*g</td>
    <td align="center">@*林</td>
  </tr>
  <tr>
    <td align="center">@*咸</td>
    <td align="center">@*明</td>
    <td align="center">@S*y</td>
    <td align="center">@f*o</td>
  </tr>
  <tr>
    <td align="center">@*智</td>
    <td align="center">@F*t</td>
    <td align="center">@r*c</td>
    <td align="center"><a href="https://github.com/qierkang">@qierkang</a></td>
  </tr>
  <tr>
    <td align="center">@*军</td>
    <td align="center"><a href="https://github.com/snrise-z">@snrise-z</a></td>
    <td align="center">@*王</td>
    <td align="center"><a href="https://github.com/greatheart1000">@greatheart1000</a></td>
  </tr>
  <tr>
    <td align="center">@*王</td>
    <td align="center">@zcutlip</td>
    <td align="center"><a href="https://github.com/Peng-YM">@Peng-YM</a></td>
    <td align="center">@*更</td>
  </tr>
  <tr>
    <td align="center">@*.</td>
    <td align="center">@F*t</td>
    <td align="center">@*政</td>
    <td align="center">@*铭</td>
  </tr>
  <tr>
    <td align="center">@*叶</td>
    <td align="center">@七*o</td>
    <td align="center">@*青</td>
    <td align="center">@**晨</td>
  </tr>
  <tr>
    <td align="center">@*远</td>
    <td align="center">@*霄</td>
    <td align="center">@**吉</td>
    <td align="center">@**飞</td>
  </tr>
  <tr>
    <td align="center">@**驰</td>
    <td align="center">@x*g</td>
    <td align="center">@**东</td>
    <td align="center">@*落</td>
  </tr>
  <tr>
    <td align="center">@哆*k</td>
    <td align="center">@*涛</td>
    <td align="center"><a href="https://github.com/WitMiao">@苗大</a></td>
    <td align="center">@*呢</td>
  </tr>
  <tr>
    <td align="center">@d*u</td>
    <td align="center">@crizcraig</td>
    <td align="center">s*s</td>
    <td align="center">*火</td>
  </tr>
  <tr>
    <td align="center">*勤</td>
    <td align="center">**锟</td>
    <td align="center">*涛</td>
    <td align="center">**明</td>
  </tr>
  <tr>
    <td align="center">*知</td>
    <td align="center">*语</td>
    <td align="center">*瓜</td>
    <td align="center"></td>
  </tr>
</table>

<sub>If your name is masked, please contact me via my homepage email to update it with your GitHub username.</sub>

</div>

## License

This project is licensed under the [MIT License](LICENSE).
