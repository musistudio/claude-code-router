---
title: Telegram Bot 配置
pageTitle: Telegram Bot
eyebrow: Bot 与 IM 接力 Agent
lead: 把 Agent 的消息接入 Telegram，并在电脑锁屏后把新消息接力过去。Telegram 是所有平台里配置最简单的——只需要一个 Bot Token，几分钟就能跑通。
---

## 这个方式适合谁

Telegram 适合个人或小团队快速接收 Agent 消息。字段最少，只需要 `Bot Token`。如果你只想最快跑通一个 Bot，从 Telegram 开始最省事。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解整体流程和 Forward / Handoff 的区别，再回来配单个平台。

## 你会用到哪些字段

| Telegram 里的名字 | CCR 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| HTTP API token | Bot Token | 必填 | `@BotFather` 创建机器人后返回的 token |

## 第一步：用 BotFather 创建机器人

1. 打开 Telegram。
2. 搜索 `@BotFather`，确认用户名完全一致（官方机器人）。
3. 进会话后发 `/newbot`。
4. 按提示输入机器人显示名，比如 `CCR Assistant`。
5. 再输入机器人用户名——必须以 `bot` 结尾，比如 `ccr_demo_bot`。
6. 创建成功后，`@BotFather` 会返回一段 HTTP API token。
7. 复制这段 token，待会儿填进 CCR 的 Bot Token。

> **别把 token 发给任何人。** 拿到 token 的人就能完全控制你的 Telegram Bot。

## 第二步：按需设置群聊能力

只用私聊的话可以跳过。

要在群里用：

1. 在 `@BotFather` 发 `/setjoingroups`。
2. 选你的机器人。
3. 选允许加入群组。
4. 想让 Bot 看到群里所有消息，发 `/setprivacy`。
5. 再次选刚才的 Bot。
6. 选 `Disable` 关闭隐私模式。
7. 把 Bot 加进目标群。

> Telegram 隐私模式打开时，Bot 通常只能看到命令、@ 它的消息和部分服务消息。关掉隐私模式后，建议把 Bot 移出群再重新加，让设置立刻生效。

## 在 CCR 中接入

1. 打开 CCR 的 **Bots** 页面，点 **Add Bot**。
2. 平台选 **Telegram**。
3. 认证方式是 **Bot Token**。
4. 把 token 填进 **Bot Token**。
5. 保存这个 Bot。
6. 打开 **Profiles**，编辑你要接 Bot 的 Agent Profile。
7. 打开 **Bot** 开关，选刚保存的 Bot。
8. 按需打开 **Forward agent messages** 或 **Handoff**（见下一节）。
9. 从 CCR 重新打开 Agent。

## 消息接力：Forward 还是 Handoff

- **Forward agent messages**：不管锁不锁屏都转发，适合要在 Telegram 里看完整输出时。
- **Handoff（接力）**：只在电脑锁屏后转发，配合 Idle seconds 和目标设备。

> 只想锁屏后提醒，别开 Forward。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到 Telegram 确认机器人能收到并回复。
3. 群里用的话，先确认机器人已经进群、能读写消息。

> **怎么算成功：** Telegram 里能看到 Agent 消息，你回复后 Agent 也能继续。

## 常见问题

- **认证失败**：重新复制 Bot Token。
- **私聊可用、群不可用**：检查机器人进群了没、群权限允不允许它读消息。
- **群里只有 `/command` 能触发**：检查 `@BotFather` 的 `/setprivacy`，或把 Bot 设为群管理员。
- **重置过 token**：旧 token 立刻失效，要回 CCR 更新并重启。
- **消息太多**：关掉 Forward，只留 Handoff。
