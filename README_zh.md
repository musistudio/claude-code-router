<h1 align="center">Claude Code Router Desktop</h1>

<p align="center">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/%F0%9F%87%AC%F0%9F%87%A7-English-000aff?style=flat" /></a>
  <a href="https://discord.gg/rdftVMaUcS"><img alt="Discord" src="https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/musistudio2026"><img alt="X" src="https://img.shields.io/badge/X-@musistudio2026-000000?logo=x&logoColor=white" /></a>
  <a href="https://github.com/musistudio/claude-code-router/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/musistudio/claude-code-router" /></a>
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

打包后的应用本身也是 CLI：不带参数启动会打开桌面 GUI；带上 CLI 风格的参数启动（例如 `Claude-Code-Router.AppImage 'My Profile' cli`，即 GUI 中「复制 CLI」按钮给出的那条命令）则会以无窗口方式运行相同的命令逻辑并退出，不会打开窗口，也不会启动重复的网关。

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

## Provider Deeplink

Provider 网站可以通过自定义协议打开 CCR 并导入模型服务配置：

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&api_key=sk-example&models=example-chat%2Cexample-coder&protocol=openai_chat_completions
```

支持的 query 参数：

- `name`：Provider 展示名称。
- `base_url`：Provider API Base URL。
- `api_key`：可选 Provider API Key。
- `models`：逗号或换行分隔的模型列表，也可以重复传入 `models=...`。
- `protocol`：`openai_chat_completions`、`openai_responses`、`anthropic_messages` 或 `gemini_generate_content`。

更大的 payload 可以通过 URL 编码 JSON 或 base64url JSON 传入 `payload` 字段。CCR 在写入外部链接导入的 Provider 前，总会弹出确认窗口。

## 插件

CCR 有两层插件：

- Core gateway plugins：使用 `providerPlugins` 和 `virtualModelProfiles`，会透传给 core gateway。
- Wrapper plugins：使用顶层 `plugins` 扩展 Electron wrapper，注册本地 HTTP 后端、添加 gateway route，或把代理模式流量路由到插件后端。

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

插件模块需要导出函数或包含 `setup(ctx)` 的对象。上下文支持：

- `ctx.registerGatewayRoute({ method, path, auth, handler })`
- `ctx.registerHttpBackend({ id, host, port, handler })`
- `ctx.registerProxyRoute({ host, paths, upstream, stripPathPrefix, rewritePathPrefix, headers })`
- `ctx.openSqliteStore({ filename, migrate })`
- `ctx.registerCoreGatewayProviderPlugin(plugin)`
- `ctx.registerCoreGatewayVirtualModelProfile(profile)`

本地插件示例见 [examples/plugins](examples/plugins)。

## 开发

```bash
npm install
npm run dev                  # 在开发模式下运行 CCR CLI（等同于 `ccr`）
npm run dev start            # 在开发模式下运行 CCR CLI（等同于 `ccr start`）
npm run dev:watch            # 启动带热重载的 Electron 应用（用于 UI 开发）
npm run typecheck
npm run build:assets
npm run build:app:mac
npm run build:app:win
```

`npm run dev` 就是开发模式下的 `ccr`：会构建一次 CLI，并将全部参数（包括不带参数的情况）原样转发给 `dist/main/cli.js`，例如 `npm run dev start` 的行为与 `ccr start` 完全一致。（不要加 `--` 分隔符——npm 会把它去掉，但 pnpm 会把它当作字面参数原样转发，导致命令解析失败。）`npm run dev:watch` 是另一套独立的 UI/应用开发流程——会构建全部内容、监听变更并启动 Electron 应用。开发环境下，CCR 使用 `~/.claude-code-router-dev/` 作为配置目录，并运行在备用端口（3466/3467），避免与生产实例冲突。启动 Electron 应用时还会向 `~/.claude-code-router-dev/bin/` 写入 `ccr` shim——将该目录加入 `PATH` 即可直接将其作为开发用 CLI 使用。

`npm run build:assets` 会把 Electron main process 和 renderer assets 编译到 `dist/`。

`npm run build` 会为当前平台打包应用，并把安装包写入 `release/`。

`npm run build:app:mac` 和 `npm run build:app:win` 会分别打包对应平台的应用产物。Linux AppImage 打包配置在 `electron-builder.json` 中。

`npm run build:app:mac` 会在 `release-local/` 生成本地测试用 macOS 包，使用 ad-hoc 签名。它适合免费 Apple Account 或只有 Apple Development 证书的本机测试，但不适合公开分发，因为用户下载后仍无法通过 Gatekeeper 公证检查。

macOS 发布包会使用 Developer ID 签名并提交 Apple 公证。运行 `npm run build:app:mac:release` 前，打包机器必须具备：可用的 `Developer ID Application` 证书（在 keychain 中，或通过 `CSC_LINK`/`CSC_KEY_PASSWORD` 提供）、已通过 `xcode-select` 选择完整 Xcode，以及下面任意一组公证凭据：

- `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`
- `APPLE_KEYCHAIN_PROFILE`，可选 `APPLE_KEYCHAIN`

macOS 打包 hook 会在产物生成前验证代码签名、公证票据 stapling 和 Gatekeeper 评估，避免发布未公证的安装包。

打包后的应用会通过 `electron-updater` 检查 GitHub Releases。测试本地更新源时，可以在启动应用前设置 `CCR_UPDATE_FEED_URL` 为 generic electron-updater feed URL。`CCR_UPDATE_ALLOW_PRERELEASE=1` 可以启用 prerelease 更新。

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
