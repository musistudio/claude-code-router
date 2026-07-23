---
title: LINE Bot 配置
pageTitle: LINE Bot
eyebrow: Bot 与 IM 接力 Agent
lead: 把 Agent 的消息接入 LINE 的好友、群聊或 Official Account，并在电脑锁屏后把新消息接力过去。这一页从创建 LINE Messaging API channel 开始，带你走到在 CCR 里跑通。
---

## 这个方式适合谁

LINE 适合把 Agent 消息接入已有的 LINE 好友、群聊或 LINE Official Account。CCR 用 Channel Access Token 作为主要认证字段。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解整体流程和转发 Agent 消息、接力的区别，再回来配单个平台。

## 你会用到哪些字段

CCR 里 LINE 的认证方式叫 **Bot Token**，这里需要填写下面这两个 channel 字段：

| LINE 后台里的名字 | CCR 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| Channel access token | Channel Access Token | 必填 | 让 Bot 调用 LINE Messaging API |
| Channel secret | Channel Secret | 建议填 | 用来校验 LINE 发来的请求 |

## 第一步：创建 Messaging API channel

1. 打开 [LINE Developers Console](https://developers.line.biz/console/)。
2. 登录 LINE 账号。
3. 创建一个供应商，或选已有的。
4. 点 `Create a new channel`。
5. 选 `Messaging API`。
6. 按页面要求填 Channel 名称、描述、图标、分类等。
7. 创建后进入这个 Messaging API channel。

> 已有 LINE Official Account 的话，也可以在该账号设置里启用 Messaging API，再回控制台复制凭证。

## 第二步：复制 Channel Secret

1. 进入刚创建的 Messaging API channel。
2. 打开 `Basic settings`。
3. 找到 `Channel secret`，复制，待会儿填到 CCR 的 Channel Secret。

## 第三步：签发 Channel Access Token

1. 打开 `Messaging API` 标签页。
2. 找到 `Channel access token`。
3. 点 `Issue` 或 `Reissue`。
4. 复制生成的 token，待会儿填到 CCR 的 Channel Access Token。

> 优先用长效 token。重新签发会让旧 token 失效，要同步更新 CCR。

## 第四步：打开聊天入口

1. 要群聊就把 `Allow bot to join group chats` 打开。
2. 建议关掉 LINE 官方账号的自动回复，免得用户同时收到默认回复和 Agent 回复。

## 在 CCR 中接入

1. 打开 CCR 的 **Bot 管理** 页面，点 **添加 Bot**。
2. 平台选 **LINE**。
3. 认证方式是 **Bot Token**（这就是 LINE 在 CCR 里的固定认证方式）。
4. 把 token 填进 **Channel Access Token**。
5. 把 secret 填进 **Channel Secret**。
6. 保存这个 Bot。
7. 打开 **Agent 配置档案**，编辑你要接 Bot 的 Agent 配置档案。
8. 打开 **Bot** 开关，选刚保存的 Bot。
9. 按需打开 **转发 Agent 消息** 或 **接力**（见下一节）。
10. 从 CCR 重新打开 Agent。

## 消息接力：转发还是接力

- **转发 Agent 消息**：不管锁不锁屏都转发，适合要在 LINE 里看完整输出时。
- **接力**：只在电脑锁屏后转发，配合 **空闲秒数** 和目标设备。

> 只想锁屏后提醒，别开 **转发 Agent 消息**。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到 LINE 确认机器人能收到并回复。
3. 群聊用的话，确认机器人已经进群、有发言权限。

> **怎么算成功：** LINE 里能看到 Agent 消息，你回复后 Agent 也能继续。

## 常见问题

- **认证失败**：重新复制 Channel Access Token。
- **能发不能收**：确认 Channel Access Token 有效、CCR 已启动并连上 LINE。
- **群聊不可用**：确认 `Allow bot to join group chats` 打开了，把 Bot 重新加进群。
- **只想锁屏后提醒**：别开 **转发 Agent 消息**，只开 **接力**。
