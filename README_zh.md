<h1 align="center">Claude Code Router</h1>

<p align="center">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
  <a href="https://github.com/musistudio/claude-code-router/releases"><img alt="桌面端下载次数" src="https://img.shields.io/github/downloads/musistudio/claude-code-router/total?label=%E6%A1%8C%E9%9D%A2%E7%AB%AF%E4%B8%8B%E8%BD%BD&logo=github" /></a>
  <a href="https://ccrdesk.top/"><img alt="文档" src="https://img.shields.io/badge/%E6%96%87%E6%A1%A3-ccrdesk.top-0ea5e9?style=flat" /></a>
</p>

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
        <strong>感谢 Kimi 赞助本项目！</strong>Kimi K2.7 Code 是 Moonshot AI 推出的编程专用开源智能体模型，在真实长程编程与复杂软件工程工作流中显著提升端到端任务成功率，同时优化推理效率，相比 K2.6 平均减少约 30% 的推理 token 消耗。在 CCR 中，Kimi 已作为内置供应商预设开箱即用：无论按量付费 API 还是 Kimi Code 订阅，一键导入即可把你的编程 Agent 请求路由到 Kimi，订阅端点原生直通、无需协议转换，API 端点自动适配，账户余额与订阅用量也能直接在 CCR 面板中查看。
      </p>
      <p align="center">
        CCR 已内置 Kimi 供应商预设。前往 Kimi 开放平台（<a href="https://platform.kimi.com?aff=ccr">中文站</a>｜<a href="https://platform.kimi.ai?aff=ccr">Global</a>）体验 API，或了解高性价比 <a href="https://www.kimi.com/code?aff=ccr">Coding Plan</a> 套餐。
      </p>
    </td>
  </tr>
</table>

</div>

Claude Code Router Desktop 是给编程 Agent 用的本地控制平面。它为 Claude Code、Codex、Grok CLI、ZCode 以及兼容 API 客户端提供一个稳定的本地入口，然后由你在 CCR 中决定每个请求应该走哪个供应商、哪个模型、哪套路由策略、哪些工具能力和哪组账号凭据。

相比在每个 Agent、每个模型服务里反复改配置，CCR 把模型层收束到本机桌面应用里：供应商预设、自定义端点、凭据池、Fallback、Fusion 组合模型、MCP 工具、请求日志、账号用量和 Agent 启动配置都在一个地方管理。

<p align="center">
  <img src="blog/images/claude-code-router.png" width="720" alt="Claude Code Router Desktop 项目截图" />
</p>

## CCR 能帮你做什么

| 目标 | CCR 提供的能力 |
| --- | --- |
| 保持 Agent 工作流不变，同时自由切换模型 | 为 Claude Code、Codex、Grok CLI、ZCode 创建本地配置档案，支持 CLI / App 启动入口和按配置选择模型 |
| 快速接入多个模型供应商 | 内置供应商预设、自定义 OpenAI / Anthropic / Gemini 兼容端点、协议探测、模型发现和连通性检测 |
| 把路由变成可配置策略 | 内置 Agent 路由、条件规则、请求改写、模型前缀路由、自动重试和 Fallback 模型链 |
| 控制成本和额度压力 | 凭据池、Key 轮换、本地限额、账号余额快照、Token / 成本仪表盘和托盘状态 |
| 给稳定模型补能力 | 通过 Fusion 给基础模型叠加视觉、联网搜索或指定 MCP 工具 |
| 让大量工具变得可用 | ToolHub 把多个 MCP server 收束成一个紧凑入口，让 Agent 按任务动态解析和调用工具 |
| 排查每一次请求 | 请求日志、最终供应商 / 模型、耗时、Token、成本估算、网络捕获和 Agent 观测链路 |

## 为什么使用 CCR

- **一个本地网关，接管整套 Agent 模型层**：客户端只需要指向 CCR，模型、供应商、Key、路由和工具能力都可以在桌面 UI 中调整。
- **换供应商，不换工作流**：支持 OpenAI Chat / Responses、Anthropic Messages、Gemini Generate Content / Interactions、OpenRouter、DeepSeek、SiliconFlow、Moonshot、Kimi Code、Mistral、Z.AI、百炼以及自定义兼容供应商。
- **可见、可改、可验证的可靠性策略**：配置请求什么时候改写、重试或切到备用模型，并在本地日志里确认真实命中结果。
- **面向 AI 工作流的运营视角**：从仪表盘或托盘查看请求量、Token、成本估算、成功率、延迟、模型分布、供应商用量和账号余额。
- **Agent 原生工具与扩展**：使用 Fusion 扩展模型能力，通过 ToolHub 暴露动态 MCP 工具，让内置浏览器参与任务，通过 IM Bot 接力 Agent，或安装本地扩展。

## 功能亮点

- **Agent 配置档案**：为 Claude Code、Codex、Grok CLI 和 ZCode 创建配置档案，支持模型覆盖、作用范围、CLI / App 启动方式、环境变量和多开 App 工作流。
- **供应商管理**：添加预设供应商或自定义端点；探测协议；发现模型列表；运行真实连通性检测；管理单 Key 或凭据池；在支持时导入本机 Agent 登录态。
- **模型目录**：搜索全部已配置模型，编辑模型描述，并把这些描述用于 Claude Code Subagent、Task 和 Workflow 的模型选择提示。
- **路由引擎**：组合内置 Agent 路由、请求 Header / Body 条件、模型前缀路由、请求改写、重试策略和有序 Fallback 目标。
- **Fusion 组合模型**：发布可复用的虚拟模型，在保留基础模型手感的同时增加视觉、托管联网搜索或指定 MCP 工具。
- **ToolHub**：把多个 MCP server 合并成一个动态 MCP server，让 Agent 只在任务需要时解析工具；桌面端还可暴露内置浏览器自动化和 Chrome 登录态导入。
- **API Key 与限额**：创建访问 CCR 的客户端 Key，设置过期时间和本地请求 / Token / 图片限额，与上游供应商凭据分开管理。
- **日志与观测**：查看请求 / 响应详情、最终供应商与模型、凭据、状态、耗时、Token、成本估算、工具调用和 Agent 执行链路。
- **代理与网络捕获**：把 CCR 作为本地 HTTP / HTTPS 代理运行，可选安装 CA 证书，把支持的 API 流量接入 CCR，并保存网络请求用于排查。
- **Bot 接力**：把 Agent 配置接入 Weixin iLink、企业微信、Slack、Discord、Telegram、LINE、飞书和钉钉等 IM 平台。
- **扩展机制**：安装 wrapper plugin 和 core gateway plugin，注册本地路由、代理路由、供应商账号连接器、内置应用和虚拟模型。

## 文档

完整文档见 [ccrdesk.top](https://ccrdesk.top/)。

## 下载和安装

1. 打开 [GitHub Releases 页面](https://github.com/musistudio/claude-code-router/releases)。
2. 按系统下载对应安装包：
   - macOS Apple 芯片：`Claude-Code-Router_<version>-mac-Apple-Silicon-arm64.dmg` 或 `.zip`
   - macOS Intel 芯片：`Claude-Code-Router_<version>-mac-Intel-x64.dmg` 或 `.zip`
   - Windows：`Claude Code Router_<version>.exe`
   - Linux：`Claude Code Router_<version>.AppImage`
3. 安装并启动 **Claude Code Router**。
4. 首次启动后，CCR 会创建本地配置数据库：
   - macOS/Linux：`~/.claude-code-router/config.sqlite`
   - Windows：`%APPDATA%\Claude Code Router\config.sqlite`

CCR 的运行配置存储在 SQLite 中。旧版 `config.json` 只会在没有 SQLite 配置时作为迁移来源读取一次。

从 **服务** 页面启动后，CCR 默认监听 `http://127.0.0.1:3456`。**服务** 页面负责配置网关 `Host`、`Port`、代理模式、系统代理、网络捕获和 CA 证书状态。

## 快速开始

CCR 可以完全通过桌面 UI 完成配置。首次使用建议按下面顺序操作。

### 1. 添加 Provider

打开 **供应商**，点击 **添加供应商**，选择内置预设、导入支持的本机 Agent 登录态，或选择 **其他 / 自定义 API 端点**。按表单填写 Provider 名称、基础 URL、协议、API Key 和模型列表。可用时先运行协议探测和模型连通性检查，然后保存 Provider。

### 2. 设置路由

打开 **路由**，启用内置 Agent 路由，添加条件规则，配置请求改写和失败降级。如果需要更细粒度控制，使用 **添加路由规则** 添加模型前缀、请求条件或规则级失败降级目标。

### 3. 启动网关

打开 **服务**，点击 **启动**。页面显示运行中后，CCR 默认会在本机监听 `http://127.0.0.1:3456`。如果希望每次打开桌面应用时自动启动网关，可以启用自动启动。

### 4. 连接 Agent 工具

打开 **Agent配置**，选择要使用的客户端。配置 Claude Code、Codex、Grok CLI 或 ZCode，选择目标模型和作用范围，然后应用配置。对于 App 入口，可以使用 **打开 Agent** 通过 CCR 打开目标应用。

### 5. 日常查看和调整

到 **设置 → 日志与观测** 打开请求日志和 Agent 观测。使用 **日志** 确认 `request model`、`resolved provider`、`resolved model`、状态码、tokens、耗时和错误；使用概览仪表盘和托盘窗口查看 Token、成本、模型分布和账号状态。

## 致谢

对 Codex 的支持来自于 [musistudio/codexl](https://github.com/musistudio/codexl) 这个项目。

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
