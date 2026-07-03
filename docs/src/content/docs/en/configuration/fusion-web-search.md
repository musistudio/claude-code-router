---
title: Built-In Web Search
pageTitle: Built-In Web Search
eyebrow: Fusion
lead: Use CCR's built-in Web Search tool to give models live search context.
---

## Select The Capability

Use `ccr-fusion-builtins / web_search`.

## Search Providers

Supported providers include In-app Browser, Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.

## In-app Browser

`In-app Browser` runs searches through a hidden built-in browser window in CCR Desktop, opens result pages, extracts visible content, and passes that evidence to the Fusion model. It does not require an external search API key, so it is useful when you want desktop-side browser retrieval.

Configuration options include search engine, language, country or region, and safe-search level:

- Search engine: Bing, Google, or DuckDuckGo.
- Language: for example `en` or `zh-CN`.
- Country or region: for example `US` or `CN`.
- Safe search: default, moderate, strict, or off.

> Note: `In-app Browser` depends on CCR Desktop's Electron built-in browser capability and is only available in the desktop app. CLI, server deployments, and pure web environments do not have the built-in browser integration; use Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, or Exa instead.

## Troubleshooting

When search fails, relevant details include the search provider key and Fusion tool errors in Logs.
