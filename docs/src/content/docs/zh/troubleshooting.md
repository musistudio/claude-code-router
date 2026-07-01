---
title: Claude Code Router Q&A
pageTitle: Q&A
eyebrow: Q&A
lead: 遇到 Agent 没走 CCR、供应商报错、路由不对、Fusion 失败或 Bot 收不到消息时，从这里开始定位。
---

## Q&A

### Q: Agent 没有走 CCR，相关信息在哪里？

A: 服务运行状态、Agent 启动方式、配置应用状态和作用范围会影响 Agent 是否经过 CCR。

### Q: 请求命中了错误模型怎么办？

A: 请求日志会展示 `request model`、`resolved provider` 和 `resolved model`。路由配置页包含默认路由、规则顺序、匹配条件和 fallback。

### Q: 供应商返回 401 或 403 怎么处理？

A: 相关字段包括 API Key、凭据启用状态、基础 URL、协议和额外请求头。供应商页面提供模型连通性检查。

### Q: 出现 `model not found` 怎么排查？

A: 供应商模型列表、路由选择的模型名和配置中的模型名都会影响 `model not found`。

### Q: Fusion 没调用工具怎么办？

A: 相关信息包括 Fusion 工具启用状态、Vision model 或搜索服务 Key、MCP 的 Discover tools 和 timeout 设置。

### Q: 请求超时有哪些相关信息？

A: 请求日志会记录耗时和错误信息；上游服务延迟、Fusion 工具耗时和 timeout 设置也会影响超时表现。

### Q: 成本突然变高怎么定位？

A: 请求日志支持按模型、供应商或凭据筛选，并展示 token 组成、请求体大小和最终命中的模型。

### Q: 某条 Key 一直失败怎么办？

A: 请求日志支持按凭据筛选。凭据的额度、权限和供应商后台状态都会影响单条 Key 的可用性。

### Q: Bot 收不到消息怎么排查？

A: 相关信息包括 Bot 开关、消息转发设置、平台 Token、回调配置，以及 Agent 是否从 CCR 打开。

### Q: 观测面板没有 Agent 执行链路怎么办？

A: 到 **设置 → 日志与观测** 确认 **请求日志** 和 **Agent 观测** 已开启，然后重新发起一次 Agent 任务。观测面板会在新的 Agent 执行过程中记录步骤、工具调用、工具结果和耗时。
