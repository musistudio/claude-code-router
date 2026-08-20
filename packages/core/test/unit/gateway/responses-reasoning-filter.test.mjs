import assert from "node:assert/strict";
import test from "node:test";
import {
  dropNonReplayableReasoningItems,
  isReplayableResponsesInputItem
} from "@ccr/core/gateway/core-runtime/responses-reasoning-filter.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

function thinkingDerivedReasoningItem(index = 0) {
  return {
    content: [{ text: `internal reasoning ${index}`, type: "reasoning_text" }],
    id: `rs_fabricated-${index}`,
    summary: [],
    type: "reasoning"
  };
}

function encryptedReasoningItem() {
  return {
    encrypted_content: "gAAAAABo-encrypted-reasoning-payload",
    id: "rs_0123456789abcdef",
    summary: [],
    type: "reasoning"
  };
}

function responsesInput(inputItems, overrides = {}) {
  return {
    targetProviderConfig: {
      name: "codex::openai_responses",
      type: "openai_responses"
    },
    upstreamRequest: {
      body: {
        input: inputItems,
        instructions: "system prompt",
        model: "gpt-5.1-codex",
        stream: true
      },
      bodyEncoding: "json",
      headers: { "content-type": "application/json" },
      method: "POST",
      url: "https://provider.example/v1/responses"
    },
    ...overrides
  };
}

test("thinking-derived reasoning items without encrypted_content are dropped", () => {
  const input = responsesInput([
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
    thinkingDerivedReasoningItem(0),
    { content: [{ text: "answer", type: "output_text" }], role: "assistant", type: "message" }
  ]);

  const result = dropNonReplayableReasoningItems(input);

  assert.deepEqual(result.body.input.map((item) => item.type), ["message", "message"]);
  assert.equal(result.body.model, "gpt-5.1-codex");
  assert.equal(input.upstreamRequest.body.input.length, 3);
});

test("reasoning items with encrypted_content round-trip untouched", () => {
  const encrypted = encryptedReasoningItem();
  const input = responsesInput([
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
    encrypted
  ]);

  const result = dropNonReplayableReasoningItems(input);

  assert.equal(result, input.upstreamRequest);
  assert.deepEqual(result.body.input[1], encrypted);
});

test("mixed input arrays keep every non-reasoning item and only replayable reasoning", () => {
  const encrypted = encryptedReasoningItem();
  const input = responsesInput([
    thinkingDerivedReasoningItem(0),
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
    encrypted,
    { arguments: "{}", call_id: "call_1", name: "get_time", type: "function_call" },
    { call_id: "call_1", output: "12:00", type: "function_call_output" },
    thinkingDerivedReasoningItem(1)
  ]);

  const result = dropNonReplayableReasoningItems(input);

  assert.deepEqual(result.body.input, [
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" },
    encrypted,
    { arguments: "{}", call_id: "call_1", name: "get_time", type: "function_call" },
    { call_id: "call_1", output: "12:00", type: "function_call_output" }
  ]);
});

test("empty and missing encrypted_content are both treated as non-replayable", () => {
  assert.equal(isReplayableResponsesInputItem(thinkingDerivedReasoningItem()), false);
  assert.equal(isReplayableResponsesInputItem({ encrypted_content: "", id: "rs_1", type: "reasoning" }), false);
  assert.equal(isReplayableResponsesInputItem({ encrypted_content: "   ", id: "rs_1", type: "reasoning" }), false);
  assert.equal(isReplayableResponsesInputItem({ encrypted_content: null, id: "rs_1", type: "reasoning" }), false);
  assert.equal(isReplayableResponsesInputItem(encryptedReasoningItem()), true);
  assert.equal(isReplayableResponsesInputItem({ role: "user", type: "message" }), true);
  assert.equal(isReplayableResponsesInputItem("plain string item"), true);
});

test("non-Responses providers pass through untouched", () => {
  const input = responsesInput([thinkingDerivedReasoningItem()], {
    targetProviderConfig: { type: "openai_chat_completions" }
  });

  assert.equal(dropNonReplayableReasoningItems(input), input.upstreamRequest);
  assert.equal(input.upstreamRequest.body.input.length, 1);
});

test("non-JSON bodies pass through untouched", () => {
  const input = responsesInput([thinkingDerivedReasoningItem()]);
  input.upstreamRequest = {
    ...input.upstreamRequest,
    body: Buffer.from("{}"),
    bodyEncoding: "bytes"
  };

  assert.equal(dropNonReplayableReasoningItems(input), input.upstreamRequest);
});

test("bodies without an input array pass through untouched", () => {
  const stringInput = responsesInput([]);
  stringInput.upstreamRequest.body = { input: "plain prompt", model: "gpt-5.1-codex" };
  assert.equal(dropNonReplayableReasoningItems(stringInput), stringInput.upstreamRequest);

  const missingInput = responsesInput([]);
  delete missingInput.upstreamRequest.body.input;
  assert.equal(dropNonReplayableReasoningItems(missingInput), missingInput.upstreamRequest);
});

test("gateway boundary plugin registers the reasoning filter hook", async () => {
  const hooks = createGatewayPlugin().providerHooks;
  const filterHook = hooks.find((hook) => hook.key === "ccr-responses-reasoning-filter");
  assert.ok(filterHook);

  const input = responsesInput([
    thinkingDerivedReasoningItem(0),
    { content: [{ text: "hello", type: "input_text" }], role: "user", type: "message" }
  ]);
  const result = await filterHook.transformRequest(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.body.input.map((item) => item.type), ["message"]);
});
