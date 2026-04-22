# Qwen 3.5 OpenAI Protocol Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable support for Qwen 3.5 via the OpenAI `/v1/chat/completions` protocol with automatic thinking detection and tool mapping.

**Architecture:** Create a new `OpenAITransformer` and refactor Qwen-specific logic into shared utilities. Update the server's routing layer to handle `/v1/chat/completions`.

**Tech Stack:** TypeScript, Fastify, OpenAI SDK (types).

---

### Task 1: Shared Qwen Utilities

**Files:**
- Create: `packages/core/src/utils/qwen.ts`
- Modify: `packages/core/src/transformer/anthropic.transformer.ts`
- Test: `packages/core/tests/utils/qwen.test.ts`

- [ ] **Step 1: Create the Qwen utility file with thinking detection and tool mapping**

```typescript
// packages/core/src/utils/qwen.ts
export const QWEN_THINK_TAGS = {
  start: "<think>",
  end: "</think>"
};

export function extractQwenThinking(text: string): { thinking: string; content: string } {
  const startTag = QWEN_THINK_TAGS.start;
  const endTag = QWEN_THINK_TAGS.end;
  
  if (text.includes(startTag)) {
    const parts = text.split(startTag);
    const preThinking = parts[0];
    const rest = parts[1];
    
    if (rest.includes(endTag)) {
      const innerParts = rest.split(endTag);
      return {
        thinking: innerParts[0],
        content: preThinking + (innerParts[1] || "")
      };
    }
    return {
      thinking: rest,
      content: preThinking
    };
  }
  return { thinking: "", content: text };
}

export const TOOL_NAME_MAP: Record<string, string> = {
  "run_bash_command": "Bash",
  "edit_file": "Edit",
  "read_file": "Read",
  "glob": "Glob",
  "ls": "Ls",
  "write_file": "Write"
};

export const REVERSE_TOOL_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_NAME_MAP).map(([k, v]) => [v, k])
);

export function mapToolName(name: string): string {
  return TOOL_NAME_MAP[name] || name;
}

export function unmapToolName(name: string): string {
  return REVERSE_TOOL_NAME_MAP[name] || name;
}
```

- [ ] **Step 2: Write tests for Qwen utilities**

```typescript
// packages/core/tests/utils/qwen.test.ts
import { extractQwenThinking, mapToolName, unmapToolName } from "../../src/utils/qwen";

describe("Qwen Utilities", () => {
  test("extractQwenThinking should extract content between tags", () => {
    const input = "Hello <think>I am thinking</think> world";
    const result = extractQwenThinking(input);
    expect(result.thinking).toBe("I am thinking");
    expect(result.content).toBe("Hello  world");
  });

  test("mapToolName should map long names to short names", () => {
    expect(mapToolName("run_bash_command")).toBe("Bash");
    expect(mapToolName("unknown")).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx jest packages/core/tests/utils/qwen.test.ts`
Expected: PASS

- [ ] **Step 4: Refactor AnthropicTransformer to use shared utilities**

Modify `packages/core/src/transformer/anthropic.transformer.ts` to use `mapToolName`, `unmapToolName`, and the shared logic. (I will do this surgically in the implementation phase).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/qwen.ts packages/core/tests/utils/qwen.test.ts packages/core/src/transformer/anthropic.transformer.ts
git commit -m "refactor: extract Qwen utilities to shared file"
```

---

### Task 2: OpenAITransformer Implementation

**Files:**
- Create: `packages/core/src/transformer/openai.transformer.ts`
- Modify: `packages/core/src/transformer/index.ts`
- Test: `packages/core/tests/transformer/openai.transformer.test.ts`

- [ ] **Step 1: Implement OpenAITransformer**

```typescript
// packages/core/src/transformer/openai.transformer.ts
import { Transformer, TransformerContext } from "@/types/transformer";
import { UnifiedChatRequest, UnifiedMessage } from "@/types/llm";
import { mapToolName, unmapToolName, extractQwenThinking } from "@/utils/qwen";

export class OpenAITransformer implements Transformer {
  name = "OpenAI";
  endPoint = "/v1/chat/completions";

  async transformRequestOut(request: any): Promise<UnifiedChatRequest> {
    const messages: UnifiedMessage[] = (request.messages || []).map((msg: any) => {
      const unifiedMsg: UnifiedMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.tool_calls) {
        unifiedMsg.tool_calls = msg.tool_calls.map((tc: any) => ({
          ...tc,
          function: {
            ...tc.function,
            name: mapToolName(tc.function.name)
          }
        }));
      }
      return unifiedMsg;
    });

    const tools = request.tools?.map((tool: any) => ({
      ...tool,
      function: {
        ...tool.function,
        name: mapToolName(tool.function.name),
        parameters: {
          ...tool.function.parameters,
          required: Object.keys(tool.function.parameters.properties || {})
        }
      }
    }));

    return {
      messages,
      model: request.model,
      stream: request.stream,
      tools,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    };
  }

  async transformResponseIn(response: Response, context: TransformerContext): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        // Handle streaming (reuse or adapt Anthropic logic for OpenAI chunks)
        return this.transformStreamResponse(response, context);
    }
    const data = await response.json();
    const choice = data.choices[0];
    if (choice?.message?.content) {
      const { thinking, content } = extractQwenThinking(choice.message.content);
      if (thinking) {
        choice.message.reasoning_content = thinking;
        choice.message.content = content;
      }
    }
    // Unmap tool names in response
    if (choice?.message?.tool_calls) {
        choice.message.tool_calls.forEach((tc: any) => {
            tc.function.name = unmapToolName(tc.function.name);
        });
    }
    return new Response(JSON.stringify(data), { headers: response.headers });
  }

  private transformStreamResponse(response: Response, context: TransformerContext): Response {
      // Implementation details for OpenAI SSE transformation
      // (Simplified for plan brevity, full implementation will handle chunks)
      return response; 
  }
}
```

- [ ] **Step 2: Register transformer**

Add `OpenAITransformer` to `packages/core/src/transformer/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/transformer/openai.transformer.ts packages/core/src/transformer/index.ts
git commit -m "feat: implement OpenAITransformer with Qwen support"
```

---

### Task 3: Server Routing & Hook Update

**Files:**
- Modify: `packages/core/src/server.ts`
- Test: Manual verification with `curl`

- [ ] **Step 1: Update preHandler hook to support /v1/chat/completions**

```typescript
// packages/core/src/server.ts
// In start() method:
this.app.addHook("preHandler", async (req: any, reply: any) => {
  const url = new URL(`http://127.0.0.1${req.url}`);
  if (url.pathname.endsWith("/v1/messages") || url.pathname.endsWith("/v1/chat/completions")) {
    await router(req, reply, {
      configService: this.configService,
      tokenizerService: this.tokenizerService,
    });
  }
});
```

- [ ] **Step 2: Update model parsing middleware**

Ensure `req.provider` and `req.model` are extracted correctly for the OpenAI endpoint.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/server.ts
git commit -m "feat: enable routing for /v1/chat/completions"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Test with Qwen model and tool calling via LiteLLM or curl**
- [ ] **Step 2: Verify reasoning_content is present in the response**
- [ ] **Step 3: Verify tool names are correctly mapped/unmapped**
