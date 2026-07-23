---
title: 配置步骤
pageTitle: Bot 配置步骤
eyebrow: Bot
lead: 添加 Bot、绑定 Agent 配置档案，并选择消息转发或接力模式。
---

## 操作流程

1. 打开 **Bot 管理**，点击 **添加 Bot**。
2. 选择平台并填写 Token、Secret、Signing Secret、Robot Code 或 OAuth 信息。
3. 保存 Bot。
4. 打开目标 Agent 配置档案，开启 **Bot**。
5. 按需设置转发、接力、语言、超时、附件、流式回复和 **允许 Agent 使用 Shell 工具**。
6. 从 CCR 重新打开 Claude、Codex、ZCode 或 OpenCode App。Bot 只在 App 存活期间在线。

## 验证方式

从 CCR 打开 Agent App 后，在 IM 发送 `/project current`、`/session list` 和一条普通消息。Profile 卡片会显示 Bot 连接、最后事件、最后投递、待投递数量和脱敏错误；也可发送 `/session doctor` 查看诊断。关闭 App 后，Bot 状态应切换为离线。
