# Bug 修复报告：使用 Kimi-K2.5 时出现 "Content block is not a text block"

**日期：** 2026-04-26  
**提交：** `dd7959d`  
**PR：** [musistudio/claude-code-router#1356](https://github.com/musistudio/claude-code-router/pull/1356)  
**修改文件：** `packages/core/src/transformer/anthropic.transformer.ts`

---

## 错误现象

在使用 Kimi-K2.5（或任何在单次响应中交替输出文本和工具调用的模型）时，Claude Code 抛出以下错误：

```
API Error: Content block is not a text block
```

该错误在模型返回同时包含文本和工具调用的响应后立即触发——例如在执行搜索或文件读取工具之后。

---

## 根本原因

### 背景：Anthropic SSE 流式协议

Claude Code 使用 Anthropic 的流式格式与上游服务通信。内容以有类型的 *content block* 序列传递：

```
content_block_start  { type: "text" }
content_block_delta  { type: "text_delta", text: "..." }
content_block_stop

content_block_start  { type: "tool_use", id: "...", name: "..." }
content_block_delta  { type: "input_json_delta", partial_json: "..." }
content_block_stop
```

每个 block 都有明确的类型。向 `tool_use` block 发送 `text_delta` 是协议违规，SDK 会立即抛出异常。

### Bug 所在

`AnthropicTransformer` 负责将 OpenAI 格式的流式响应转换为 Anthropic SSE 格式。转换过程中，它用两个变量跟踪当前 block 的状态：

| 变量 | 作用 |
|---|---|
| `currentContentBlockIndex` | 当前开着的 block 的索引（-1 表示无 block 开着） |
| `hasTextContentStarted` | 第一个文本 block 开启后置为 `true` |

当收到文本内容（`choice.delta.content`）时，转换器需要判断是开一个新的文本 block，还是继续向已有 block 追加内容。原来的判断逻辑是：

```typescript
// 修复前（有 bug）
const isCurrentTextBlock = hasTextContentStarted;
```

**问题所在：** `hasTextContentStarted` 在第一个文本 block 开启时被设为 `true`，但**从未被重置**——即使该文本 block 已经关闭、`tool_use` block 已经开启，它依然保持 `true`。

### 触发时序

Kimi-K2.5 在使用工具时，典型的响应结构如下：

```
chunk 1:  delta.content = "我来搜索一下..."     ← 开启 text block（index 0）
chunk 2:  delta.tool_calls[0] = { name: "Glob" } ← 关闭 text block，开启 tool_use block（index 1）
chunk 3:  delta.content = "找到了，结果如下..."  ← BUG：hasTextContentStarted 仍为 true
                                                     → isCurrentTextBlock = true
                                                     → 不开新的 text block
                                                     → text_delta 被发送到 index 1（tool_use block！）
                                                     → SDK 抛出 "Content block is not a text block"
```

另一个条件判断也存在同样问题：

```typescript
// 修复前（有 bug）
if (!hasTextContentStarted && !hasFinished) {
  // 开启新的 text block
}
```

由于 `hasTextContentStarted` 在第一个文本 block 之后永远为 `true`，即使 `tool_use` block 已经关闭，也不会再开启新的文本 block。

---

## 修复方案

新增变量 `currentContentBlockType`，精确追踪**当前开着的 block 的类型**：

```typescript
let currentContentBlockType: string | null = null; // 'text' | 'tool_use' | 'thinking' | null
```

### 具体改动

**1. 声明新变量（第 278 行）**

```typescript
let currentContentBlockIndex = -1;
let currentContentBlockType: string | null = null; // 新增
```

**2. 修复核心判断（第 602 行）**

```typescript
// 修复前
const isCurrentTextBlock = hasTextContentStarted;

// 修复后
const isCurrentTextBlock = currentContentBlockType === 'text';
```

**3. 修复文本 block 创建的条件（第 620 行）**

```typescript
// 修复前
if (!hasTextContentStarted && !hasFinished) {

// 修复后
if (currentContentBlockIndex < 0 && !hasFinished) {
```

改为检查「当前没有开着的 block」，而不是「历史上是否开过文本 block」，从而允许在 `tool_use` block 关闭后再次开启新的文本 block。

**4. 在所有 block 开启/关闭处同步维护 `currentContentBlockType`**

| 时机 | 操作 |
|---|---|
| text block 开启 | `currentContentBlockType = 'text'` |
| text block 关闭 | `currentContentBlockType = null` |
| tool_use block 开启 | `currentContentBlockType = 'tool_use'` |
| tool_use block 关闭 | `currentContentBlockType = null` |
| thinking block 开启 | `currentContentBlockType = 'thinking'` |
| thinking block 关闭 | `currentContentBlockType = null` |
| `safeClose()` 执行时 | `currentContentBlockType = null` |
| `finish_reason` 处理时 | `currentContentBlockType = null` |

### 改动规模

```
packages/core/src/transformer/anthropic.transformer.ts | 18 ++++++++++++++----
1 file changed, 14 insertions(+), 4 deletions(-)
```

---

## 为何 Kimi-K2.5 会触发此 Bug

Kimi-K2.5 是推理模型，在涉及工具调用的任务中，其响应结构通常为：

```
[reasoning_content]  推理过程（思考链）
[content]            "我来搜索一下..."
[tool_calls]         实际工具调用
[content]            "根据结果，..."
```

这种 **文本 → 工具调用 → 文本** 的交替模式，正是触发此 bug 的精确条件。大多数其他模型（GPT-4o、DeepSeek 等）要么不会交替输出，要么在实际使用中触发频率较低，所以这个 bug 此前未被发现。

> **备注：** `JoyBuilderIntra` provider 的 transformer 配置为 `"use": ["OpenAI"]`，不包含 `reasoning` transformer，因此 `reasoning_content`（思考链内容）会被静默丢弃。本 bug 仅与文本/工具调用的交替输出有关，与思考链无关。

---

## 影响范围

在 commit `dd7959d` 之前，所有使用 `AnthropicTransformer` 的版本，在对接会交替输出文本和工具调用的模型时，均会触发此错误。

---

## 验证

应用修复并重新构建（`pnpm build && npm install -g .`）后，Kimi-K2.5 可以正常流式输出包含文本与工具调用交替的响应，不再出现 "Content block is not a text block" 错误。
