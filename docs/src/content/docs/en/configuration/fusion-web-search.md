---
title: Built-in web search
pageTitle: Built-in web search
eyebrow: Fusion
lead: Add live retrieval to a model with CCR's built-in web_search capability, backed by In-app Browser, a web search service, or Xquik for recent X posts.
---

## Select the capability

Use `ccr-fusion-builtins / web_search`.

## Search Providers

Supported providers include In-app Browser, Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, Exa, and Xquik.

## In-app Browser

`In-app Browser` runs searches through a hidden built-in browser window in CCR Desktop, opens result pages, extracts visible content, and passes that evidence to the Fusion model. It does not require an external search API key, so it is useful when you want desktop-side browser retrieval.

Configuration options include search engine, language, country or region, and safe-search level:

- Search engine: Bing, Google, or DuckDuckGo.
- Language: for example `en` or `zh-CN`.
- Country or region: for example `US` or `CN`.
- Safe search: default, moderate, strict, or off.

> Note: `In-app Browser` depends on CCR Desktop's Electron built-in browser capability and is only available in the desktop app. CLI, server deployments, and pure web environments do not have the built-in browser integration; use Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, Exa, or Xquik instead.

## Xquik

`Xquik (X search)` retrieves recent public X posts and preserves each post's source URL. Choose it when a model needs current X discussions instead of general web pages.

Set `XQUIK_API_KEY` in the provider configuration. You can also set `XQUIK_SEARCH_ENDPOINT` when you use a compatible endpoint. The adapter sends the query, result limit, and optional language. It excludes replies, reposts, and quotes so results focus on primary posts.

## Troubleshooting

When search fails, relevant details include the search provider key and Fusion tool errors in Logs.
