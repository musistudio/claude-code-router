# 修复 AnthropicTransformer 变量未定义及工具名称映射错误

## 问题描述
1. 转发器日志中出现 `ReferenceError: thinkingBlockIndex is not defined` 和 `ReferenceError: textBlockIndex is not defined`。
2. Claude Code UI 报错 `Error editing file` 和 `Exit code 1`，即便操作实际上已经生效。
3. 核心原因：在 `convertOpenAIStreamToAnthropic` 流式转换逻辑中使用了 `thinkingBlockIndex` 和 `textBlockIndex` 变量，但在其作用域内并未声明。

## 修复目标
1. 消除转发器端的 `ReferenceError`。
2. 修复 Claude Code 端因响应解析中断导致的 UI 报错。
3. 确保工具调用名称的一致性（Qwen 模型可能需要的 `Edit` 应在返回给 Claude Code 时还原为 `edit_file`）。

## 详细修复方案

### 1. 修复变量声明
在 `packages/core/src/transformer/anthropic.transformer.ts` 的 `convertOpenAIStreamToAnthropic` 函数中增加以下声明：
```typescript
let thinkingBlockIndex = -1;
let textBlockIndex = -1;
```

### 2. 工具名还原逻辑（如果必要）
检查 `openai.responses.transformer.ts` 中的工具转换，确保在 `transformResponseIn` 阶段，如果有必要，将工具名转换回 Claude Code 的原始名称。

## 验证计划
1. 使用 `ccr restart` 重启转发器。
2. 在 Claude Code 中执行一次编辑操作（Update）和一次 Git 提交。
3. 确认 UI 不再显示 `Error editing file`，且转发器日志中无 `ReferenceError`。
