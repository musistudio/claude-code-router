import assert from "node:assert/strict";
import test from "node:test";
import { prepareDeepSeekRequestAdapter } from "@ccr/core/gateway/features/deepseek-request-adapter.ts";

const config = {};

function call(body, routedModel) {
  return prepareDeepSeekRequestAdapter({
    body: Buffer.from(JSON.stringify(body)),
    config,
    headers: {},
    method: "POST",
    path: "/v1/messages",
    routedModel
  });
}

function assistantWithToolUse() {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "let me check" },
      { type: "tool_use", id: "tool_1", name: "exec", input: {} }
    ]
  };
}

test("DeepSeek adapter preserves a client-sent reasoning_effort through a reserialize", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 65536,
      reasoning_effort: "xhigh",
      messages: [{ role: "user", content: "hi" }, assistantWithToolUse()]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  // Thinking stays on, so effort survives the reserialize.
  assert.equal(body.reasoning_effort, "xhigh");
});

test("DeepSeek adapter disables thinking below the max_tokens threshold", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      reasoning_effort: "high",
      messages: [{ role: "user", content: "hi" }]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.enable_thinking, false);
  // Disabling thinking drops the contradictory effort.
  assert.equal(body.reasoning_effort, undefined);
});

test("DeepSeek adapter treats missing max_tokens as below-threshold", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      reasoning_effort: "low",
      messages: [{ role: "user", content: "hi" }]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.reasoning_effort, undefined);
});

test("DeepSeek adapter injects a thinking content block before a tool_use assistant message", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 65536,
      messages: [{ role: "user", content: "hi" }, assistantWithToolUse()]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  const assistant = body.messages[1];
  assert.equal(assistant.content[0].type, "thinking");
  assert.equal(assistant.content[0].thinking, "(elided)");
  assert.equal(assistant.content[0].signature, "ccr-deepseek-adapter");
  // The tool_use block is preserved after the injected placeholder.
  assert.equal(assistant.content[1].type, "text");
  assert.equal(assistant.content[2].type, "tool_use");
});

test("DeepSeek adapter does not inject placeholder into an assistant message without tool_use", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 65536,
      messages: [
        { role: "assistant", content: [{ type: "text", text: "plain answer" }] },
        { role: "user", content: "next" }
      ]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.equal(result, undefined);
});

test("DeepSeek adapter does not inject placeholder when thinking is disabled", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hi" }, assistantWithToolUse()]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(body.thinking, { type: "disabled" });
  // No placeholder injected - no contradictory pair.
  assert.equal(body.messages[1].content[0].type, "text");
});

test("DeepSeek adapter adapts OpenRouter-hosted DeepSeek selectors", () => {
  const result = call(
    {
      model: "deepseek/deepseek-v4-flash-0731",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hi" }]
    },
    "deepseek/deepseek-v4-flash-0731"
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("DeepSeek adapter adapts a DeepSeek body.model even when routedModel is absent", () => {
  // Default routing may leave routedModel undefined; the body.model must still
  // gate the adapter (finding: the old split gate missed this case).
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hi" }]
    },
    undefined
  );

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("DeepSeek adapter leaves non-DeepSeek routes untouched", () => {
  const result = call(
    {
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hi" }]
    },
    "anthropic/claude-sonnet-4-5"
  );

  assert.equal(result, undefined);
});

test("DeepSeek adapter returns undefined when nothing needs changing", () => {
  const result = call(
    {
      model: "deepseek-v4-flash",
      max_tokens: 65536,
      messages: [{ role: "user", content: "hi" }]
    },
    "deepseek/deepseek-v4-flash"
  );

  assert.equal(result, undefined);
});
