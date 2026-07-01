<h1 align="center">Claude Code Router Desktop</h1>

<p align="center">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
  <a href="https://ccrdesk.top/"><img alt="文档" src="https://img.shields.io/badge/%E6%96%87%E6%A1%A3-ccrdesk.top-0ea5e9?style=flat" /></a>
</p>

<p align="center">
  <img src="blog/images/claude-code-router.png" alt="Claude Code Router Desktop 项目截图" />
</p>

Claude Code Router Desktop 是一个本地网关和桌面控制台，用来把 Claude Code、Codex、ZCode 以及兼容客户端的 Agent 请求路由到你真正想使用的模型服务。

CCR 在你的本机运行，Provider 配置保存在本地配置目录，并默认暴露本地网关地址：`http://localhost:8080`。

## 为什么使用 CCR

- 用一个本地入口连接多个 Agent 工具，不需要在每个客户端里重复配置 Provider。
- 不同任务使用不同模型，例如后台任务、推理任务、长上下文、图片任务或支持联网搜索的模型。
- 在不改变工作流的情况下混用不同 Provider。CCR 支持 OpenAI 兼容 API、Anthropic Messages、Gemini Generate Content、OpenRouter、DeepSeek、SiliconFlow、Moonshot、Kimi Code、Mistral、Z.AI、百炼以及自定义 Provider。
- 通过 fallback 路由、API Key 轮换、用量统计和请求日志来控制成本和可靠性。
- 使用桌面 UI 管理配置，减少手写 JSON。
- 通过插件、代理路由、本地 HTTP 后端和 Provider deeplink 扩展网关能力。

## 功能和特性

- **概览仪表盘**：查看系统状态、用量组件、账号余额、模型分布和分享卡片。
- **Provider 管理**：添加预设或自定义端点，探测协议支持，检测模型连通性，管理凭据，并在可用时查看账号余额。
- **路由规则**：配置默认路由、条件路由、模型前缀规则、失败降级和请求改写。
- **Agent配置**：为 Claude Code、Codex 和 ZCode 配置启动入口、模型、作用范围和多开 App 配置。
- **网关兼容层**：通过本地 CCR 模型网关转换支持的客户端请求。
- **代理模式**：通过本地代理捕获支持的 API 流量，可选系统代理和网络捕获。
- **扩展机制**：安装或加载 wrapper 插件，包括 Claude Design、Cursor Proxy 这类集成路由。
- **Fusion 组合模型**：把基础模型与视觉、联网搜索或 MCP 工具组合成新的可选模型。
- **Provider Deeplink**：通过 `ccr://provider?...` 链接导入 Provider 配置、manifest 和嵌入式一键导入按钮，写入前会弹出确认。

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

打开 **路由**，选择默认路由，添加条件规则，配置请求改写和失败降级。

如果需要更细粒度控制，使用 **添加路由规则** 添加模型前缀、请求条件或规则级失败降级目标。

### 3. 启动网关

打开 **服务**，点击 **启动**。页面显示运行中后，CCR 会在本机监听 `http://localhost:8080`。如果希望每次打开桌面应用时自动启动网关，可以启用自动启动。

### 4. 连接 Agent 工具

打开 **Agent配置**，选择要使用的客户端。配置 Claude Code、Codex 或 ZCode，选择目标模型和作用范围，然后应用配置。对于 App 入口，可以使用 **打开 Agent** 操作通过 CCR 打开目标应用。

### 5. 日常查看和调整

到 **设置 → 日志与观测** 打开请求日志和 Agent 观测。使用 **日志** 确认 `request model`、`resolved provider`、`resolved model`、状态码、tokens、耗时和错误；使用托盘窗口快速查看 Token 和账号状态。

## Provider Deeplink

Provider 网站可以通过自定义协议打开 CCR 并导入模型服务配置：

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&api_key=sk-example&models=example-chat%2Cexample-coder&protocol=openai_chat_completions
```

支持的 query 参数包括：

- `name`：Provider 展示名称。
- `base_url`：Provider API Base URL，直链导入时必填。
- `api_key`：可选 Provider API Key。
- `models`：逗号或换行分隔的模型列表，也可以重复传入 `models=...`。
- `protocol`：`openai_chat_completions`、`openai_responses`、`anthropic_messages` 或 `gemini_generate_content`。
- `icon`：Provider 图标 URL。
- `source`：Provider 官网或配置来源。
- `manifest`：远程 HTTPS manifest URL。
- `usage_url`、`fetch_usage`、`usage_method`、`usage_headers`、`usage_body`：可选账号用量读取配置。
- `balance`、`balance_unit`、`subscription`、`subscription_limit`、`subscription_reset`、`subscription_unit`、`subscription_window`：可选用量字段映射。

更大的 payload 可以通过 URL 编码 JSON 或 base64url JSON 传入 `payload` 字段，也可以传入 `manifest` 让 CCR 拉取远程 Provider manifest。Manifest 必须使用 HTTPS，返回 JSON，不能指向本地或内网地址，体积不能超过 128 KB。参数名和协议值必须使用上面的完整规范名；不再接受 `baseUrl`、`apiKey`、`model`、`type` 或 `openai` 等别名。

CCR 在写入外部链接导入的 Provider 前，总会弹出确认窗口。

## 扩展机制

CCR 有两层扩展：

- Wrapper plugin：使用顶层 `plugins` 扩展 Electron wrapper，注册本地 HTTP 路由、启动本地后端、拦截代理流量、添加内置浏览器入口、连接 Provider 账号用量。
- Core gateway plugin：使用 `providerPlugins` 或 `plugins[].coreGateway.providerPlugins` 扩展上游 Provider、认证方式或 core gateway 内部能力。`plugins[].coreGateway.virtualModelProfiles` 可以注入虚拟模型配置。

Wrapper plugin route 示例：

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

插件模块需要导出函数，或包含 `setup(ctx)` / `activate(ctx)` 的对象。上下文支持：

- `ctx.registerGatewayRoute({ method, path, auth, handler })`
- `ctx.registerHttpBackend({ id, host, port, handler })`
- `ctx.registerProxyRoute({ host, paths, upstream, stripPathPrefix, rewritePathPrefix, headers })`
- `ctx.registerApp(app)`
- `ctx.openSqliteStore({ filename, migrate })`
- `ctx.registerProviderAccountConnector(connector)`
- `ctx.registerCoreGatewayProviderPlugin(plugin)`
- `ctx.registerCoreGatewayVirtualModelProfile(profile)`

本地插件示例见 [examples/plugins](examples/plugins)。

## 深入阅读

- [项目动机和工作原理](blog/zh/项目初衷及原理.md)
- [也许我们可以用路由器做更多事情](blog/zh/或许我们能在Router中做更多事情.md)

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

<table>
  <tr>
    <td align="center" width="260">
      <a href="https://www.bigmodel.cn/claude-code?ic=FPF9IVAGFJ"><strong>Z智谱</strong></a>
    </td>
    <td align="center" width="260">
      <a href="https://aihubmix.com/"><strong>AIHubmix</strong></a>
    </td>
  </tr>
  <tr>
    <td align="center" width="260">
      <a href="https://ai.burncloud.com"><strong>BurnCloud</strong></a>
    </td>
    <td align="center" width="260">
      <a href="https://share.302.ai/ZGVF9w"><strong>302.AI</strong></a>
    </td>
  </tr>
</table>

<h4>社区赞助者</h4>

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

<sub>如果你的名字被打码，请通过我的主页邮箱联系我更新为 GitHub 用户名。</sub>

</div>

## 许可证

本项目基于 [MIT License](LICENSE) 发布。
