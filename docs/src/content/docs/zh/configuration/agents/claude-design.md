---
title: Claude Design 接入与配置
pageTitle: Claude Design
eyebrow: 详细配置
lead: "把 Claude Design 接入 CCR。Claude Design 仅支持 App。"
---

## 适用场景

Claude Design 是 Anthropic 的设计 Agent，以桌面应用形态运行。在 CCR 中它 **仅支持 App**，且始终从 CCR Desktop 打开。

当你想注册一个 Claude Design 配置，或可选地添加路由规则时，使用本页。

> 第一次使用 CCR？请先接入供应商和模型。参见[接入供应商](/guides/provider/)与 [Agent 配置总览](/configuration/profiles/)。

## 前置条件

1. CCR Desktop 正在运行，且已配置至少一个供应商与模型。
2. Claude Design 可通过 CCR Desktop 使用。
3. 进入 **Agent 配置**，点击 **添加配置**。

## 创建配置

1. 在 **Agent 配置** 点击 **添加配置**，选择 **Claude Design**。
2. 填写 **配置名称**（例如 `Claude Design`）。
3. 可选地添加路由规则（见下文）。
4. **保存**，然后从 CCR Desktop 打开 Claude Design。

## 配置项详解

Claude Design 固定为 **仅 App** 和 **仅从 CCR 打开时生效**。多数 Agent 字段不适用。

| 字段 | 如何配置 | 效果 |
| --- | --- | --- |
| Agent | 选择 **Claude Design** | 在 CCR 中创建 Claude Design App 启动入口。 |
| 配置名称 | 自由文本，例如 `Claude Design` | 在 CCR 中标识该配置。 |
| 启用 | 开关 | 关闭的配置不会被应用，也不会出现在启动入口。 |
| 路由 | 可选的路由规则 | 影响该配置请求路由方式的规则。参见[智能路由](/routing/)。 |

## 路由

你可以为 Claude Design 配置附加路由规则，控制由哪个供应商或模型处理其请求（例如固定到某个供应商或增加故障转移）。增强路由开关对 Claude Design 不适用（始终开启），只有显式规则会生效。规则的工作方式见[智能路由](/routing/)。

## 打开与使用

从 CCR Desktop 打开 Claude Design。它无法用终端配置命令启动。

## 验证

1. 从 CCR Desktop 打开 Claude Design。
2. 发送一次请求，确认能完成。
3. 打开 CCR 的 **请求日志**，确认请求经过了网关。

## 常见问题

- **无法从终端打开**：Claude Design 仅支持 App，需从 CCR Desktop 打开。
- **请求绕过了 CCR**：确认配置已 **启用**，且你是从 CCR Desktop 打开 Claude Design。
- **路由规则无效**：只有显式规则生效；增强路由开关对 Claude Design 始终开启。
