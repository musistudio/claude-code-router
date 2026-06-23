---
title: 钉钉 Bot 配置
pageTitle: 钉钉 Bot
eyebrow: Bot 平台
lead: 把 Agent 的消息接入钉钉的企业协作环境，并在电脑锁屏后接力。这一页从钉钉开发者后台创建应用开始，带你走到在 CCR 里跑通。
---

## 这个方式适合谁

钉钉适合把 Agent 消息接入企业协作环境。CCR 用 App Secret 方式连接钉钉应用。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解整体流程和 Forward / Handoff 的区别，再回来配单个平台。

## 你会用到哪些字段

| 钉钉后台里的名字 | CCR 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| Client ID / AppKey | App Key | 必填 | 应用标识 |
| Client Secret / AppSecret | App Secret | 必填 | 应用密钥 |
| RobotCode | Robot Code | 可选 | 多机器人或媒体能力场景可能需要 |

> 新版钉钉把机器人作为「应用能力」来配，别从旧的独立「机器人」入口开始。

## 第一步：创建钉钉应用

1. 打开 [钉钉开发者后台](https://open-dev.dingtalk.com/)。
2. 登录钉钉账号。
3. 选要接入的开发组织。
4. 顶部打开 `应用开发`。
5. 点 `创建应用`。
6. 填应用名，比如 `CCR`。
7. 填应用描述，其他先默认。
8. 点创建。

## 第二步：复制 App Key 和 App Secret

1. 进入刚创建的应用详情。
2. 左侧打开 `应用信息` 或 `凭证与基础信息`。
3. 复制 `Client ID`，对应 CCR 的 App Key。
4. 复制 `Client Secret`，对应 CCR 的 App Secret。

> 钉钉后台可能还显示旧名 `AppKey` / `AppSecret`，按字段名对应复制即可。

## 第三步：开启机器人能力

1. 在应用详情打开 `机器人与消息推送`，或打开 `应用能力` 后选 `机器人`。
2. 开启 `机器人配置`。
3. 填机器人名称、头像、简介。
4. 消息接收模式选 **Stream 模式**。
5. 保存。
6. 页面显示 `RobotCode` 的话，复制下来，待会儿填 Robot Code。

## 第四步：发布应用并加入会话

1. 打开 `版本管理与发布`，创建新版本。
2. 设可见范围，测试时先选你自己或一个测试群。
3. 提交发布。
4. 发布后，在钉钉客户端搜机器人名称。
5. 进机器人会话，或在目标群的群设置里加这个机器人。

## 在 CCR 中接入

1. 打开 CCR 的 **Bots** 页面，点 **Add Bot**。
2. 平台选 **钉钉（DingTalk）**。
3. 认证方式是 **App Secret**。
4. 把 Client ID 填进 **App Key**。
5. 把 Client Secret 填进 **App Secret**。
6. 复制到了 RobotCode 就填 **Robot Code**。
7. 保存这个 Bot。
8. 打开 **Profiles**，编辑你要接 Bot 的 Agent Profile。
9. 打开 **Bot** 开关，选刚保存的 Bot。
10. 按需打开 **Forward agent messages** 或 **Handoff**（见下一节）。
11. 从 CCR 重新打开 Agent。

## 消息接力：Forward 还是 Handoff

- **Forward agent messages**：不管锁不锁屏都转发，适合要在钉钉里保留完整输出。
- **Handoff（接力）**：只在电脑锁屏后转发，配合 Idle seconds 和目标设备。

> 只想锁屏后提醒，别开 Forward。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到钉钉确认应用能收到并回复。
3. 群聊用的话，确认应用或机器人已加进目标群、有发言权限。

> **怎么算成功：** 钉钉里能看到 Agent 消息，你回复后 Agent 也能继续。

## 常见问题

- **认证失败**：重新复制 App Key 和 App Secret。
- **机器人标识相关错误**：检查 Robot Code 和平台后台一致。
- **机器人收不到消息**：确认应用内开了机器人能力、消息接收模式和 CCR 配置一致。
- **用户找不到机器人**：检查应用已发布、可见范围包含当前用户或群成员。
- **接力不触发**：确认电脑已锁屏，检查 Handoff 开关、空闲时间和目标设备。
