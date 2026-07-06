<h1 align="center">Claude Code Router</h1>

<p align="center">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
  <a href="https://github.com/musistudio/claude-code-router/releases"><img alt="桌面端下载次数" src="https://img.shields.io/github/downloads/musistudio/claude-code-router/total?label=%E6%A1%8C%E9%9D%A2%E7%AB%AF%E4%B8%8B%E8%BD%BD&logo=github" /></a>
  <a href="https://ccrdesk.top/"><img alt="文档" src="https://img.shields.io/badge/%E6%96%87%E6%A1%A3-ccrdesk.top-0ea5e9?style=flat" /></a>
</p>

<p align="center">
  <img src="blog/images/claude-code-router.png" width="720" alt="Claude Code Router Desktop 项目截图" />
</p>

Claude Code Router Desktop 是一个本地网关和桌面控制台，用来把 Claude Code、Codex、ZCode 以及兼容客户端的 Agent 请求路由到你真正想使用的模型服务。

## 为什么使用 CCR

- 用一个本地入口连接多个 Agent 工具，不需要在每个客户端里重复配置 Provider。
- 在不改变工作流的情况下混用不同 Provider。CCR 支持 OpenAI 兼容 API、Anthropic Messages、Gemini Generate Content、OpenRouter、DeepSeek、SiliconFlow、Moonshot、Kimi Code、Mistral、Z.AI、百炼以及自定义 Provider。
- 通过 fallback 路由、API Key 轮换、用量统计和请求日志来控制成本和可靠性。

## 功能和特性

- **概览仪表盘**：查看系统状态、用量组件、账号余额、模型分布和分享卡片。
- **Provider 管理**：添加预设或自定义端点，探测协议支持，检测模型连通性，管理凭据，并在可用时查看账号余额。
- **路由规则**：配置条件路由、模型前缀规则、失败降级和请求改写。
- **Agent配置**：为 Claude Code、Codex 和 ZCode 配置启动入口、模型、作用范围和多开 App 配置。
- **网关兼容层**：通过本地 CCR 模型网关转换支持的客户端请求。
- **代理模式**：通过本地代理捕获支持的 API 流量，可选系统代理和网络捕获。
- **Fusion 组合模型**：把基础模型与视觉、联网搜索或 MCP 工具组合成新的可选模型。

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

从 **服务** 页面启动后，CCR 默认监听 `http://localhost:8080`。**服务** 页面负责配置网关 `Host`、`Port`、代理模式、系统代理、网络捕获和 CA 证书状态。

## 快速开始

CCR 可以完全通过桌面 UI 完成配置。首次使用建议按下面顺序操作。

### 1. 添加 Provider

打开 **供应商**，点击 **添加供应商**，选择内置预设或 **其他 / 自定义 API 端点**。按表单填写 Provider 名称、基础 URL、协议、API Key 和模型列表。可用时先运行协议探测和模型连通性检查，然后保存 Provider。

### 2. 设置路由

打开 **路由**，添加条件规则，配置请求改写和失败降级。

如果需要更细粒度控制，使用 **添加路由规则** 添加模型前缀、请求条件或规则级失败降级目标。

### 3. 启动网关

打开 **服务**，点击 **启动**。页面显示运行中后，CCR 会在本机监听 `http://localhost:8080`。如果希望每次打开桌面应用时自动启动网关，可以启用自动启动。

### 4. 连接 Agent 工具

打开 **Agent配置**，选择要使用的客户端。配置 Claude Code、Codex 或 ZCode，选择目标模型和作用范围，然后应用配置。对于 App 入口，可以使用 **打开 Agent** 操作通过 CCR 打开目标应用。

### 5. 日常查看和调整

到 **设置 → 日志与观测** 打开请求日志和 Agent 观测。使用 **日志** 确认 `request model`、`resolved provider`、`resolved model`、状态码、tokens、耗时和错误；使用托盘窗口快速查看 Token 和账号状态。

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
