---
title: Claude Code Router 使用指南
pageTitle: 使用指南
eyebrow: 上手指南
lead: 这是一份手把手带你跑通 Claude Code Router 的指南。我们会从下载安装开始，一步步接入你的第一个模型、把 Agent 接进来、看到请求真的走了 CCR。不需要你手动编辑任何配置文件。
---

如果你是第一次用 CCR，建议从头顺着读一遍——大概十几分钟，你就能把整套链路跑通。已经有经验的读者可以直接跳到对应章节，每一步都包含了「怎么确认自己没做错」的验证方法。

## CCR 能帮你做什么

一句话：**它让你在一个地方管理 Claude Code、Codex、ZCode 等 Agent 要用的模型和 Key，并按任务选择合适的模型。**

这样做的好处是：

- 你不用在每个 Agent 里重复配置模型和 Key。
- 不同任务可以用不同模型：简单任务用便宜的快模型，难题用强模型，看图用多模态模型，需要联网时用带搜索的模型。
- 一个模型出错时，可以自动换到备用模型。
- 你可以在 Logs 里看到每次请求用了哪个模型、是否成功、费用大概花在哪。

后面的步骤会带你完成三件事：接入模型、设置路由、让 Agent 通过 CCR 使用这些配置。正常使用时，你只需要在界面里按步骤配置，不需要手动编辑配置文件。

## 第一步：安装并启动 CCR

### 下载安装

1. 打开 [GitHub Releases](https://github.com/musistudio/claude-code-router/releases) 页面。
2. 按你的系统下载对应的安装包：
   - macOS：`.dmg` 或 `.zip`
   - Windows：`.exe`
   - Linux：`.AppImage`
3. 像装普通软件一样安装并打开 **Claude Code Router**。

### 启动 CCR 服务

打开 App 后，进入 **Server** 页面，点击 **Start**。

> **怎么算成功：** Server 页面显示正在运行。如果你想以后开 App 就自动启动，把 **Auto start** 打开。

到这里 CCR 本身就跑起来了，但还不能处理请求，因为你还没有接入模型。下一步我们就来完成这件事。

## 第二步：接入你的第一个 Provider

Provider 就是 CCR 转发请求要去到的「上游模型服务」，比如 OpenRouter、DeepSeek、Z.AI，或者任何兼容 OpenAI / Anthropic / Gemini 协议的服务。

### 添加 Provider

1. 进入 **Providers** 页面，点击 **Add Provider**。
2. 先在 **Provider preset** 里挑一个内置预设。预设的好处是它会自动帮你填好常见的 Base URL、图标和协议，省得你查文档。如果你的服务不在列表里，选 **Other / custom API endpoint**。
3. 依次填写：
   - **Name**：在 CCR 里显示的名字，起个短一点、认得出的就行，比如 `openrouter`、`deepseek`。
   - **Base URL**：上游服务地址。自定义 Provider 一定要确认地址里包含了正确的 API 路径。
   - **Protocol**：上游真正支持的协议。选错了通常连通性检查就过不了。拿不准的话用下面的协议探测。
   - **API Key**：填你的 Key。只用一个 Key 的话填这里就够了。
   - **Models**：把这个 Provider 要暴露给 CCR 的模型列出来，模型选择器就是从这里取选项的。
4. 填完别急着保存，先做连通性检查（见下）。

### 协议怎么选

| 协议 | 适用场景 |
| --- | --- |
| OpenAI Chat Completions | 绝大多数 OpenAI 兼容服务（最常见） |
| OpenAI Responses | 支持 Responses API 的服务 |
| Anthropic Messages | Anthropic 官方或兼容它的服务 |
| Gemini Generate Content | Gemini 官方或兼容它的服务 |

> **拿不准协议时：** 先用 App 自带的协议探测（Protocol probe）扫一下。探测结果只是参考，最终还是要以 Provider 官方文档和连通性检查为准。

### 保存前做这三项检查

把问题在这一步卡住，后面 Routing 和 Agent 出错时就不会乱猜了：

1. **Protocol probe**：确认这个 Base URL 到底支持哪些协议。
2. **Model connectivity check**：挑一两个模型实际发个测试请求，看能不能通。
3. **Account usage test**（可选）：如果你开了用量统计，顺便确认余额和配额能正常读出来。

三项都绿了，再点保存。

> **怎么算成功：** 保存后这个 Provider 出现在列表里，至少一个模型的状态是可用的。你可以随手发一个测试请求，应该能拿到正常响应。

### 想用多个 Key？（可选）

个人用单 Key 够了；如果是团队或高频调用，建议打开 **Credentials** 加多条 Key，CCR 会自动轮换：

1. 在 Provider 表单里打开 **Credentials**。
2. 点 **Add credential**。
3. 给每条 Key 填一个 **Label**，方便在 Logs 里认出来。
4. 设 **Priority**：数字越小越优先用。
5. 设 **Weight**：同一优先级里，权重越大分到的请求越多。
6. 如果 Key 有配额限制，填 **Limits**，方便看出哪条快到顶了。
7. 保存后发几条测试请求，到 Logs 里按 Credential 筛一下，确认轮换符合预期。

### 想在面板上看余额？（可选）

如果你希望 Overview 上直接显示某个 Provider 的余额、剩余配额，就打开 **Account / Usage**：

1. 选一个 usage 接入方式。有内置标准接口就优先用内置；覆盖不到再考虑 HTTP JSON 或 Plugin。
2. 填好认证方式和 endpoint。
3. 点 **Test** 读一次数据。
4. 从返回结果里勾选「余额、剩余量、已用量、重置时间」等字段。
5. 回到 Overview，加一个 **Account balance** 组件。

> **安全提醒：** 别把 Provider 的 API Key 发给来路不明的 usage endpoint。自定义 endpoint 一定要先确认域名和权限范围再填。

接入 Provider 之后，CCR 已经知道「有哪些模型可以用」了，但它还不知道「该用哪一个」。下一步就来定路由。

## 第三步：设置路由（决定请求去哪个模型）

进入 **Routing** 页面。这里控制的是：**不同的请求，分别交给哪个模型处理。**

最核心的一项是 **Default route**——它是所有没有命中任何特殊规则时的兜底模型。先把这一项配好，你就已经有一个能用的最小配置了。

### 推荐的配置顺序

1. **Default**：选一个稳定、能扛主要任务的模型。这是你的「主力」。
2. **Background**：选一个便宜、快的模型，用来跑后台总结、上下文压缩这类不重要的活。
3. **Thinking**：选一个推理能力强的模型，留给需要深度思考的任务。
4. **Long context**：选一个上下文窗口大的模型，并设好触发阈值（超过多少 token 才切到它）。
5. **Image**：如果图片任务你想走 Fusion 或某个多模态模型，在这里指定。
6. **Web search**：如果搜索任务走 Fusion，在这里指定。
7. **Fallback**：选一个模型挂掉时的兜底策略。常见做法是先 retry，失败再按一条 model chain 依次尝试备用模型。

> **新手建议：** 第一次配置时，把 Default 配好就够了。Background、Thinking 这些都可以等你有需要了再回来加。

### 需要更精细的控制？（可选）

点 **Add Routing Rule** 可以加规则。每种规则的用途：

| 规则类型 | 什么时候用 |
| --- | --- |
| model-prefix | 客户端传了特定模型名前缀时，分流到指定模型 |
| subagent | 按 subagent 信号选模型 |
| thinking / long-context / image / web-search | 按任务类型分流 |
| condition | 按请求字段、Header 或请求体内容匹配 |
| rewrite | 命中规则后改写请求体的某些字段，处理少数兼容性问题 |

> **怎么算成功：** 保存后随便发一个请求，打开 **Logs**，看这条记录里的 `request model`、`resolved provider`、`resolved model` 和状态码。如果命中的不是你想要的模型，优先检查：规则的顺序、匹配条件、以及 fallback 设置。

到这一步，CCR 已经知道「有哪些模型」和「请求该去哪个模型」了。最后一步，是让你的 Agent 真的把请求发给 CCR。

## 第四步：让 Agent 走 CCR（Profile）

进入 **Profiles** 页面。Profile 的作用，是让你选定的 Agent（Claude Code / Codex / ZCode）使用 CCR 里的模型和路由配置，这样请求才会经过 CCR 记录和管理。

开始前，先理解两个通用选项：

- **Scope**：
  - 选 **Only opened from CCR**：只在你从 CCR 里点开这个 Agent 时才走 CCR，不影响你系统里原本的 Agent 设置。**强烈建议先用这个**，方便试用又不出岔子。
  - 选 **System default**：让这个 Agent 默认就走 CCR。等你确认稳定了再切到这个。
- **Surface**：选 APP、CLI 或自动，取决于你打算从哪里启动这个 Agent。
- **Model**：可以选某个 Provider 模型，也可以选 Fusion 模型。

> **一条通用习惯：** Apply 之后，尽量从 CCR 里的「打开 Agent」按钮来启动它，这样 Bot、App 相关的能力才能生效。

### Claude Code

1. 在 Profiles 里选 **Claude Code**。
2. 选 **Model**（常规请求的模型）。
3. 如果想让后台轻量任务用便宜模型，设一下 **Small fast model**。
4. 确认 **Settings file** 指向你本机 Claude Code 的配置路径（默认值通常就对）。
5. 需要额外环境变量就在 **Env** 里加。
6. 点 **Apply**。
7. 用 **Open Agent** 从 CCR 启动 Claude Code。

> **验证：** 发一次请求，然后打开 **Logs**。这条记录的 Client 应该显示为 Claude Code，Provider 和模型应该和你在 Routing 里配的一致。如果是，说明整条链路通了。

### Codex

1. 在 Profiles 里选 **Codex**。
2. 确认 **Provider ID** 和 **Provider Name**（默认值一般直接能用）。
3. 选 **Model**，可以是普通 Provider 模型，也可以是 Fusion 模型。
4. 确认 **Config file**（默认是 Codex 的配置文件路径）。
5. 如果你用的是特定版本的 Codex CLI，填 **Codex CLI path** 和 **Codex home**；用默认安装的话不用填。
6. 按需打开 **CLI middleware** 和 **Show all sessions**。
7. 点 **Apply**，从 CCR 打开 Codex。

试用阶段用 **Only opened from CCR**，确认稳定后再改成 **System default**。

### ZCode

ZCode 走的是 App surface。配置时关注 **Model**、**Provider ID**、**Provider Name**，以及是否从 CCR 打开。它不需要 Codex CLI 那些字段。

### 复用本机已登录的 Agent（可选）

如果你这台机器已经登录过 Claude Code、Codex 或 ZCode，可以在 **Providers** 里把它们导入成 **Local Agent Provider**。导入后它们就像普通 Provider 一样出现在模型选择器里，适合复用已有的本地授权，不用再去申请 Key。

到这里，你已经拥有了一套**完整可用的最小系统**：Provider 接好了 → 路由配好了 → Agent 接进来了。下一步我们打开观察面板，确认一切真的在按你的预期运转。

## 第五步：打开观察面板，确认请求走了 CCR

这一步的目的是让你「看得见」——看得见请求来了没有、走了哪个模型、花了多少钱、有没有报错。

### 先把开关打开

Overview 想有数据，得先让 CCR 开始记录。去 **Settings → Observability**：

1. 打开 **Request logs**（这是 Logs 和大部分 Overview 组件的数据来源，**必开**）。
2. 打开 **Agent analysis**（如果你想在 Observability 里看 Agent 维度的汇总）。
3. **Capture network**（在 Server → Proxy 里）只在需要看原始网络包时才开，排查完记得关掉，因为它记录的信息更完整、也更敏感。

### 看什么：Overview

进入 **Overview**，点 **Edit widgets** 可以加组件。几个最常用的：

| 组件 | 回答的问题 |
| --- | --- |
| System status | 网关在不在跑、最近有没有活动 |
| Requests / Success rate | 请求量多少、成功率多少 |
| Estimated cost | 钱花多少了 |
| Token mix | 输入/输出/缓存/推理 token 各占多少 |
| Model distribution | 哪些模型被用得最多 |
| Provider analysis | 哪个 Provider 请求多、延迟高、报错多 |
| Account balance | 各 Provider 余额、配额还剩多少 |

你可以拖动调整位置和大小、切换展示样式、删除或重置成默认布局。几个现成的布局思路：

- **日常盯盘**：System status、Requests、Success rate、Usage trend、Provider analysis。
- **盯成本**：Estimated cost、Token mix、Model distribution、Account balance。
- **查性能**：Average latency、Errors、Provider analysis、Logs。

> **Overview 的定位：** 它回答的是「整体趋势正不正常」。一旦你看到某个数字不对劲（比如某模型成本突然飙高），再跳到 Logs 看具体某条请求。不要只用 Overview 去判断单次失败的原因。

### 看什么：Logs

**Logs** 是你排查单条请求的主战场。前提是 Request logs 已打开。

常用的玩法：

- 按**状态**筛成功或失败的请求。
- 按 **Provider / Model** 筛某个上游服务。
- 按 **Credential** 筛某条 API Key。
- 用搜索框找 request id、模型名、请求内容或响应内容。
- 点开任意一行，看 Header、请求体、响应体、报错、耗时、token、成本。

到这里，你就已经是一名合格的 CCR 使用者了。后面的内容是「进阶」——需要的时候再回来看。

## 进阶一：用 Fusion 把模型和工具组合起来

进入 **Fusion** 页面。它的作用是：**把「一个基础模型 + 一种工具能力」打包成一个新的模型选项**，保存后你能在 Routing 或 Profiles 里像选普通模型一样选它。

典型场景：让某个模型能看图、能联网搜索，或者能调用某个 MCP 工具。

### 创建一个 Fusion 模型

1. 点 **Add Fusion**。
2. 在 **New model** 里填一个别名。建议起个能体现能力的名字，比如带 `vision`、`search`、`tool` 后缀。
3. 在 **Base model** 里选负责最终回答的模型。
4. 在 **Tools** 里选内置工具或自定义 MCP 工具。
5. 选了图像工具，就接着配 **Vision model**；选了搜索工具，就接着配 **Search provider** 和相关环境变量。
6. 保存后，去 Routing 或 Profiles 里选这个 Fusion 模型。

> **稳妥做法：** 先用一个独立的 Profile 验证 Fusion 模型好不好用，确认没问题了，再把它放到全局 Default 或特殊路由里。

### 内置图像能力

选 `ccr-fusion-builtins / vision_understand`。适合截图诊断、OCR、UI 对比、图表解读、多图分析。

要点：

- **Vision model** 必须是真正支持图像理解的模型——它负责「看懂图」。
- **Base model** 负责「给出最终答案」。
- 先拿一张截图测通了，再把它塞进复杂的 Agent 工作流。

### 内置联网搜索

选 `ccr-fusion-builtins / web_search`。支持的搜索服务有：Brave、Bing、Google CSE、Serper、SerpAPI、Tavily、Exa。

要点：

- **Search provider** 选一个你已经开通的服务。
- 在 **Provider configuration** 里填该服务要求的 API Key 或环境变量。
- 保存后，用一个「需要实时信息」的问题测一下（比如「今天某地天气」）。
- 搜索失败的话，先检查搜索服务的 Key，再看 Logs 里的 Fusion 工具报错。

### 接自定义 MCP 工具

点 **Add custom MCP**，按工具类型选 transport：

- **stdio**：本地命令行工具。填 Command、Arguments、Working directory、Environment variables。
- **streamable-http / sse**：远程 MCP 服务。填 URL 和 Headers。
- **Discover tools**：读出这个 MCP server 暴露了哪些工具。
- **Request timeout / Startup timeout**：工具慢或启动慢就适当调大。

> **建议：** 只把稳定、响应快的 MCP 工具接进 Fusion。高风险的工具先在独立 Profile 里验证再放开。

## 进阶二：把 Agent 消息转发到 IM（Bot）

进入 **Bots** 页面，配置好后再到 **Profiles** 里绑定。

Bot 能把 Agent 的消息转发到 IM，还能在你空闲一段时间后，把任务接力到手机上继续看。适合长时间运行的任务、远程查看进度、或者人工接管。

### 配置步骤

1. 打开 **Bots**，点 **Add Bot**。
2. 选平台。支持：Weixin iLink、WeCom、Slack、Discord、Telegram、LINE、Feishu、DingTalk。
3. 选认证方式，不同平台要填的字段不一样（Bot Token、OAuth、App Secret、QR Login 之类）。
4. 填好平台要求的 ID、Token、Secret、Signing Secret 或 Robot Code。
5. 保存这个 Bot。
6. 打开 **Profiles**，编辑你想接 Bot 的那个 Agent Profile。
7. 打开 **Bot** 开关，选刚才创建的 Bot。
8. 想把 Agent 的输出也转过去，就开 **Forward agent messages**。
9. 想要手机接力，就开 **Handoff**，设好 **Idle seconds**，再选扫描到的 Wi-Fi 或蓝牙目标。

> **注意：** Bot 目前只转发「从 CCR 打开的 App」里产生的 Agent 消息，CLI 里跑的消息不会被转发。Handoff 目标扫描需要在 Electron 桌面 App 里使用。

### 各平台详细教程

每个平台的完整步骤（平台后台怎么建应用、字段对照、排查 FAQ）都有单独一篇：

- [Slack](bot-与-im-接力-agent/slack)
- [Discord](bot-与-im-接力-agent/discord)
- [Telegram](bot-与-im-接力-agent/telegram)
- [LINE](bot-与-im-接力-agent/line)
- [微信](bot-与-im-接力-agent/weixin-ilink)
- [企业微信](bot-与-im-接力-agent/wecom)
- [飞书](bot-与-im-接力-agent/feishu)
- [钉钉](bot-与-im-接力-agent/dingtalk)

## 遇到问题时，照着这个查

CCR 给了你三个排查入口：**Logs**（看请求历史）、**Observability**（看 Agent 汇总）、**Networking**（看临时网络抓包）。

### 快速对照表

| 你遇到的现象 | 先查这些 |
| --- | --- |
| Agent 没走 CCR | Server 在不在跑、Profile 有没有 Apply、Agent 是不是从 CCR 打开的、Scope 对不对 |
| 请求命中了错误的模型 | Routing 的 Default、规则顺序、匹配条件、fallback，再看 Logs 里的 resolved model |
| Provider 鉴权失败（401/403） | API Key、Credential、Base URL、协议、额外的 Header |
| 报 model not found（404） | Provider 的模型列表对不对、Routing 选的那个模型存不存在 |
| Fusion 没调用工具 | Fusion 工具选对没、Vision model 支不支持、搜索服务 Key 对不对、MCP 的 Discover tools 和 timeout |
| 请求超时 | 上游服务本身慢不慢、Fusion 工具慢不慢、timeout 设小了没 |
| 成本突然变高 | 按模型筛一下，看 token 组成和请求体大小 |
| 某条 Key 一直失败 | 按 Credential 筛，确认是它的问题后，必要时停用这条 Key |
| Bot 收不到消息 | Profile 里 Bot 开关开了没、是不是从 CCR 打开的 App、Forward agent messages 开了没、平台 Token 还有效吗 |
| Overview 没有数据 | Request logs 和 Agent analysis 开了没、之后有没有真的产生新请求 |

### 关于 Network capture

如果你需要看最原始的网络交换（请求/响应的 summary、header、query、body、raw），就去 **Server → Capture network** 打开，再到 **Networking** 看。可以暂停、恢复、刷新、清空。

> **提醒：** Network capture 记录的信息很完整，也因此更敏感。**只在排查时打开，查完就关掉**，别长期开着。

## 几个值得养成的好习惯

- **敏感信息要当心**：API Key、Bot Token、Secret、Usage endpoint 都属于敏感信息，只在可信环境里配置，别发到来路不明的服务。
- **改全局路由前先试**：要动全局 Routing 或 Default 时，先用一个单独的 Profile 验证，确认没问题再放开，避免影响正在用的 Agent。
- **定期看 Logs**：偶尔翻一下错误、token、成本和延迟，能在问题变大之前发现它。
- **重要 Provider 多备 Key**：给重要的 Provider 配多条 Credential，并设好优先级、权重和限制，单 Key 挂了不至于全线中断。
- **导入 deeplink 前核对**：通过 `ccr://provider?...` 导入 Provider 配置前，先看一眼来源、Base URL、协议和模型对不对，再点确认。

---

走到这里，你已经掌握了 CCR 的完整使用闭环：**接入 Provider → 配置路由 → 接上 Agent → 打开观察 → 按需扩展**。剩下的就是用起来，遇到具体问题再回到对应章节查。祝用得顺手。
