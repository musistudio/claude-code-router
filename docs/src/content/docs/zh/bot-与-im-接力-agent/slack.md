---
title: Slack Bot 配置
pageTitle: Slack Bot
eyebrow: Bot 与 IM 接力 Agent
lead: 把 Agent 的消息接入 Slack 的频道或私聊，并在电脑锁屏后把新消息接力到 Slack。这一页从创建 Slack 应用开始，一直带你走到在 CCR 里跑通。
---

## 这个方式适合谁

Slack 适合团队把 Agent 消息接入已有的频道、私聊或工作区应用。你需要准备一个 Bot Token 和一个 App Token。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解 Bot 的整体流程、转发 Agent 消息和接力的区别，再回来配单个平台。

## 你会用到哪些字段

| Slack 后台里的名字 | CCR 字段 | 长什么样 | 什么时候需要 |
| --- | --- | --- | --- |
| Bot User OAuth Token | Bot Token | `xoxb-...` | 必填，让 Bot 收发消息 |
| App-Level Token | App Token | `xapp-...` | 让 Socket Mode 建立连接 |

## 第一步：创建 Slack 应用

1. 打开 [Slack API Apps](https://api.slack.com/apps)。
2. 点 `Create New App`。
3. 选 `From scratch`。
4. 填应用名，比如 `CCR`。
5. 选要接入的 Slack workspace。
6. 点 `Create App`。

## 第二步：打开 Socket Mode

1. 在应用左侧打开 `Socket Mode`。
2. 打开 `Enable Socket Mode`。
3. 页面提示需要 App-Level Token 时，点创建 token。
4. Token 名字随便填，比如 `ccr-socket`。
5. Scope 选 `connections:write`。
6. 创建后复制 `xapp-...` 开头的 App-Level Token，待会儿填到 CCR 的 App Token。

## 第三步：添加 Bot 权限并安装

1. 左侧打开 `OAuth & Permissions`。
2. 找到 `Scopes` 里的 `Bot Token Scopes`。
3. 至少加这几个 scope：`app_mentions:read`、`channels:history`、`channels:read`、`chat:write`、`im:history`、`im:read`、`im:write`。
4. 要收发文件再加 `files:read`、`files:write`。
5. 要在私有频道用再加 `groups:history`、`groups:read`。
6. 回到页面顶部点 `Install to Workspace`，授权。
7. 安装后复制 `Bot User OAuth Token`（`xoxb-` 开头），待会儿填到 CCR 的 Bot Token。

## 第四步：把 Bot 拉进目标频道

只在私聊用的话可以跳过。

1. 打开 Slack 目标频道。
2. 在消息框输入 `/invite @你的Bot名字`。
3. 发送后确认成员列表里能看到这个 Bot。

> 没把 Bot 邀请进频道，它通常只能收到私聊，看不到频道消息。

## 在 CCR 中接入

1. 打开 CCR 的 **Bot 管理** 页面，点 **添加 Bot**。
2. 平台选 **Slack**。
3. 认证方式默认是 **Bot Token**，保持即可（除非你明确要走 OAuth 流程）。
4. 把 `xoxb-...` 填进 **Bot Token**。
5. 把 `xapp-...` 填进 **App Token**。
6. 保存这个 Bot。
7. 打开 **Agent 配置档案**，编辑你要接 Bot 的那个 Agent 配置档案。
8. 打开 **Bot** 开关，选刚保存的 Bot。
9. 按需打开 **转发 Agent 消息** 或 **接力**（见下一节）。
10. 从 CCR 重新打开 Agent。

## 消息接力：转发还是接力

- **转发 Agent 消息**：不管电脑锁没锁屏，都把 Agent 的新消息转发到 Slack。适合要完整记录或调试时。
- **接力**：只在电脑锁屏后才转发。配合 **空闲秒数**（锁屏后空闲多久才接力）和 Wi-Fi / 蓝牙目标设备一起用。

> 只想锁屏后收到提醒？打开 **接力** 就行，别开 **转发 Agent 消息**，否则消息会很密。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到 Slack 里确认 Bot 能收到并回复。
3. 用频道的话，先确认 Bot 已经在频道里。

> **怎么算成功：** Slack 里能看到 Agent 的消息，你回复后 Agent 也能接着处理。

## 常见问题

- **消息没进 Slack**：先确认 Bot Token 还有效，再确认应用在目标频道里。
- **Socket Mode 连不上**：检查 App Token 是不是 `xapp-` 开头、有没有 `connections:write` scope。
- **频道没响应、私聊有响应**：通常是 Bot 没进频道，或缺少 `channels:*` / `groups:*` 权限。补 scope 后要重新安装到 workspace。
- **消息太多**：关掉 **转发 Agent 消息**，只保留 **接力**。
