---
title: Claude Code Router 快速开始
pageTitle: 快速开始
eyebrow: 快速开始
lead: 本页是 CCR 的首次上手路径：安装并启动服务、接入第一个供应商、把 Agent 指向 CCR 网关，最后用请求日志和观测面板确认链路生效。适合第一次部署 CCR 的读者。
---

## 安装并启动 CCR

CCR 提供三种发行方式：桌面应用、Node.js 22+ 的 npm CLI，以及 Docker 单入口部署。

| 方式 | 启动入口 | 默认管理地址 | 默认模型网关 |
| --- | --- | --- | --- |
| 桌面应用 | 应用界面 / `ccr-app` | 应用内窗口 | `http://127.0.0.1:3456` |
| npm CLI | `ccr ui` / `ccr serve` | `http://127.0.0.1:3458` | `http://127.0.0.1:3456` |
| Docker | `docker compose up -d --build` | 与网关共用 `http://127.0.0.1:3458` | 与管理界面共用 Nginx 入口 |

先阅读 [安装页](install/) 选择发行方式；完整终端命令见 [CLI 参考](cli/)，容器端口、鉴权、持久化和升级见 [Docker 部署](docker/)。

## 接入供应商

供应商是 CCR 转发请求的上游模型服务，比如 OpenRouter、DeepSeek、Z.AI，或者任何兼容 OpenAI / Anthropic / Gemini 协议的服务。

### 添加供应商

1. 进入 **供应商** 页面，点击 **添加供应商**。
2. 在 **选择 预设供应商** 中选择内置预设。预设会自动填入常见的 API 地址、协议和图标。
3. 如果服务不在预设里，选择 **其他 / 自定义 API 地址**，并填写 **名称** 和 **API 地址**。
4. 在 **添加凭据** 步骤填写 **API 密钥**。

填写 API 地址和密钥后，CCR 会自动探测该端点支持的协议与可用模型。

### 协议

| 协议 | 适用场景 |
| --- | --- |
| OpenAI Chat | 绝大多数 OpenAI 兼容服务 |
| OpenAI Responses | 支持 Responses API 的服务 |
| Anthropic Messages | Anthropic 官方或兼容 Anthropic 协议的服务 |
| Gemini 生成 | Gemini 官方或兼容 Gemini 协议的服务 |

自动探测结果不理想时，可在高级设置中关闭自动探测并手动选择，再用连通性检查确认。

### 验证连通性

填好凭据和模型后，点击 **检测连通性**，用一次真实请求确认 API 地址、密钥、协议和模型是否可用。建议只勾选需要确认的模型，避免不必要的消耗。

### 多 Key 与用量读取

团队或高频调用场景，可在凭据步骤切换到 **凭据池**，添加多条上游 Key 并设置优先级、权重和限额，保存后到请求日志里按凭据筛选，确认轮换符合预期。

如果希望概览显示余额或剩余配额，在表单中打开 **获取用量**，选择用量读取方式并测试字段映射。

### 复用本机已登录的 Agent

如果本机已经登录过 Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI 或 ZCode，可以在 **供应商** 中导入为 **本机 Agent 供应商**，复用已有授权，不必额外申请 Key。

完整步骤与字段说明见 [接入供应商](provider/)。

## 接入 Agent 配置

Agent 配置让 Claude Code、Codex、OpenCode、Grok CLI、Kimi CLI、ZCode 等 Agent 使用 CCR 的供应商、路由和模型选择配置。

通用建议：

- 试用阶段优先选择“仅从 CCR 打开时生效”，只影响从 CCR 打开的 Agent。
- 稳定后再考虑系统默认配置。
- 应用后尽量使用 CCR 里的“打开 Agent”启动 Agent。

### Claude Code

在 **Agent 配置** 中选择 Claude Code，设置模型、小型快速模型和设置文件，然后点击应用。从 CCR 打开 Claude Code 后，发一次请求到请求日志里验证。

### Codex

在 **Agent 配置** 中选择 Codex，确认供应商 ID、供应商名称、模型和配置文件。需要特定 CLI 时再填写 Codex CLI path 和 Codex home。

### Grok CLI

选择 Grok CLI 并设置默认模型，然后运行复制出的 `ccr-app <配置名称>` 命令。即使 CCR Desktop 网关尚未运行，该命令也会启动一个可共享的临时网关服务；并发 Grok 会话会共同保持服务运行，直到最后一个会话退出。CCR 会把 Grok 的模型发现和推理请求指向本地网关；进入 Grok 后可以用 `/model` 切换 CCR 模型。

### ZCode

选择 ZCode 并设置 **ZCode 模型**、**供应商 ID** 和 **供应商名称**。ZCode 是以桌面应用形态运行的 Agent，入口固定为 **仅 App**，从配置卡片上的播放按钮打开。

## 日志与观测

到 **设置 → 日志与观测** 打开 **请求日志** 和 **Agent 观测**，然后发一条请求验证：请求日志记录单条模型请求的请求体、响应体、命中模型和错误信息，观测面板展示 Agent 的执行链路、工具调用和耗时。

首次验证的完整步骤见 [开启日志与观测](observability/)；各开关和面板能力的配置参考见 [日志与可观测性](../configuration/observability/)。
