import assert from "node:assert/strict";
import { ReasoningTransformer } from "../transformer/reasoning.transformer";
import { UnifiedChatRequest } from "../types/llm";

const provider = {
  name: "openai-compatible",
  baseUrl: "https://deepseek.test/v1/chat/completions",
};

function buildStreamResponse(events: Array<Record<string, unknown>>): Response {
  const payload = [
    ...events.map((event) => `data: ${JSON.stringify(event)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");

  return new Response(payload, {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

async function drainResponse(response: Response): Promise<string> {
  return await response.text();
}

async function testInlineThinkingReplay() {
  const transformer = new ReasoningTransformer();
  const context = { req: {} };
  const request: UnifiedChatRequest = {
    model: "deepseek-v4-pro",
    stream: false,
    messages: [
      {
        role: "user",
        content: "hi",
      },
      {
        role: "assistant",
        content: null,
        thinking: {
          content: "Need to inspect the directory first.",
        },
        tool_calls: [
          {
            id: "call_inline",
            type: "function",
            function: {
              name: "Bash",
              arguments: "{\"command\":\"ls -la\"}",
            },
          },
        ],
      },
    ],
    reasoning: {
      effort: "high",
      enabled: true,
    },
    thinking: {
      type: "enabled",
    },
    enable_thinking: true,
  };

  const transformed = await transformer.transformRequestIn(
    request,
    provider as any,
    context as any
  );

  assert.equal(
    transformed.messages[1].reasoning_content,
    "Need to inspect the directory first."
  );
}

async function testCachedThinkingReplayAfterStream() {
  const transformer = new ReasoningTransformer();
  const initialContext = { req: {} };
  const initialRequest: UnifiedChatRequest = {
    model: "deepseek-v4-pro",
    stream: true,
    messages: [
      {
        role: "user",
        content: "what's in this folder",
      },
    ],
    reasoning: {
      effort: "high",
      enabled: true,
    },
    thinking: {
      type: "enabled",
    },
    enable_thinking: true,
  };

  await transformer.transformRequestIn(
    initialRequest,
    provider as any,
    initialContext as any
  );

  const streamedResponse = buildStreamResponse([
    {
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-v4-pro",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: null,
            reasoning_content: "Let",
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-v4-pro",
      choices: [
        {
          index: 0,
          delta: {
            content: null,
            reasoning_content: " me check",
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-v4-pro",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_cached",
                type: "function",
                function: {
                  name: "Bash",
                  arguments: "",
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-v4-pro",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: "{\"command\":\"ls -la\"}",
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
  ]);

  const transformedResponse = await transformer.transformResponseOut(
    streamedResponse,
    initialContext as any
  );
  await drainResponse(transformedResponse);

  const followupContext = { req: {} };
  const followupRequest: UnifiedChatRequest = {
    model: "deepseek-v4-pro",
    stream: false,
    messages: [
      {
        role: "user",
        content: "what's in this folder",
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_cached",
            type: "function",
            function: {
              name: "Bash",
              arguments: "{\"command\":\"ls -la\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_cached",
        content: "total 144",
      },
      {
        role: "user",
        content: "tell me more",
      },
    ],
    reasoning: {
      effort: "high",
      enabled: true,
    },
    thinking: {
      type: "enabled",
    },
    enable_thinking: true,
  };

  const transformedFollowup = await transformer.transformRequestIn(
    followupRequest,
    provider as any,
    followupContext as any
  );

  assert.equal(
    transformedFollowup.messages[1].reasoning_content,
    "Let me check"
  );
}

async function testNonDeepSeekReasoningDoesNotReplay() {
  const transformer = new ReasoningTransformer();
  const context = { req: {} };
  const request: UnifiedChatRequest = {
    model: "gpt-4.1",
    stream: false,
    messages: [
      {
        role: "user",
        content: "hi",
      },
      {
        role: "assistant",
        content: null,
        thinking: {
          content: "This should stay as generic thinking only.",
        },
        tool_calls: [
          {
            id: "call_generic",
            type: "function",
            function: {
              name: "Bash",
              arguments: "{\"command\":\"pwd\"}",
            },
          },
        ],
      },
    ],
    reasoning: {
      effort: "high",
      enabled: true,
    },
    thinking: {
      type: "enabled",
    },
    enable_thinking: true,
  };

  const transformed = await transformer.transformRequestIn(
    request,
    {
      name: "openai-compatible",
      baseUrl: "https://openai.test/v1/chat/completions",
    } as any,
    context as any
  );

  assert.equal(transformed.messages[1].reasoning_content, undefined);
}

async function main() {
  await testInlineThinkingReplay();
  await testCachedThinkingReplayAfterStream();
  await testNonDeepSeekReasoningDoesNotReplay();
  console.log("deepseek.reasoning: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
