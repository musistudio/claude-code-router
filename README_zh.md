<div align="center">

<table width="100%">
  <tr>
    <td align="center">
      <a href="https://www.kimi.com/code?aff=ccr">
        <img src="https://gcdn.moonshot.cn/growth-cdn/sponsor/kimi-zh.png" width="960" alt="Kimi K2.7 Code 赞助横幅" />
      </a>
      <br />
      <sub>
        <a href="https://www.kimi.com/code?aff=ccr"><strong>Kimi Code 订阅</strong></a>
        &nbsp;·&nbsp;
        <a href="https://platform.kimi.com?aff=ccr"><strong>API 中文站</strong></a>
        &nbsp;·&nbsp;
        <a href="https://platform.kimi.ai?aff=ccr">API Global</a>
      </sub>
    </td>
  </tr>
  <tr>
    <td align="left">
      <p>
        <strong>感谢 Kimi 赞助本项目！</strong>Kimi K3 是 Moonshot AI 迄今能力最强的模型，也是全球首个开源 3T 级模型。K3 拥有 2.8T 参数、原生视觉能力与 100 万 Token 上下文，在长周期编码、知识工作和推理任务中展现前沿性能。在 CCR 中，Kimi 已作为内置供应商预设开箱即用：无论按量付费 API 还是 Kimi Code 订阅，一键导入即可将编程 Agent 的请求路由到 Kimi；订阅端点原生直通、无需协议转换，API 端点自动适配，账户余额与订阅用量也能直接在 CCR 面板中查看。
      </p>
      <p align="center">
        CCR 已内置 Kimi 供应商预设。前往 Kimi 开放平台（<a href="https://platform.kimi.com?aff=ccr">中文站</a>｜<a href="https://platform.kimi.ai?aff=ccr">Global</a>）体验 API，或了解 <a href="https://www.kimi.com/code?aff=ccr">Kimi Code 订阅</a>。
      </p>
    </td>
  </tr>
</table>

</div>

<div align="center">

# Claude Code Router

### 在一个地方，管理你所有的 Agent 与 Provider

让 Claude Code、Codex、Grok CLI、ZCode 和兼容 API 客户端连接你选择的供应商，并在一个应用里完成每次请求的路由、降级、增强与观测。

<p>
  <a href="https://github.com/musistudio/claude-code-router/releases"><img alt="下载桌面端" src="https://img.shields.io/badge/%E7%AB%8B%E5%8D%B3%E4%B8%8B%E8%BD%BD-%E6%A1%8C%E9%9D%A2%E5%AE%A2%E6%88%B7%E7%AB%AF-2563EB?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="#快速开始"><img alt="快速开始" src="https://img.shields.io/badge/%E7%AB%8B%E5%8D%B3%E4%BD%BF%E7%94%A8-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B-16A34A?style=for-the-badge&logo=rocket&logoColor=white" /></a>
  <a href="https://ccrdesk.top/"><img alt="查看文档" src="https://img.shields.io/badge/%E6%B7%B1%E5%85%A5%E4%BA%86%E8%A7%A3-%E5%AE%8C%E6%95%B4%E6%96%87%E6%A1%A3-0F172A?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
</p>

<p>
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
</p>

<br />

<img src="blog/images/claude-code-router.png" width="820" alt="Claude Code Router 桌面端控制台" />

</div>

## 为什么使用 Claude Code Router？

Claude Code Router（CCR）是面向编程 Agent 的本地模型网关与控制平面。它为 Claude Code、Codex、Grok CLI、ZCode 和兼容 API 客户端提供**一个稳定的本地入口**，让你在一个地方管理入口背后的供应商、模型、账号、路由规则与工具。

你可以使用 CCR：

- **统一管理所有 Agent 与 Provider**，不再为每个客户端维护一套独立模型配置。
- **切换供应商或模型而不改变工作流**，无需反复修改 Agent 配置文件。
- **通过重试、凭据池、Key 轮换和 Fallback 保持请求可用**。
- **通过 Fusion 视觉、联网搜索、MCP 工具和 ToolHub 扩展现有模型**。
- **通过请求日志、最终路由、耗时、Token、成本估算和账号状态了解真实运行情况**。

CCR 支持 OpenAI Chat / Responses、Anthropic Messages、Gemini Generate Content / Interactions、OpenRouter、DeepSeek、SiliconFlow、Moonshot、Kimi Code、Mistral、Z.AI、百炼以及自定义兼容供应商。

## 快速开始

### 桌面端（推荐）

1. **[下载 Claude Code Router](https://github.com/musistudio/claude-code-router/releases)**，选择 macOS、Windows 或 Linux 版本并启动应用。
2. 打开 **供应商 → 添加供应商**。选择内置预设或自定义端点，填写 API Key，选择协议与模型，然后保存。
3. 打开 **服务** 并点击 **启动**。本地模型网关默认监听 `http://127.0.0.1:3456`。
4. 打开 **Agent 配置档案**，选择 Claude Code、Codex、Grok CLI 或 ZCode，指定模型并应用配置档案。
5. 开始使用 Agent。在 **日志** 中确认最终供应商、模型、状态、Token、耗时与错误。

现在 Agent 已经连接到 CCR。如需增加条件规则、自动重试、请求改写或 Fallback 模型，请打开 **路由**。

<details>
<summary><strong>桌面安装包与本地数据位置</strong></summary>

- macOS Apple 芯片：`Claude-Code-Router_<version>-mac-Apple-Silicon-arm64.dmg` 或 `.zip`
- macOS Intel 芯片：`Claude-Code-Router_<version>-mac-Intel-x64.dmg` 或 `.zip`
- Windows：`Claude Code Router_<version>.exe`
- Linux：`Claude Code Router_<version>.AppImage`

运行配置使用 SQLite 存储：macOS / Linux 位于 `~/.claude-code-router/config.sqlite`，Windows 位于 `%APPDATA%\claude-code-router\config.sqlite`。只有在不存在 SQLite 配置时，CCR 才会读取一次旧版 `config.json` 用于迁移。

</details>

### CLI

npm CLI 要求 Node.js 22 或更高版本。无需 Electron，也能启动相同的模型网关与浏览器管理界面：

```sh
npm install -g @musistudio/claude-code-router
ccr ui
```

打开 `http://127.0.0.1:3458`，然后按照上面的 **供应商 → 服务 → Agent 配置档案** 流程操作。模型网关仍位于 `http://127.0.0.1:3456`。服务模式、鉴权和 Profile 命令见 [CLI 命令参考](https://ccrdesk.top/guides/cli/)。

### Docker

```sh
docker compose up -d --build
```

Docker 默认通过 `http://127.0.0.1:3458` 提供管理界面与网关路由。远程暴露 CCR 前，请先阅读 [Docker 部署指南](https://ccrdesk.top/guides/docker/)。

## 工作方式

```text
Claude Code · Codex · Grok CLI · ZCode · 兼容 API 客户端
                              │
                              ▼
                 Claude Code Router :3456
              配置档案 · 路由 · 凭据 · 工具 · 日志
                              │
                              ▼
                  命中的供应商、模型与账号
```

## 核心能力

| 能力领域 | 功能亮点 |
| --- | --- |
| **Agent** | Claude Code、Codex、Grok CLI 和 ZCode 配置档案；模型覆盖；作用范围；环境变量；CLI / App 启动入口；多开工作流 |
| **供应商** | 内置预设和自定义端点；协议探测；模型发现；连通性检测；按支持情况导入本机登录态；单 Key 与凭据池 |
| **模型与路由** | 可搜索模型目录；用于任务选择的模型描述；Header / Body 条件；模型前缀；请求改写；重试；有序 Fallback |
| **工具与扩展** | Fusion 模型；ToolHub；内置浏览器自动化；Chrome 登录态导入；wrapper / core gateway plugin；本地路由与虚拟模型 |
| **访问与额度** | 独立的 CCR 客户端 Key，可设置有效期以及本地请求、Token 和图片限额 |
| **日志与观测** | 请求 / 响应详情；最终供应商、模型与凭据；状态；耗时；Token；成本估算；工具调用；Agent 执行链路 |
| **网络与接力** | 本地 HTTP / HTTPS 代理、可选 CA、网络捕获，以及通过微信 iLink、企业微信、Slack、Discord、Telegram、LINE、飞书和钉钉接力 Agent |

## 准备好后，继续深入

完整文档位于 **[ccrdesk.top](https://ccrdesk.top/)**。

- [安装并启动 CCR](https://ccrdesk.top/guides/install/)
- [配置供应商](https://ccrdesk.top/guides/provider/)
- [了解路由与完整配置](https://ccrdesk.top/configuration/)
- [使用 CLI](https://ccrdesk.top/guides/cli/)
- [通过 Docker 部署](https://ccrdesk.top/guides/docker/)
- [排查常见问题](https://ccrdesk.top/troubleshooting/)

## 致谢

对 Codex 的支持来自 [musistudio/codexl](https://github.com/musistudio/codexl)。

## 支持与赞助

<div align="center">

<p>如果你觉得这个项目有帮助，欢迎赞助项目开发。非常感谢你的支持。</p>

<table>
  <tr>
    <td align="center" width="220">
      <a href="https://ko-fi.com/F1F31GN2GM">
        <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="通过 Ko-fi 赞助" />
      </a>
      <br />
      <sub>通过 Ko-fi 单次赞助</sub>
    </td>
    <td align="center" width="220">
      <a href="https://paypal.me/musistudio1999">
        <img src="https://img.shields.io/badge/PayPal-Sponsor-003087?logo=paypal&logoColor=white" alt="通过 PayPal 赞助" />
      </a>
      <br />
      <sub>国际赞助通道</sub>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td align="center" width="220">
      <strong>支付宝</strong>
      <br />
      <img src="/blog/images/alipay.jpg" width="160" alt="支付宝收款码" />
    </td>
    <td align="center" width="220">
      <strong>微信支付</strong>
      <br />
      <img src="/blog/images/wechat.jpg" width="160" alt="微信支付收款码" />
    </td>
  </tr>
</table>

</div>

### 我们的赞助商

<div align="center">

<p>非常感谢所有赞助商的慷慨支持。</p>

<table width="100%">
  <tr>
    <td align="center" width="330">
      <a href="https://www.bigmodel.cn/claude-code?ic=FPF9IVAGFJ">
        <img src="/docs/public/provider-icons/zhipu-cn-general.png" width="42" height="42" alt="智谱图标" />
        <br />
        <strong>Z智谱</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://aihubmix.com/">
        <img src="https://www.google.com/s2/favicons?domain=aihubmix.com&amp;sz=128" width="42" height="42" alt="AIHubmix 图标" />
        <br />
        <strong>AIHubmix</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://ai.burncloud.com">
        <img src="https://www.burncloud.com/favicon.png" width="42" height="42" alt="BurnCloud 图标" />
        <br />
        <strong>BurnCloud</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://share.302.ai/ZGVF9w">
        <img src="https://www.google.com/s2/favicons?domain=302.ai&amp;sz=128" width="42" height="42" alt="302.AI 图标" />
        <br />
        <strong>302.AI</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="330">
      <a href="https://runapi.co/register?aff=IX1t">
        <img src="/docs/public/provider-icons/runapi.jpg" width="42" height="42" alt="RunAPI 图标" />
        <br />
        <strong>RunAPI</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://teamorouter.com/">
        <img src="/docs/public/provider-icons/teamorouter.png" width="42" height="42" alt="TeamoRouter 图标" />
        <br />
        <strong>TeamoRouter</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://code0.ai/agent/register/9n9jOsSnYQoemIVL?utm_source=claudecoderouter&amp;utm_medium=partner&amp;utm_campaign=claudecoderouter_2026&amp;utm_content=default">
        <img src="/docs/public/provider-icons/code0.png" width="42" height="42" alt="code0.ai 图标" />
        <br />
        <strong>code0.ai</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://console.claudeapi.com/agent/register/LbmB7Y9kPloyzhwF?utm_source=claudecoderouter&amp;utm_medium=partner&amp;utm_campaign=claudecoderouter_2026&amp;utm_content=default">
        <img src="/docs/public/provider-icons/claudeapi.png" width="42" height="42" alt="claudeapi 图标" />
        <br />
        <strong>claudeapi</strong>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="330">
      <a href="https://s.qiniu.com/AVjMVf">
        <img src="/docs/public/provider-icons/qiniu-ai.png" width="42" height="42" alt="七牛云 AI 图标" />
        <br />
        <strong>七牛云 AI</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&amp;aff=9HHHAB5QLAES">
        <img src="/docs/public/provider-icons/fenno.jpg" width="42" height="42" alt="Fenno.ai 图标" />
        <br />
        <strong>Fenno.ai</strong>
      </a>
    </td>
    <td align="center" width="330">
      <a href="https://unity2.ai/register?source=claudecoderouter">
        <img src="/docs/public/provider-icons/unity2.jpg" width="42" height="42" alt="Unity2.Ai 图标" />
        <br />
        <strong>Unity2.Ai</strong>
      </a>
    </td>
  </tr>
</table>

<h4>社区赞助者</h4>

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

<sub>如果你的名字被打码，请通过我的主页邮箱联系我更新为 GitHub 用户名。</sub>

</div>

## 许可证

本项目基于 [MIT License](LICENSE) 发布。
