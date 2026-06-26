---
title: Agent配置
pageTitle: Agent配置
eyebrow: 详细配置
lead: 为 Claude Code、Codex、ZCode 创建可复用的启动配置，并通过不同配置打开不同的 Agent 实例。
---

## Agent配置是什么

Agent配置是桌面 App 中管理 Claude Code、Codex、ZCode 启动入口的能力。它不是供应商或路由规则，而是一次 Agent 启动所需的完整入口：Agent 类型、打开方式、模型、作用范围、配置文件位置，以及可选的 Bot 绑定。

因此详细配置里会有这个页面。它用于解释“用哪个配置打开哪个 Agent 实例”，而不是继续拆分供应商、路由或 Fusion 的字段。

## 多开机制

每个 Agent配置都有自己的 `id` 和名称。CCR 打开 Agent 时会按名称或 `id` 找到启用的配置，再根据配置生成对应的启动计划。

| 机制 | 实际行为 |
| --- | --- |
| 独立配置文件 | 选择“仅从 CCR 打开时生效”时，Claude Code 和 Codex 会写入 CCR 管理的独立配置目录，路径按配置 `id` 区分 |
| 独立启动器 | Claude Code 使用独立启动包装器，Codex 和 ZCode 使用独立中间层启动器，文件名同样按配置 `id` 或名称区分 |
| 独立 App 数据目录 | 从 App 打开时，Claude App、Codex App、ZCode App 都会使用按配置 `id` 区分的用户数据目录 |
| 运行状态 | CCR 按打开入口和配置 `id` 记录运行中的 App 实例；同一个配置再次打开会激活已有窗口，不同配置可以打开不同实例 |

这意味着你可以为同一个 Agent 建多个配置，例如“Claude Code - 工作项目”“Claude Code - 测试模型”“Codex - Fusion 图像能力”。它们可以选择不同模型、不同作用范围和不同 Bot，打开后就是不同的 Agent 实例。

## 常用选项

| 选项 | 说明 |
| --- | --- |
| Agent | 选择 Claude Code、Codex 或 ZCode |
| 配置名称 | 用于在 CCR 中识别配置，也会作为 `ccr <配置名称>` 的打开目标 |
| 作用范围 | “仅从 CCR 打开时生效”会使用 CCR 管理的独立配置；“系统默认”会写入对应 Agent 的默认配置 |
| 入口模式 | `CLI & APP`、`CLI only`、`App only`；ZCode 只支持 App |
| 模型 | 该 Agent 打开后的默认模型，可以选择普通供应商模型或 Fusion 模型 |
| Bot | App 入口可以绑定 Bot，用于 IM 消息转发或接力 |

## 各 Agent 的差异

### Claude Code

Claude Code 配置会写入设置文件。选择“仅从 CCR 打开时生效”时，CCR 会在自己的配置目录下为这个 Agent配置生成独立设置文件，并通过独立启动包装器打开 Claude Code。

从桌面 App 打开 Claude App 时，CCR 还会为该配置准备独立用户数据目录。不同 Agent配置使用不同目录，因此可以同时打开多个 Claude App 实例。

### Codex

Codex 配置会写入 `config.toml`，并生成模型目录文件。选择“仅从 CCR 打开时生效”时，CCR 会把这些文件放在按配置 `id` 区分的目录中。

Codex 支持 CLI 和 App。CLI 会通过对应配置的启动器打开；App 会使用独立用户数据目录，并把当前配置中的模型和供应商信息带入 Codex App。

### ZCode

ZCode 只支持 App 打开。CCR 会根据 ZCode home 或自定义配置文件写入 ZCode 的 CLI 配置、v2 配置和模型缓存，并在 App 启动时使用当前 Agent配置的模型、供应商和独立用户数据目录。

## 多开建议

1. 为每个需要独立运行的 Agent 实例创建一个 Agent配置。
2. 试用阶段优先选择“仅从 CCR 打开时生效”，避免影响系统默认 Agent。
3. 需要桌面窗口并存时，把入口模式设为 `App only` 或 `CLI & APP`，然后从 CCR 打开 App。
4. 如果同一个配置已经在运行，再次打开会激活已有窗口；需要第二个实例时，创建另一个 Agent配置。
