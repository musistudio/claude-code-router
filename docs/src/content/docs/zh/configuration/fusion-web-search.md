---
title: 内置联网搜索
pageTitle: 内置联网搜索
eyebrow: Fusion
lead: 为模型添加实时检索能力：选择 CCR 内置 web_search，并配置 In-app Browser、网络搜索服务，或使用 Xquik 搜索 X 上的近期帖子。
---

## 选择能力

选择 `ccr-fusion-builtins / web_search`。

## 搜索服务

支持 In-app Browser、Brave、Bing、Google CSE、Serper、SerpAPI、Tavily、Exa 和 Xquik。

## In-app Browser

`In-app Browser` 会通过 CCR Desktop 的隐藏内置浏览器窗口执行搜索，打开搜索结果页面并提取可见内容，再把证据提供给 Fusion 模型。它不需要外部搜索 API Key，适合希望用桌面端内置浏览器完成联网检索的场景。

可配置项包括搜索引擎、语言、地区和安全搜索级别：

- 搜索引擎：Bing、Google、DuckDuckGo。
- 语言：例如 `en`、`zh-CN`。
- 地区：例如 `US`、`CN`。
- 安全搜索：默认、中等、严格或关闭。

> 注意：`In-app Browser` 依赖 CCR Desktop 的 Electron 内置浏览器能力，只在桌面端可用。CLI、服务器部署或纯 Web 环境没有内置浏览器集成，请改用 Brave、Bing、Google CSE、Serper、SerpAPI、Tavily、Exa 或 Xquik。

## Xquik

`Xquik (X search)` 检索 X 上的近期公开帖子，并保留每条帖子的来源链接。当模型需要了解 X 上的最新讨论，而不是搜索普通网页时，请选择它。

在服务配置中设置 `XQUIK_API_KEY`。使用兼容端点时，也可以设置 `XQUIK_SEARCH_ENDPOINT`。适配器会发送查询词、结果数量和可选语言。它会排除回复、转帖和引用帖，让结果集中在原始帖子上。

## 排查要点

搜索失败时，相关信息包括搜索服务 Key 和请求日志里的 Fusion 工具报错。
