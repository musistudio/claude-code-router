---
title: Claude Code Router 详细配置
pageTitle: 详细配置
eyebrow: 详细配置
lead: 深入配置供应商、路由、Agent配置、Fusion、Bot 和配置数据库位置。这里是按功能查字段和扩展能力的地方。
---

## 页面结构

详细配置文档已经拆成独立页面。左侧目录中的每一项都会进入一个页面；当前页面内的标题由右侧大纲负责。

| 页面 | 内容 |
| --- | --- |
| 供应商配置 | 上游服务、协议、基础 URL、模型列表和凭据 |
| 一键导入供应商 | Provider deeplink 协议、Manifest 导入、一键导入按钮和安全边界 |
| 路由配置 | 默认路由、条件规则、fallback 和请求改写 |
| 日志&观测 | 请求日志、Agent 执行追踪、工具调用和工具结果 |
| Fusion 组合模型 | 把基础模型与视觉、搜索、MCP 工具组合成新的可选模型 |
| Agent配置 | Agent 启动方式、模型、作用范围、多开和 Bot 绑定 |
| 扩展机制 | Wrapper plugin、Core gateway plugin、自定义扩展创建和调试 |
| Bot 与 IM 接力 Agent | Bot 转发、接力模式和平台页面 |
| 配置数据库位置 | 桌面 App 维护的 SQLite 配置数据库位置 |

## 内容关系

供应商配置和一键导入供应商页面覆盖上游模型服务如何进入 CCR；路由决定模型请求的上游去向；Agent配置页面覆盖 Claude Code、Codex 和 ZCode 的启动、多开与模型选择；Fusion 页面覆盖图像、搜索和 MCP 工具；扩展机制页面覆盖本地插件的创建、安装和调试；Bot 页面覆盖 IM 平台接力。
