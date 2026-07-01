---
title: 路由配置
pageTitle: 路由配置
eyebrow: 详细配置
lead: 设置请求如何选择模型，并在失败时通过 Fallback 自动重试或切换到备用模型。
---

## 路由如何生效

CCR 的路由会先决定本次请求使用哪个模型，然后再把请求交给上游。当前实现可以分成两层：

1. **请求预处理**：Claude Code 内置路由命中时，CCR 会先处理 Claude Code 的 Agent / Task / Workflow 工具说明、移除 Claude Code subagent 请求里第一条 billing system 文本块，并提取 `<CCR-SUBAGENT-MODEL>...</CCR-SUBAGENT-MODEL>` 模型标签。
2. **模型决策**：如果配置了自定义路由脚本且脚本返回模型，这个模型优先。否则 CCR 会按顺序尝试 Claude Code subagent 标签、已知的 `供应商/模型` 直连模型、内置 Agent 路由、界面路由规则和默认路由。

路由规则的核心是 **条件 + 请求动作**。条件判断请求是否命中，请求动作修改请求字段。最常用的动作是把 `request.body.model` 设置为目标模型或 Fusion 模型。

## Claude Code 内置路由

路由页面会显示内置的 **Claude Code** 和 **Codex** 路由。内置路由不是普通规则，不能上移、下移、编辑或删除，只能启用或关闭。名称旁的信息图标会说明该内置路由的功能。

Claude Code 内置路由的作用是识别 Claude Code 发来的请求，并把主请求路由到 Claude Code Agent 配置或默认路由中的模型：

| 项目 | 行为 |
| --- | --- |
| 命中条件 | 请求 Header 的 `user-agent` 包含 `claude` |
| 启用前提 | **Agent配置** 中存在已启用的 Claude Code 配置 |
| 目标模型 | 优先使用 Claude Code 配置里的模型；如果未设置，使用路由页的默认模型 |
| 请求动作 | 设置 `request.body.model` 为目标模型 |
| 日志原因 | 普通主请求通常显示为 `builtin:claude-code` |

这个内置路由解决的是 Claude Code **主请求** 的默认模型选择。Claude Code 创建的 Subagent、Task 或 Workflow 内部 Agent 可以继续用下面的标签机制自动选择不同模型。

## Claude Code Subagent / Workflow 自动路由

Claude Code 的 Agent / Task / Workflow 可以派生新的模型请求。CCR 使用标签注入来让这些派生请求选择更合适的 CCR 模型：

```text
<CCR-SUBAGENT-MODEL>供应商/模型</CCR-SUBAGENT-MODEL>
```

完整流程如下：

1. Claude Code 主请求命中内置路由后，CCR 会检查当前工具列表。
2. 如果至少有一个模型配置了 **Description**，CCR 会把可用模型及其说明注入到 `Agent` / `Task` 工具说明和 `prompt` 字段说明里。
3. 如果工具列表里有 `Workflow`，CCR 会给 Workflow 工具说明追加要求：workflow 内部创建 `Agent` / `Task` 时，每个派生 Agent 的 prompt 第一行都要带同样的模型标签。
4. Claude Code 调用 `Agent` / `Task`，或 Workflow 内部创建 Agent 时，prompt 第一行会携带 `<CCR-SUBAGENT-MODEL>供应商/模型</CCR-SUBAGENT-MODEL>`。
5. 派生请求进入 CCR 后，CCR 从 system 或前两条 user message 中提取并删除这个标签，然后把该请求路由到标签里的模型。

因此，Subagent / Workflow 的自动路由不是靠 `x-claude-code-agent-id` 之类的 Header 决定模型，而是靠 prompt 标签。Header 只能作为观测线索，真正的模型选择来自标签。

### 与模型页配合

模型页里的 **Description** 是这套机制的开关和选择依据。没有任何模型 Description 时，CCR 不会注入 Agent / Task / Workflow 路由提示词，避免把空模型列表写进工具说明。

推荐配置步骤：

1. 在 **供应商** 中添加可用模型，确认模型 ID 可以真实请求。
2. 打开 **模型** 页面，为希望 Subagent 自动选择的模型填写 Description。说明要写清模型适合的任务、速度、成本和限制。
3. 在 **Agent配置** 中启用 Claude Code 配置，并设置主模型。这个模型负责 Claude Code 主会话。
4. 在 **路由** 页面确认 **Claude Code** 内置路由已启用。
5. 在 Claude Code 中使用 Agent、Task 或 Workflow。需要派生 Agent 时，Claude Code 会根据模型 Description 选择一个 CCR 模型并写入标签。

Description 建议写成任务导向，而不是只写模型厂商名。例如：

| 模型用途 | Description 示例 |
| --- | --- |
| 快速便宜模型 | 适合代码搜索、文件梳理、摘要、简单修改和低成本并行 Subagent。 |
| 强推理模型 | 适合复杂架构分析、大规模重构计划、跨文件推理和高风险代码审查。 |
| 长上下文模型 | 适合读取大量日志、长文档、仓库级上下文整理和 Workflow 汇总。 |

保存后，CCR 会把这些 Description 组织成 “Configured CCR gateway models” 注入给 Claude Code。Claude Code 选择模型后，CCR 会在派生请求上看到 `builtin:claude-code-subagent`，并把标签里的模型作为最终 `resolved model`。

## Fallback 是什么

Fallback 是请求失败后的降级策略。它不负责第一次选模型，而是在当前模型或上游失败时决定是否继续尝试。

路由页面顶部的 **默认失败处理** 是全局 Fallback。每条路由规则里的 **失败时** 是规则级 Fallback：当某条规则命中时，规则级配置会覆盖全局配置。

## Fallback 模式

| 模式 | 行为 |
| --- | --- |
| 关闭 | 不做失败降级，只请求一次当前模型 |
| 继续重试 | 继续请求当前模型，最多重试 `Retries` 次 |
| 失败降级目标 | 先请求当前模型，失败后按配置顺序切换到备用模型 |

**继续重试** 适合上游偶发超时、限流或网络抖动。**失败降级目标** 适合主模型不可用时切到另一个模型或供应商。

## 失败触发条件

网络错误会进入下一次尝试。状态码是否触发 Fallback 取决于模式：

| 模式 | 触发状态码 |
| --- | --- |
| 继续重试 | `408`、`409`、`429`、`5xx` |
| 失败降级目标 | 任意 `4xx` 或 `5xx` |

对于 `429` 限流响应，CCR 会在下一次尝试前等待。上游提供 `Retry-After` 时会优先遵守；否则使用从 1 秒开始、单次最多 30 秒的指数退避。

**失败降级目标** 对 `4xx` 也会切换，是因为模型不存在、鉴权或供应商侧拒绝等错误可能只影响当前目标。切换后如果备用模型可用，请求仍然可以成功。

## 如何配置

### 全局失败降级

在路由页面顶部配置 **默认失败处理**：

1. 选择 **继续重试** 或 **失败降级目标**。
2. 如果选择 **继续重试**，填写 `Retries`。
3. 如果选择 **失败降级目标**，按优先级添加备用模型。

全局 Fallback 会应用到默认路由，以及没有单独配置 Fallback 的规则。

### 规则级失败降级

添加或编辑路由规则时，可以在 **失败时** 中配置这条规则自己的 Fallback。

规则级 Fallback 适合高风险或高成本模型。例如：图片任务先走 Fusion 视觉模型，失败后切到另一个多模态模型；复杂任务先走强模型，失败后切到稳定模型。

### 条件路由

当前界面新增规则时主要使用条件路由。条件可以读取请求 Header 或请求 Body：

| 来源 | 示例 |
| --- | --- |
| `request.header` | `x-client-name == claude-code` |
| `request.body` | `model starts-with claude-` |
| `request.body` | `messages contains-deep image` |

命中后，请求动作可以设置、删除或修改请求字段。最常用的是：

```text
set request.body.model = 供应商/模型
```

模型也可以是 Fusion 模型。这样路由可以把特定请求导向视觉、搜索或工具增强模型。

## 验证方式

保存后发一次请求，到请求日志里检查：

- `request model`：客户端原始请求模型。
- `resolved provider`：最终命中的供应商。
- `resolved model`：最终请求的模型。
- 状态码和错误信息。

如果发生了 Fallback，响应头里会带有 `x-ccr-fallback-attempts`、`x-ccr-fallback-failures`、延迟尝试的 `x-ccr-fallback-delays-ms`，以及最终命中的 `x-ccr-fallback-model`。请求日志详情里也会显示关联的重试尝试列表。
