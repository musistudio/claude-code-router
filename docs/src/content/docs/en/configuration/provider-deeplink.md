---
title: One click import
pageTitle: One click import
eyebrow: Detailed Configuration
lead: Quickly add common model providers, review the details, and save them without filling everything in by hand.
---

## One-Click Import

Choose a provider below to get started. CCR shows what will be added before saving it; when using a custom entry point, make sure the source is one you trust.

<div class="provider-import-grid" aria-label="Preset provider import buttons">
  <a class="provider-import-button provider-openai" href="ccr://provider?name=OpenAI&amp;base_url=https%3A%2F%2Fapi.openai.com%2Fv1&amp;protocol=openai_responses&amp;models=gpt-5.5%2Cgpt-5.5-pro%2Cgpt-5.5-instant%2Cgpt-5.4-mini" aria-label="Import OpenAI provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/openai.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">OpenAI</span><span class="provider-import-meta">Responses / Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-anthropic" href="ccr://provider?name=Anthropic&amp;base_url=https%3A%2F%2Fapi.anthropic.com&amp;protocol=anthropic_messages&amp;models=claude-fable-5%2Cclaude-opus-4-8%2Cclaude-sonnet-4-6%2Cclaude-haiku-4-5" aria-label="Import Anthropic provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/anthropic.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Anthropic</span><span class="provider-import-meta">Anthropic Messages</span></span>
  </a>
  <a class="provider-import-button provider-gemini" href="ccr://provider?name=Google+Gemini&amp;base_url=https%3A%2F%2Fgenerativelanguage.googleapis.com&amp;protocol=gemini_generate_content&amp;models=gemini-3.5-flash%2Cgemini-3.1-pro-preview%2Cgemini-3-flash-preview" aria-label="Import Google Gemini provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/gemini.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Google Gemini</span><span class="provider-import-meta">Gemini Generate Content</span></span>
  </a>
  <a class="provider-import-button provider-openrouter" href="ccr://provider?name=OpenRouter&amp;base_url=https%3A%2F%2Fopenrouter.ai%2Fapi%2Fv1&amp;protocol=openai_chat_completions&amp;models=%7Eopenai%2Fgpt-latest%2C%7Eanthropic%2Fclaude-opus-latest%2C%7Eanthropic%2Fclaude-sonnet-latest%2Cgoogle%2Fgemini-3.5-flash%2Cz-ai%2Fglm-5.2" aria-label="Import OpenRouter provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/openrouter.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">OpenRouter</span><span class="provider-import-meta">OpenAI compatible gateway</span></span>
  </a>
  <a class="provider-import-button provider-deepseek" href="ccr://provider?name=DeepSeek&amp;base_url=https%3A%2F%2Fapi.deepseek.com&amp;protocol=openai_chat_completions&amp;models=deepseek-v4-pro%2Cdeepseek-v4-flash%2Cdeepseek-v3.2%2Cdeepseek-reasoner%2Cdeepseek-chat" aria-label="Import DeepSeek provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/deepseek.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">DeepSeek</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-zhipu-coding" href="ccr://provider?name=Zhipu+AI+%28China%29+-+Coding+Plan&amp;base_url=https%3A%2F%2Fopen.bigmodel.cn%2Fapi%2Fcoding%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5-turbo%2Cglm-5v-turbo%2Cglm-4.7" aria-label="Import Zhipu AI China Coding Plan provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/zhipu-cn-coding.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Zhipu Coding</span><span class="provider-import-meta">China Coding Plan</span></span>
  </a>
  <a class="provider-import-button provider-zhipu-general" href="ccr://provider?name=Zhipu+AI+%28China%29+-+General+Endpoint&amp;base_url=https%3A%2F%2Fopen.bigmodel.cn%2Fapi%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5%2Cglm-5v-turbo%2Cglm-4.7" aria-label="Import Zhipu AI China General Endpoint provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/zhipu-cn-general.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Zhipu General</span><span class="provider-import-meta">China General Endpoint</span></span>
  </a>
  <a class="provider-import-button provider-zai-coding" href="ccr://provider?name=Z.ai+%28Global%29+-+Coding+Plan&amp;base_url=https%3A%2F%2Fapi.z.ai%2Fapi%2Fcoding%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5-turbo%2Cglm-5v-turbo%2Cglm-4.7" aria-label="Import Z.ai Global Coding Plan provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/zai-global-coding.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Z.ai Coding</span><span class="provider-import-meta">Global Coding Plan</span></span>
  </a>
  <a class="provider-import-button provider-zai-general" href="ccr://provider?name=Z.ai+%28Global%29+-+General+Endpoint&amp;base_url=https%3A%2F%2Fapi.z.ai%2Fapi%2Fpaas%2Fv4&amp;protocol=openai_chat_completions&amp;models=glm-5.2%2Cglm-5.1%2Cglm-5%2Cglm-5v-turbo%2Cglm-4.7" aria-label="Import Z.ai Global General Endpoint provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/zai-global-general.svg" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Z.ai General</span><span class="provider-import-meta">Global General Endpoint</span></span>
  </a>
  <a class="provider-import-button provider-mistral" href="ccr://provider?name=Mistral&amp;base_url=https%3A%2F%2Fapi.mistral.ai%2Fv1&amp;protocol=openai_chat_completions&amp;models=mistral-medium-3-5%2Cmistral-large-3%2Cministral-3-14b-instruct-2512%2Cdevstral-2512" aria-label="Import Mistral provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/mistral.webp" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Mistral</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
  <a class="provider-import-button provider-moonshot" href="ccr://provider?name=Kimi+API+%28China%29&amp;base_url=https%3A%2F%2Fapi.moonshot.cn%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-k2.7-code%2Ckimi-k2.6%2Ckimi-latest%2Ckimi-thinking-preview" aria-label="Import Kimi API China provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi API (China)</span><span class="provider-import-meta">China platform</span></span>
  </a>
  <a class="provider-import-button provider-moonshot-global" href="ccr://provider?name=Kimi+API+%28Global%29&amp;base_url=https%3A%2F%2Fapi.moonshot.ai%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-k2.7-code%2Ckimi-k2.6%2Ckimi-latest%2Ckimi-thinking-preview" aria-label="Import Kimi API Global provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi API (Global)</span><span class="provider-import-meta">Global platform</span></span>
  </a>
  <a class="provider-import-button provider-kimi-coding" href="ccr://provider?name=Kimi+Code+-+Coding+Plan&amp;base_url=https%3A%2F%2Fapi.kimi.com%2Fcoding%2Fv1&amp;protocol=openai_chat_completions&amp;models=kimi-for-coding" aria-label="Import Kimi Code Coding Plan provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/moonshot.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Kimi Code</span><span class="provider-import-meta">Coding Plan</span></span>
  </a>
  <a class="provider-import-button provider-bailian" href="ccr://provider?name=Alibaba+Bailian&amp;base_url=https%3A%2F%2Fdashscope.aliyuncs.com%2Fcompatible-mode%2Fv1&amp;protocol=openai_chat_completions&amp;models=qwen3.7-max%2Cqwen3.7-plus%2Cqwen3.6-max-preview%2Cqwen3-coder-plus%2Cqwen3-max" aria-label="Import Alibaba Bailian provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/bailian.ico" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">Alibaba Bailian</span><span class="provider-import-meta">DashScope compatible</span></span>
  </a>
  <a class="provider-import-button provider-siliconflow" href="ccr://provider?name=SiliconFlow&amp;base_url=https%3A%2F%2Fapi.siliconflow.cn%2Fv1&amp;protocol=openai_chat_completions&amp;models=zai-org%2FGLM-5.2%2Cdeepseek-ai%2Fdeepseek-v4-pro%2Cdeepseek-ai%2Fdeepseek-v4-flash%2Czai-org%2FGLM-5.1%2Cdeepseek-ai%2FDeepSeek-V3.2" aria-label="Import SiliconFlow provider">
    <span class="provider-import-icon-shell"><img src="../../../provider-icons/siliconflow.png" alt="" loading="lazy" /></span>
    <span class="provider-import-copy"><span class="provider-import-name">SiliconFlow</span><span class="provider-import-meta">Chat Completions</span></span>
  </a>
</div>

## Embeddable Button Component

CCR also ships a framework-free button script that providers can embed on their own webpages so users can import that provider into CCR with one click. The script registers Web Components automatically.

### HTML

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

For larger configs, pass a manifest:

```html
<script src="https://cdn.ccrdesk.top/ccr-provider-buttons.js" defer></script>

<ccr-provider-button
  name="Example AI"
  manifest="https://example.com/.well-known/ccr-provider.json"
></ccr-provider-button>
```

### JavaScript

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

### Render Parameters

`CCRProviderButtons.render(target, options)` and `<ccr-provider-button>` support the same parameter set. Parameter names match the `ccr://provider` protocol:

| Parameter | Description |
| --- | --- |
| `name` | Provider display name |
| `base_url` | Provider API Base URL, required for direct imports |
| `api_key` | Optional provider API key |
| `protocol` | Protocol, one of `openai_chat_completions`, `openai_responses`, `anthropic_messages`, `gemini_generate_content` |
| `models` | Model list. Use comma/newline-separated text in HTML, or a string/array in JavaScript |
| `icon` | Provider icon URL |
| `source` | Provider website or config source |
| `manifest` | Remote manifest URL. When present, the button creates a manifest import link |
| `payload` | JSON or base64url JSON config. JavaScript may pass an object |
| `usage_url` | Optional account usage endpoint |
| `fetch_usage` | Whether account usage fetching is enabled |
| `usage_method` | Usage request method, `GET` or `POST` |
| `usage_headers` | Usage request headers. JavaScript may pass an object; HTML must pass a JSON string |
| `usage_body` | Usage request body. JavaScript may pass an object; HTML must pass a JSON string |
| `balance` | Balance field path |
| `balance_unit` | Balance unit |
| `subscription` | Subscription remaining field path |
| `subscription_limit` | Subscription limit field path |
| `subscription_reset` | Subscription reset time field path |
| `subscription_unit` | Subscription unit |
| `subscription_window` | Subscription window, such as `monthly` |

## URL Format

CCR supports two URL shapes. The host form is recommended:

```text
ccr://provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1&protocol=openai_chat_completions&models=example-chat%2Cexample-coder
```

The path form is also recognized:

```text
ccr:///provider?name=Example%20AI&base_url=https%3A%2F%2Fapi.example.com%2Fv1
```

For larger configs, put JSON in `payload`. The value can be URL-encoded JSON or base64url JSON:

```text
ccr://provider?payload=%7B%22name%22%3A%22Example%20AI%22%2C%22base_url%22%3A%22https%3A%2F%2Fapi.example.com%2Fv1%22%2C%22models%22%3A%5B%22example-chat%22%5D%7D
```

## Manifest Import

Providers can also pass a manifest URL:

```text
ccr://provider?manifest=https%3A%2F%2Fexample.com%2Fccr-provider.json
```

The manifest must use HTTPS, return JSON, avoid local or private network hosts, and stay under 128 KB. CCR fetches the manifest inside the app, shows a confirmation dialog, and writes config only after user approval.

The manifest can put provider information in a top-level `provider` object:

| Field | Description |
| --- | --- |
| `provider.name` | Provider display name |
| `provider.base_url` | Provider API Base URL, required |
| `provider.protocol` | Protocol type |
| `provider.models` | Model list as a string array |
| `provider.icon` | Provider icon URL |
| `provider.source` | Provider website or config source |
| `provider.account.enabled` | Whether account usage fetching is enabled |
| `provider.account.refreshIntervalMs` | Usage refresh interval in milliseconds |
| `provider.account.connectors` | Usage connector list |
| `provider.account.connectors[].type` | Connector type, commonly `http-json` |
| `provider.account.connectors[].auth` | Auth mode, commonly `provider-api-key` |
| `provider.account.connectors[].endpoint` | Usage endpoint URL |
| `provider.account.connectors[].method` | Request method, `GET` or `POST` |
| `provider.account.connectors[].headers` | Request headers, without sensitive auth headers |
| `provider.account.connectors[].body` | Optional request body |
| `provider.account.connectors[].mapping.meters` | Usage meter mappings |

Complete manifest example:

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

## Supported Parameters

| Parameter | Description |
| --- | --- |
| `name` | Provider display name |
| `base_url` | Provider API Base URL, required |
| `api_key` | Optional provider API key |
| `protocol` | Protocol, one of `openai_chat_completions`, `openai_responses`, `anthropic_messages`, `gemini_generate_content` |
| `models` | Model list, comma-separated, newline-separated, or repeated |
| `icon` | Provider icon URL |
| `source` | Provider website or config source |
| `manifest` | Remote manifest URL |
| `payload` | JSON or base64url JSON config |
| `usage_url` | Optional account usage endpoint |
| `fetch_usage` | Whether account usage fetching is enabled |
| `usage_method` | Usage request method, `GET` or `POST` |
| `usage_headers` | Usage request headers as a JSON string |
| `usage_body` | Usage request body as a JSON string |
| `balance` | Balance field path |
| `balance_unit` | Balance unit |
| `subscription` | Subscription remaining field path |
| `subscription_limit` | Subscription limit field path |
| `subscription_reset` | Subscription reset time field path |
| `subscription_unit` | Subscription unit |
| `subscription_window` | Subscription window, such as `monthly` |

Parameter names and protocol values must use the exact names above. Aliases such as `baseUrl`, `apiKey`, `model`, `type`, or `openai` are not accepted.
