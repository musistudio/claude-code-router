---
title: GLM-4.6 Supports Reasoning and Interleaved Thinking
date: 2025-11-18
tags: [glm, reasoning, chain-of-thought]
---

# GLM-4.6 Supports Reasoning and Interleaved Thinking

## Enabling Reasoning in Claude Code with GLM-4.6

Starting from version 4.5, GLM has supported Claude Code. I've been following its progress closely, and many users have reported that reasoning could not be enabled within Claude Code. Recently, thanks to sponsorship from Zhipu, I decided to investigate this issue in depth. According to the [official documentation](https://docs.z.ai/api-reference/llm/chat-completion), the`/chat/completions` endpoint has reasoning enabled by default, but the model itself decides whether to think:

```
thinking.type enum<string> default:enabled

Whether to enable the chain of thought(When enabled, GLM-4.6, GLM-4.5 and others will automatically determine whether to think, while GLM-4.5V will think compulsorily), default: enabled

Available options: enabled, disabled
```

However, within Claude Code, its heavy system prompt interference disrupts GLM's internal reasoning judgment, causing the model to rarely think.
Therefore, we need to explicitly guide the model to believe reasoning is required. Since claude-code-router functions as a proxy, the only feasible approach is modifying prompts or parameters.

Initially, I tried completely removing Claude Code's system prompt — and indeed, the model started reasoning — but that broke Claude Code's workflow.
So instead, I used prompt injection to clearly instruct the model to think step by step.


```javascript
// transformer.ts
import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

export class ForceReasoningTransformer implements Transformer {
  name = "forcereasoning";

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    const systemMessage = request.messages.find(
      (item) => item.role === "system"
    );
    if (Array.isArray(systemMessage?.content)) {
      systemMessage.content.push({
        type: "text",
        text: "You are an expert reasoning model.\nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly.\nNever skip your chain of thought.\nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
      });
    }
    const lastMessage = request.messages[request.messages.length - 1];
    if (lastMessage.role === "user" && Array.isArray(lastMessage.content)) {
      lastMessage.content.push({
        type: "text",
        text: "You are an expert reasoning model.\nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly.\nNever skip your chain of thought.\nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
      });
    }
    if (lastMessage.role === "tool") {
      request.messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "You are an expert reasoning model.\nAlways think step by step before answering. Even if the problem seems simple, always write down your reasoning process explicitly.\nNever skip your chain of thought.\nUse the following output format:\n<reasoning_content>(Write your full detailed thinking here.)</reasoning_content>\n\nWrite your final conclusion here.",
          },
        ],
      });
    }
    return request;
  }
}
```

Why use `<reasoning_content>` instead of the `<think>` tag? Two reasons:

1. Using the `<think>` tag doesn't effectively trigger reasoning — likely because the model was trained on data where `<think>` had special behavior.

2. If we use `<think>`, the reasoning output is split into a separate field, which directly relates to the chain-of-thought feedback problem discussed below.

## Chain-of-Thought Feedback
Recently, Minimax released `Minimax-m2`, along with [an article](https://www.minimaxi.com/news/why-is-interleaved-thinking-important-for-m2) explaining interleaved thinking.
While the idea isn't entirely new, it's a good opportunity to analyze it.

Why do we need to interleaved thinking?
Minimax's article mentions that the Chat Completion API does not support passing reasoning content between requests.
We know ChatGPT was the first to support reasoning, but OpenAI initially didn't expose the chain of thought to users.
Therefore, the Chat Completion API didn't need to support it. Even the CoT field was first introduced by DeepSeek.

Do we really need explicit CoT fields? What happens if we don't have them? Will it affect reasoning?
By inspecting [sglang's source code](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/parser/reasoning_parser.py), we can see that reasoning content is naturally emitted in messages with specific markers.
If we don't split it out, the next-round conversation will naturally include it.
Thus, the only reason we need interleaved thinking is because we separated the reasoning content from the normal messages.

With fewer than 40 lines of code above, I implemented a simple exploration of enabling reasoning and chain-of-thought feedback for GLM-4.5/4.6.
(It's only simple because I haven't implemented parsing logic yet — you could easily modify the transformer to split reasoning output on response and merge it back on request, improving Claude Code's frontend display compatibility.)

If you have better ideas, feel free to reach out — I'd love to discuss further.
