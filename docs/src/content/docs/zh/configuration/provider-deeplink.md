---
title: 一键导入供应商
pageTitle: 一键导入供应商
eyebrow: 一键导入
lead: 通过预设按钮或 ccr://provider 深度链接（deeplink）一键导入模型供应商：CCR 先展示将写入的配置，确认后再保存。供应商也可以嵌入按钮或发布 manifest，让用户从网页完成导入。
---

## 一键导入

选择下面的供应商即可开始添加。CCR 会先显示即将添加的内容，确认无误后再保存；使用自定义入口时，请确保来源可信。

<div class="provider-import-grid" aria-label="Preset provider import buttons">
  <a class="provider-import-button provider-openai" href="ccr://provider?name=OpenAI&amp;base_url=https%3A%2F%2Fapi.openai.com%2Fv1&amp;protocol=openai_responses&amp;models=gpt-5.5%2Cgpt-5.5-pro%2Cgpt-5.5-instant%2Cgpt-5.4-mini" aria-label="导入 OpenAI 官方供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/openai.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">OpenAI 官方</span><span class="provider-import-meta">Responses / Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-anthropic" href="ccr://provider?name=Anthropic&amp;base_url=https%3A%2F%2Fapi.anthropic.com&amp;protocol=anthropic_messages&amp;models=claude-fable-5%2Cclaude-opus-4-8%2Cclaude-sonnet-4-6%2Cclaude-haiku-4-5" aria-label="导入 Anthropic 官方供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/anthropic.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Anthropic 官方</span><span class="provider-import-meta">Anthropic Messages</span></span>
  </a>
  <a class="provider-import-button provider-gemini" href="ccr://provider?name=Google+Gemini&amp;base_url=https%3A%2F%2Fgenerativelanguage.googleapis.com&amp;protocol=gemini_generate_content&amp;models=gemini-3.5-flash%2Cgemini-3.1-pro-preview%2Cgemini-3-flash-preview" aria-label="导入谷歌 Gemini 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/gemini.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">谷歌 Gemini</span><span class="provider-import-meta">Gemini Generate Content</span></span>
  </a>
  <a class="provider-import-button provider-openrouter" href="ccr://provider?name=OpenRouter&amp;base_url=https%3A%2F%2Fopenrouter.ai%2Fapi%2Fv1&amp;protocol=openai_chat_completions&amp;models=%7Eopenai%2Fgpt-latest%2C%7Eanthropic%2Fclaude-opus-latest%2C%7Eanthropic%2Fclaude-sonnet-latest%2Cgoogle%2Fgemini-3.5-flash%2Cz-ai%2Fglm-5.2" aria-label="导入 OpenRouter 路由供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/openrouter.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">OpenRouter 路由</span><span class="provider-import-meta">OpenAI compatible gateway</span></span>
  </a>
  <a class="provider-import-button provider-nvidia" href="ccr://provider?name=NVIDIA&amp;base_url=https%3A%2F%2Fintegrate.api.nvidia.com%2Fv1&amp;protocol=openai_chat_completions&amp;models=nvidia%2Fnemotron-3-super-120b-a12b%2Cnvidia%2Fnemotron-3-ultra-550b-a55b&amp;source=https%3A%2F%2Fbuild.nvidia.com%2Fmodels" aria-label="导入 NVIDIA NIM 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/nvidia.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">NVIDIA</span><span class="provider-import-meta">NIM Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-deepseek" href="ccr://provider?name=DeepSeek&amp;base_url=https%3A%2F%2Fapi.deepseek.com&amp;protocol=openai_chat_completions&amp;models=deepseek-v4-pro%2Cdeepseek-v4-flash%2Cdeepseek-v3.2%2Cdeepseek-reasoner%2Cdeepseek-chat" aria-label="导入 DeepSeek 深度求索供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/deepseek.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">DeepSeek 深度求索</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-zhipu-coding" href="ccr://provider?name=Zhipu+AI+%28China%29+-+Coding+Plan&amp;base_url=https%3A%2F%2Fopen.bigmodel.cn%2Fapi%2Fcoding%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5-turbo%2Cglm-5v-turbo%2Cglm-4.7" aria-label="导入智谱 Coding 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/zhipu-cn-coding.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">智谱 Coding</span><span class="provider-import-meta">中国 Coding 计划</span></span>
  </a>
  <a class="provider-import-button provider-zhipu-general" href="ccr://provider?name=Zhipu+AI+%28China%29+-+General+Endpoint&amp;base_url=https%3A%2F%2Fopen.bigmodel.cn%2Fapi%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5%2Cglm-5v-turbo%2Cglm-4.7" aria-label="导入智谱通用供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/zhipu-cn-general.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">智谱通用</span><span class="provider-import-meta">中国通用端点</span></span>
  </a>
  <a class="provider-import-button provider-zai-coding" href="ccr://provider?name=Z.ai+%28Global%29+-+Coding+Plan&amp;base_url=https%3A%2F%2Fapi.z.ai%2Fapi%2Fcoding%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5-turbo%2Cglm-5v-turbo%2Cglm-4.7" aria-label="导入智谱国际 Coding 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/zai-global-coding.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">智谱国际 Coding</span><span class="provider-import-meta">全球 Coding 计划</span></span>
  </a>
  <a class="provider-import-button provider-zai-general" href="ccr://provider?name=Z.ai+%28Global%29+-+General+Endpoint&amp;base_url=https%3A%2F%2Fapi.z.ai%2Fapi%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5%2Cglm-5v-turbo%2Cglm-4.7" aria-label="导入智谱国际通用供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/zai-global-general.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">智谱国际通用</span><span class="provider-import-meta">全球通用端点</span></span>
  </a>
  <a class="provider-import-button provider-mistral" href="ccr://provider?name=Mistral&amp;base_url=https%3A%2F%2Fapi.mistral.ai%2Fv1&amp;protocol=openai_chat_completions&amp;models=mistral-medium-3-5%2Cmistral-large-3%2Cministral-3-14b-instruct-2512%2Cdevstral-2512" aria-label="导入 Mistral 官方供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/mistral.webp" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Mistral 官方</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-moonshot" href="ccr://provider?name=Kimi+API+%28China%29&amp;base_url=https%3A%2F%2Fapi.moonshot.cn%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-k2.7-code%2Ckimi-k2.6%2Ckimi-latest%2Ckimi-thinking-preview" aria-label="导入 Kimi API 国内供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi API（国内）</span><span class="provider-import-meta">国内平台</span></span>
  </a>
  <a class="provider-import-button provider-moonshot-global" href="ccr://provider?name=Kimi+API+%28Global%29&amp;base_url=https%3A%2F%2Fapi.moonshot.ai%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-k2.7-code%2Ckimi-k2.6%2Ckimi-latest%2Ckimi-thinking-preview" aria-label="导入 Kimi API 海外供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi API（海外）</span><span class="provider-import-meta">海外平台</span></span>
  </a>
  <a class="provider-import-button provider-kimi-coding" href="ccr://provider?name=Kimi+Code+-+Coding+Plan&amp;base_url=https%3A%2F%2Fapi.kimi.com%2Fcoding%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-for-coding" aria-label="导入 Kimi Code Coding Plan 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi Code</span><span class="provider-import-meta">Coding Plan</span></span>
  </a>
  <a class="provider-import-button provider-bailian" href="ccr://provider?name=Alibaba+Bailian&amp;base_url=https%3A%2F%2Fdashscope.aliyuncs.com%2Fcompatible-mode%2Fv1&amp;protocol=openai_chat_completions&amp;models=qwen3.7-max%2Cqwen3.7-plus%2Cqwen3.6-max-preview%2Cqwen3-coder-plus%2Cqwen3-max" aria-label="导入阿里百炼供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/bailian.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">阿里百炼</span><span class="provider-import-meta">DashScope 兼容</span></span>
  </a>
  <a class="provider-import-button provider-siliconflow" href="ccr://provider?name=SiliconFlow&amp;base_url=https%3A%2F%2Fapi.siliconflow.cn%2Fv1&amp;protocol=openai_chat_completions&amp;models=zai-org%2FGLM-5.2%2Cdeepseek-ai%2Fdeepseek-v4-pro%2Cdeepseek-ai%2Fdeepseek-v4-flash%2Czai-org%2FGLM-5.1%2Cdeepseek-ai%2FDeepSeek-V3.2" aria-label="导入硅基流动供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/siliconflow.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">硅基流动</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-runapi" href="ccr://provider?name=RunAPI&amp;base_url=https%3A%2F%2Frunapi.co%2Fv1&amp;protocol=openai_responses" aria-label="导入 RunAPI 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/runapi.jpg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">RunAPI</span><span class="provider-import-meta">Responses / Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-teamorouter" href="ccr://provider?name=TeamoRouter&amp;base_url=https%3A%2F%2Fapi.teamorouter.com&amp;protocol=anthropic_messages&amp;source=https%3A%2F%2Fteamorouter.com%2F" aria-label="导入 TeamoRouter 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/teamorouter.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">TeamoRouter</span><span class="provider-import-meta">Anthropic / Chat / Responses</span></span>
  </a>
  <a class="provider-import-button provider-unity2" href="ccr://provider?name=Unity2.Ai&amp;base_url=https%3A%2F%2Funity2.ai%2Fv1&amp;protocol=openai_chat_completions&amp;source=https%3A%2F%2Funity2.ai%2Fregister%3Fsource%3Dclaudecoderouter" aria-label="导入 Unity2.Ai 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/unity2.jpg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Unity2.Ai</span><span class="provider-import-meta">OpenAI 兼容网关</span></span>
  </a>
  <a class="provider-import-button provider-code0" href="ccr://provider?name=code0.ai&amp;base_url=https%3A%2F%2Fconsole.code0.ai&amp;protocol=anthropic_messages&amp;source=https%3A%2F%2Fcode0.ai%2Fagent%2Fregister%2F9n9jOsSnYQoemIVL%3Futm_source%3Dclaudecoderouter%26utm_medium%3Dpartner%26utm_campaign%3Dclaudecoderouter_2026%26utm_content%3Ddefault" aria-label="导入 code0.ai 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/code0.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">code0.ai</span><span class="provider-import-meta">Anthropic / Chat / Responses</span></span>
  </a>
  <a class="provider-import-button provider-claudeapi" href="ccr://provider?name=claudeapi&amp;base_url=https%3A%2F%2Fgw.claudeapi.com&amp;protocol=anthropic_messages&amp;source=https%3A%2F%2Fconsole.claudeapi.com%2Fagent%2Fregister%2FLbmB7Y9kPloyzhwF%3Futm_source%3Dclaudecoderouter%26utm_medium%3Dpartner%26utm_campaign%3Dclaudecoderouter_2026%26utm_content%3Ddefault" aria-label="导入 claudeapi 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/claudeapi.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">claudeapi</span><span class="provider-import-meta">Anthropic Messages</span></span>
  </a>
  <a class="provider-import-button provider-qiniu-ai" href="ccr://provider?name=%E4%B8%83%E7%89%9B%E4%BA%91+AI&amp;base_url=https%3A%2F%2Fapi.qnaigc.com&amp;protocol=openai_chat_completions&amp;source=https%3A%2F%2Fs.qiniu.com%2FAVjMVf" aria-label="导入七牛云 AI 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/qiniu-ai.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">七牛云 AI</span><span class="provider-import-meta">Chat / Responses / Anthropic / Gemini Generate</span></span>
  </a>
  <a class="provider-import-button provider-fenno" href="ccr://provider?name=Fenno.ai&amp;base_url=https%3A%2F%2Fapi.fenno.ai&amp;protocol=openai_chat_completions&amp;source=https%3A%2F%2Fapi.fenno.ai%2Fregister%3Fredirect%3D%2Fpurchase%3Ftab%3Dsubscription%2526group%3D16%26aff%3D9HHHAB5QLAES" aria-label="导入 Fenno.ai 供应商">
    <span class="provider-import-icon-shell"><img src="../../provider-icons/fenno.jpg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Fenno.ai</span><span class="provider-import-meta">Chat / Responses / Anthropic</span></span>
  </a>
</div>

## 嵌入式按钮组件

CCR 也提供了一个无框架的按钮脚本，供应商可以嵌入到自己的网页，让用户一键把该供应商导入 CCR。脚本会自动注册 Web Components。

### HTML 写法

```html
<script src="https://cdn.ccrdesk.top/ccr-provider-buttons.js" defer></script>

<ccr-provider-button
  name="Example AI"
  base_url="https://api.example.com/v1"
  protocol="openai_chat_completions"
  models="example-chat,example-coder"
  icon="https://example.com/icon.png"
  source="https://example.com"
></ccr-provider-button>
```

如果配置较大，可以只传 manifest：

```html
<script src="https://cdn.ccrdesk.top/ccr-provider-buttons.js" defer></script>

<ccr-provider-button
  name="Example AI"
  manifest="https://example.com/.well-known/ccr-provider.json"
></ccr-provider-button>
```

### JS 写法

```html
<div id="ccr-buttons"></div>
<script src="https://cdn.ccrdesk.top/ccr-provider-buttons.js"></script>
<script>
  CCRProviderButtons.render("#ccr-buttons", {
    name: "Example AI",
    base_url: "https://api.example.com/v1",
    api_key: "sk-user-key",
    protocol: "openai_chat_completions",
    models: ["example-chat", "example-coder"],
    icon: "https://example.com/icon.png",
    source: "https://example.com"
  });
</script>
```

### render 参数

`CCRProviderButtons.render(target, options)` 和 `<ccr-provider-button>` 支持同一组参数，参数名与 `ccr://provider` 协议保持一致：

| 参数 | 说明 |
| --- | --- |
| `name` | 供应商展示名称 |
| `base_url` | 供应商 API Base URL，直链导入时必填 |
| `api_key` | 可选供应商 API Key |
| `protocol` | 协议类型，支持 `openai_chat_completions`、`openai_responses`、`anthropic_messages`、`gemini_generate_content`、`gemini_interactions` |
| `models` | 模型列表。HTML 中用逗号或换行分隔，JS 中可传字符串或数组 |
| `icon` | 供应商图标 URL |
| `source` | 供应商官网或配置来源 |
| `manifest` | 远程 manifest URL。传入后按钮会生成 manifest 导入链接 |
| `payload` | JSON 或 base64url JSON 配置。JS 中也可以传对象 |
| `usage_url` | 可选账号用量接口 |
| `fetch_usage` | 是否启用账号用量读取 |
| `usage_method` | 用量接口请求方法，`GET` 或 `POST` |
| `usage_headers` | 用量接口请求头。JS 中可传对象，HTML 中传 JSON 字符串 |
| `usage_body` | 用量接口请求体。JS 中可传对象，HTML 中传 JSON 字符串 |
| `balance` | 余额字段路径 |
| `balance_unit` | 余额单位 |
| `subscription` | 订阅剩余额度字段路径 |
| `subscription_limit` | 订阅总额度字段路径 |
| `subscription_reset` | 订阅重置时间字段路径 |
| `subscription_unit` | 订阅额度单位 |
| `subscription_window` | 订阅窗口，例如 `monthly` |

## 协议格式

CCR 支持两种写法，推荐使用 host 写法：

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&protocol=openai_chat_completions&models=example-chat%2Cexample-coder
```

路径写法也可以被识别：

```text
ccr:///provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1
```

如果配置较大，可以把 JSON 放入 `payload` 参数。值可以是 URL 编码 JSON，也可以是 base64url JSON：

```text
ccr://provider?payload=%7B%22name%22%3A%22Example%20AI%22%2C%22base_url%22%3A%22https%3A%2F%2Fapi.example.com%2Fv1%22%2C%22models%22%3A%5B%22example-chat%22%5D%7D
```

## Manifest 导入

供应商也可以只传一个 manifest URL：

```text
ccr://provider?manifest=https%3A%2F%2Fexample.com%2Fccr-provider.json
```

Manifest 必须使用 HTTPS，返回 JSON，不能指向本地或内网地址，体积不能超过 128 KB。CCR 会在 App 内拉取 manifest，展示确认页，然后再写入配置。

Manifest 可以把供应商信息放在顶层 `provider` 对象中：

| 字段 | 说明 |
| --- | --- |
| `provider.name` | 供应商展示名称 |
| `provider.base_url` | 供应商 API Base URL，必填 |
| `provider.protocol` | 协议类型 |
| `provider.models` | 模型列表，字符串数组 |
| `provider.icon` | 供应商图标 URL |
| `provider.source` | 供应商官网或配置来源 |
| `provider.account.enabled` | 是否启用账号用量读取 |
| `provider.account.refreshIntervalMs` | 用量刷新间隔，单位毫秒 |
| `provider.account.connectors` | 用量读取 connector 列表 |
| `provider.account.connectors[].type` | Connector 类型，常用 `http-json` |
| `provider.account.connectors[].auth` | 认证方式，常用 `provider-api-key` |
| `provider.account.connectors[].endpoint` | 用量接口 URL |
| `provider.account.connectors[].method` | 请求方法，`GET` 或 `POST` |
| `provider.account.connectors[].headers` | 请求头，不能包含敏感认证头 |
| `provider.account.connectors[].body` | 可选请求体 |
| `provider.account.connectors[].mapping.meters` | 用量指标映射列表 |

完整 manifest 示例：

```json
{
  "provider": {
    "name": "Example AI",
    "base_url": "https://api.example.com/v1",
    "protocol": "openai_chat_completions",
    "models": ["example-chat", "example-coder"],
    "icon": "https://example.com/icon.png",
    "source": "https://example.com",
    "account": {
      "enabled": true,
      "refreshIntervalMs": 300000,
      "connectors": [
        {
          "type": "http-json",
          "auth": "provider-api-key",
          "endpoint": "https://api.example.com/v1/account/usage",
          "method": "GET",
          "headers": {
            "accept": "application/json"
          },
          "mapping": {
            "meters": [
              {
                "id": "balance",
                "kind": "balance",
                "label": "Balance",
                "remaining": "data.balance.remaining",
                "unit": "USD"
              },
              {
                "id": "subscription",
                "kind": "subscription",
                "label": "Monthly quota",
                "remaining": "data.quota.remaining",
                "limit": "data.quota.limit",
                "resetAt": "data.quota.reset_at",
                "unit": "tokens",
                "window": "monthly"
              }
            ]
          }
        }
      ]
    }
  }
}
```

## 支持的参数

| 参数 | 说明 |
| --- | --- |
| `name` | 供应商展示名称 |
| `base_url` | 供应商 API Base URL，必填 |
| `api_key` | 可选供应商 API Key |
| `protocol` | 协议类型，支持 `openai_chat_completions`、`openai_responses`、`anthropic_messages`、`gemini_generate_content`、`gemini_interactions` |
| `models` | 模型列表，支持逗号或换行分隔，也可以重复传入 |
| `icon` | 供应商图标 URL |
| `source` | 供应商官网或配置来源 |
| `manifest` | 远程 manifest URL |
| `payload` | JSON 或 base64url JSON 配置 |
| `usage_url` | 可选账号用量接口 |
| `fetch_usage` | 是否启用账号用量读取 |
| `usage_method` | 用量接口请求方法，`GET` 或 `POST` |
| `usage_headers` | 用量接口请求头，JSON 字符串 |
| `usage_body` | 用量接口请求体，JSON 字符串 |
| `balance` | 余额字段路径 |
| `balance_unit` | 余额单位 |
| `subscription` | 订阅剩余额度字段路径 |
| `subscription_limit` | 订阅总额度字段路径 |
| `subscription_reset` | 订阅重置时间字段路径 |
| `subscription_unit` | 订阅额度单位 |
| `subscription_window` | 订阅窗口，例如 `monthly` |

参数名和协议值必须使用上表中的完整规范名。不再接受 `baseUrl`、`apiKey`、`model`、`type` 或 `openai` 等别名。
