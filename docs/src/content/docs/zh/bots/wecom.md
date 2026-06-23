---
title: 企业微信 Bot 配置
pageTitle: 企业微信 Bot
eyebrow: Bot 平台
lead: 把 Agent 的消息接入企业微信，让团队成员在企业微信里接收并回复，并在电脑锁屏后接力。这一页从企业微信管理后台创建自建应用开始，带你走到在 CCR 里跑通。
---

## 这个方式适合谁

企业微信适合把 Agent 接入企业内部消息环境，让团队成员在企业微信里接收 Agent 消息并回复。

> 还没看过 Bot 总览？先回到主文档的「把 Agent 消息转发到 IM（Bot）」那一节，了解整体流程和 Forward / Handoff 的区别，再回来配单个平台。

## 你会用到哪些字段

| 企业微信后台里的名字 | CCR 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| 企业ID / CorpID | Corp ID | 必填 | 企业级标识，在「我的企业」里 |
| AgentId | Agent ID | 必填 | 自建应用的应用 ID |
| Secret | Secret | 必填 | 自建应用密钥，通常要管理员在手机端确认查看 |

> CCR 会用 Corp ID 和应用 Secret 去换企业微信接口的 access_token，你不用自己手动获取。

## 第一步：获取 Corp ID

1. 打开 [企业微信管理后台](https://work.weixin.qq.com/wework_admin/frame)。
2. 用管理员账号登录。
3. 顶部打开 `我的企业`。
4. 进入 `企业信息`。
5. 找到 `企业ID`，复制，待会儿填到 CCR 的 Corp ID。

## 第二步：创建自建应用

1. 在管理后台打开 `应用管理`。
2. 找到 `自建` 区域。
3. 点 `创建应用`。
4. 填应用名，比如 `CCR`。
5. 上传应用 Logo。
6. 选可见范围。测试时先选你自己或一个小测试部门。
7. 点创建。

## 第三步：复制 Agent ID 和 Secret

1. 进入刚创建的自建应用详情。
2. 复制 `AgentId`，待会儿填到 CCR 的 Agent ID。
3. 找到 `Secret`，点查看。
4. 按企业微信提示，在手机企业微信里确认。
5. 复制显示出的 `Secret`。

> 如果企业微信要求配 `企业可信 IP`，需要把运行 CCR Bot Gateway 的出口公网 IP（或你用的中继服务出口 IP）加进去。

## 在 CCR 中接入

1. 打开 CCR 的 **Bots** 页面，点 **Add Bot**。
2. 平台选 **企业微信（WeCom）**。
3. 认证方式是 **App Secret**。
4. 填 **Corp ID**、**Agent ID**、**Secret**。
5. 保存这个 Bot。
6. 打开 **Profiles**，编辑你要接 Bot 的 Agent Profile。
7. 打开 **Bot** 开关，选刚保存的 Bot。
8. 按需打开 **Forward agent messages** 或 **Handoff**（见下一节）。
9. 从 CCR 重新打开 Agent。

## 消息接力：Forward 还是 Handoff

- **Forward agent messages**：不管锁不锁屏都转发。会增加消息量，只在要完整记录或排查问题时用。
- **Handoff（接力）**：只在电脑锁屏后转发，配合 Idle seconds 和目标设备。

> 只想锁屏后提醒，别开 Forward。

## 测试

1. 从 CCR 打开 Agent，触发一条消息。
2. 到企业微信确认应用能收到并回复。
3. 锁屏电脑，等过你设的空闲时间，确认接力触发后新消息会进企业微信。

> **怎么算成功：** 企业微信里能看到 Agent 消息，你回复后 Agent 也能继续。

## 常见问题

- **认证失败**：重新复制 Corp ID、Agent ID 和 Secret。
- **能启动但收不到消息**：检查企业微信应用是否允许接收消息、当前成员有没有使用权限。
- **发送失败提示 IP 不可信**：回企业微信后台配 `企业可信 IP`。
- **部分成员看不到应用**：检查自建应用的可见范围。
- **接力不触发**：确认电脑已锁屏，检查 Handoff 开关、空闲时间和目标设备。
