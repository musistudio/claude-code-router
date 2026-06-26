---
title: Discord Bot 配置
pageTitle: Discord Bot
eyebrow: Bot 与 IM 接力 Agent
lead: 把 Agent 的消息接入 Discord 的服务器频道或私聊，并在电脑锁屏后把新消息接力到 Discord。这一页从创建 Discord 应用开始，带你一直走到在 CCR 里跑通。
---

## 这个方式适合谁

Discord 适合把 Agent 消息接入服务器频道、私有协作服务器或个人 DM。最常用的是 Bot Token，配置直接。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解整体流程和转发 Agent 消息、接力的区别，再回来配单个平台。

## 你会用到哪些字段

| Discord 后台里的名字 | CCR 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| Token | Bot Token | 必填 | Bot 页里的机器人 token |
| Application ID | Application ID | 可选 | General Information 页里的应用 ID |
| Public Key | Public Key | 可选 | 交互回调场景可能会用到 |

通常用 Bot Token 就够了。只有接入流程明确要求 OAuth 时，才选 OAuth 2.0。

## 第一步：创建 Discord 应用和 Bot

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications)。
2. 点 `New Application`。
3. 填名字，比如 `CCR`。
4. 创建后进入应用详情。
5. 左侧打开 `Bot`。
6. 页面还没有 Bot 的话，点 `Add Bot`。
7. 给机器人设头像和用户名。

## 第二步：打开必要权限

1. 仍在 `Bot` 页，找到 `Privileged Gateway Intents`。
2. 打开 **Message Content Intent**。没有它，Bot 很可能看不到用户发的消息正文。
3. 要按成员、角色或用户名做判断，再打开 **Server Members Intent**。
4. **Presence Intent** 一般不用开，除非你要读在线状态。

## 第三步：复制 Bot Token

1. 在 `Bot` 页找到 `Token`。
2. 点 `Reset Token` 或 `Copy`。
3. 第一次创建时 `Reset Token` 会生成第一个 token，不代表你弄坏了什么。
4. 复制生成的 token，待会儿填进 CCR 的 Bot Token。

> 这个 token 等同于机器人密码。不要发进 Discord，也不要贴进 Agent 的 prompt。

## 第四步：邀请 Bot 进服务器

1. 左侧打开 `OAuth2`。
2. 打开 `URL Generator`。
3. `Scopes` 勾选 `bot` 和 `applications.commands`。
4. `Bot Permissions` 至少勾选 `View Channels`、`Send Messages`、`Read Message History`、`Embed Links`、`Attach Files`。
5. 想给审批消息加反应，再勾 `Add Reactions`。
6. 复制底部生成的 URL，在浏览器打开，选目标服务器并授权。

## 第五步：复制可选字段（如需要）

如果某处要求填 Application ID 或 Public Key：

1. 回到 Discord Developer Portal。
2. 打开应用的 `General Information`。
3. 复制 `Application ID` 和 `Public Key`。

## 在 CCR 中接入

1. 打开 CCR 的 **Bot 管理** 页面，点 **添加 Bot**。
2. 平台选 **Discord**。
3. 认证方式默认是 **Bot Token**，保持即可。
4. 把 Token 填进 **Bot Token**。
5. 需要的话补上 **Application ID** 和 **Public Key**。
6. 保存这个 Bot。
7. 打开 **Agent配置**，编辑你要接 Bot 的 Agent配置。
8. 打开 **Bot** 开关，选刚保存的 Bot。
9. 按需打开 **转发 Agent 消息** 或 **接力**（见下一节）。
10. 从 CCR 重新打开 Agent。

## 消息接力：转发还是接力

- **转发 Agent 消息**：不管锁不锁屏都转发，适合调试或要完整记录的频道。
- **接力**：只在电脑锁屏后转发，配合 **空闲秒数** 和目标设备。

> 只想锁屏后提醒，别开 **转发 Agent 消息**。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到 Discord 确认 Bot 能收到并回复。
3. 用服务器频道的话，确认 Bot 在该服务器里、有发言权限。

> **怎么算成功：** Discord 里能看到 Agent 消息，回复后 Agent 也能继续。

## 常见问题

- **Bot 没响应**：先确认 Bot Token 复制对了。
- **Bot 在线但看不到你发的内容**：检查 Message Content Intent 打开了没。
- **频道里没消息**：确认 Bot 在该服务器里、频道权限允许它发言。
- **邀请链接里看不到权限选项**：确认 OAuth2 URL Generator 勾了 `bot` scope。
- **接力不触发**：确认电脑已锁屏、接力已开，检查空闲时间和目标设备。
