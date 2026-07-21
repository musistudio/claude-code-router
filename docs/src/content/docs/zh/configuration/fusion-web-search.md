---
title: 内置联网搜索
pageTitle: 内置联网搜索
eyebrow: Fusion
lead: 为不支持联网的模型添加实时检索能力：选择 CCR 内置 web_search 能力，并配置 In-app Browser 或 Brave、Bing、Tavily 等搜索服务。
---

## 选择能力

选择 `ccr-fusion-builtins / web_search`。

## 搜索服务

支持 In-app Browser、Brave、Bing、Google CSE、Serper、SerpAPI、Tavily、Exa 等搜索服务。

## In-app Browser

`In-app Browser` 会通过 CCR Desktop 的隐藏内置浏览器窗口执行搜索，打开搜索结果页面并提取可见内容，再把证据提供给 Fusion 模型。它不需要外部搜索 API Key，适合希望用桌面端内置浏览器完成联网检索的场景。

可配置项包括搜索引擎、语言、地区和安全搜索级别：

- 搜索引擎：Bing、Google、DuckDuckGo。
- 语言：例如 `en`、`zh-CN`。
- 地区：例如 `US`、`CN`。
- 安全搜索：默认、中等、严格或关闭。

> 注意：`In-app Browser` 依赖 CCR Desktop 的 Electron 内置浏览器能力，只在桌面端可用。CLI、服务器部署或纯 Web 环境没有内置浏览器集成，请改用 Brave、Bing、Google CSE、Serper、SerpAPI、Tavily 或 Exa 等搜索服务。

## 排查要点

搜索失败时，相关信息包括搜索服务 Key 和请求日志里的 Fusion 工具报错。
