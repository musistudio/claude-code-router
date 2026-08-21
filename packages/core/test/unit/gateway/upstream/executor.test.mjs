import assert from "node:assert/strict";
import test from "node:test";
import { stripUnsupportedOpenAiRequestParameters } from "@ccr/core/gateway/upstream/executor.ts";

function toJsonBuffer(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function parseOutput(buffer) {
  return JSON.parse(buffer.toString("utf8"));
}

test("strips Anthropic thinking and redacted_thinking content blocks from message history", () => {
  const body = {
    model: "claude-sonnet-5",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal reasoning" },
          { type: "text", text: "visible answer" }
        ]
      },
      {
        role: "user",
        content: [
          { type: "text", text: "continue" }
        ]
      },
      {
        role: "assistant",
        content: [
          { type: "redacted_thinking", data: "redacted" },
          { type: "tool_use", id: "t1", name: "x", input: {} }
        ]
      }
    ]
  };

  const output = parseOutput(stripUnsupportedOpenAiRequestParameters(toJsonBuffer(body)));
  assert.deepEqual(output.messages[0].content, [{ type: "text", text: "visible answer" }]);
  assert.deepEqual(output.messages[1].content, [{ type: "text", text: "continue" }]);
  assert.deepEqual(output.messages[2].content, [{ type: "tool_use", id: "t1", name: "x", input: {} }]);
  assert.equal(output.model, "claude-sonnet-5");
});

test("still removes top-level thinking and reasoning_split parameters", () => {
  const body = {
    thinking: { type: "enabled", budget_tokens: 1024 },
    reasoning_split: "disabled",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
  };

  const output = parseOutput(stripUnsupportedOpenAiRequestParameters(toJsonBuffer(body)));
  assert.equal("thinking" in output, false);
  assert.equal("reasoning_split" in output, false);
});

test("returns the original buffer unchanged when there is nothing to strip", () => {
  const body = {
    messages: [{ role: "user", content: "plain string content" }]
  };
  const input = toJsonBuffer(body);
  assert.equal(stripUnsupportedOpenAiRequestParameters(input), input);
});

test("leaves OpenAI-style string content untouched", () => {
  const body = {
    messages: [
      { role: "system", content: "you are a helper" },
      { role: "user", content: "hello" }
    ]
  };
  const output = parseOutput(stripUnsupportedOpenAiRequestParameters(toJsonBuffer(body)));
  assert.equal(output.messages[0].content, "you are a helper");
  assert.equal(output.messages[1].content, "hello");
});
