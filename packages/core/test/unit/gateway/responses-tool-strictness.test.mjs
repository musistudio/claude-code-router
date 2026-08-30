import assert from "node:assert/strict";
import test from "node:test";
import { applyResponsesToolStrictness } from "@ccr/core/gateway/core-runtime/responses-tool-strictness.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

function monitorTool(overrides = {}) {
  return {
    type: "function",
    name: "Monitor",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["description", "timeout_ms", "persistent"],
      properties: {
        command: { type: "string" },
        description: { type: "string" },
        persistent: { type: "boolean" },
        timeout_ms: { type: "number" },
        ws: { type: "object" }
      }
    },
    ...overrides
  };
}

function readTool(overrides = {}) {
  return {
    type: "function",
    name: "Read",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["file_path"],
      properties: {
        file_path: { type: "string" },
        pages: { type: "string" }
      }
    },
    ...overrides
  };
}

function responsesInput(overrides = {}) {
  return {
    sourceAdapterKey: "anthropic_messages",
    sourceProvider: "anthropic",
    targetProviderConfig: {
      name: "multi-channel::openai_responses",
      type: "openai_responses"
    },
    upstreamRequest: {
      body: {
        input: [],
        model: "gpt-5.1-codex",
        stream: true,
        tools: [monitorTool()]
      },
      bodyEncoding: "json",
      headers: { "content-type": "application/json" },
      method: "POST",
      url: "https://provider.example/v1/responses"
    },
    ...overrides
  };
}

test("omitted strict on a Monitor-shaped tool becomes false", () => {
  const input = responsesInput();
  const originalTool = input.upstreamRequest.body.tools[0];

  const result = applyResponsesToolStrictness(input);

  assert.equal(result.body.tools[0].strict, false);
  assert.equal(originalTool.strict, undefined);
  assert.notEqual(result, input.upstreamRequest);
  assert.notEqual(result.body, input.upstreamRequest.body);
  assert.notEqual(result.body.tools, input.upstreamRequest.body.tools);
});

test("omitted strict on a Read-shaped tool becomes false", () => {
  const input = responsesInput();
  input.upstreamRequest.body.tools = [readTool()];

  const result = applyResponsesToolStrictness(input);

  assert.equal(result.body.tools[0].strict, false);
  assert.equal(result.body.tools[0].name, "Read");
});

test("explicit strict true and false are unchanged", () => {
  const input = responsesInput();
  input.upstreamRequest.body.tools = [monitorTool({ strict: true }), readTool({ strict: false })];

  const result = applyResponsesToolStrictness(input);

  assert.equal(result, input.upstreamRequest);
  assert.equal(result.body.tools[0].strict, true);
  assert.equal(result.body.tools[1].strict, false);
});

test("namespace nested function tools with omitted strict become false", () => {
  const nested = monitorTool();
  const input = responsesInput();
  input.upstreamRequest.body.tools = [{
    type: "namespace",
    name: "local",
    tools: [nested]
  }];

  const result = applyResponsesToolStrictness(input);

  assert.equal(result.body.tools[0].tools[0].strict, false);
  assert.equal(nested.strict, undefined);
  assert.equal(result.body.tools[0].name, "local");
});

test("non-function tools are left untouched", () => {
  const searchTool = { type: "tool_search", execution: "client", parameters: { type: "object" } };
  const input = responsesInput();
  input.upstreamRequest.body.tools = [searchTool];

  const result = applyResponsesToolStrictness(input);

  assert.equal(result, input.upstreamRequest);
  assert.equal("strict" in result.body.tools[0], false);
});

test("non-Responses providers and non-JSON bodies pass through untouched", () => {
  const chatInput = responsesInput({
    targetProviderConfig: { type: "openai_chat_completions" }
  });
  assert.equal(applyResponsesToolStrictness(chatInput), chatInput.upstreamRequest);

  const bytesInput = responsesInput();
  bytesInput.upstreamRequest = {
    ...bytesInput.upstreamRequest,
    body: Buffer.from("{}"),
    bodyEncoding: "bytes"
  };
  assert.equal(applyResponsesToolStrictness(bytesInput), bytesInput.upstreamRequest);
});

test("requests without tools pass through untouched", () => {
  const input = responsesInput();
  delete input.upstreamRequest.body.tools;

  const result = applyResponsesToolStrictness(input);

  assert.equal(result, input.upstreamRequest);
});

test("native Responses requests leave omitted strict unchanged", () => {
  const tool = monitorTool();
  const body = {
    input: [],
    model: "gpt-5.1-codex",
    stream: true,
    tools: [tool]
  };

  const input = responsesInput({
    sourceAdapterKey: undefined,
    sourceProvider: undefined,
    request: {
      body,
      headers: { "content-type": "application/json" }
    },
    upstreamRequest: {
      body,
      bodyEncoding: "json",
      headers: { "content-type": "application/json" },
      method: "POST",
      url: "https://provider.example/v1/responses"
    }
  });

  const result = applyResponsesToolStrictness(input);

  assert.equal(result, input.upstreamRequest);
  assert.equal(result.body.tools[0].strict, undefined);
});

test("Chat Completions conversions leave omitted strict unchanged", () => {
  const input = responsesInput({
    sourceAdapterKey: "openai_chat",
    sourceProvider: "openai"
  });

  const result = applyResponsesToolStrictness(input);

  assert.equal(result, input.upstreamRequest);
  assert.equal(result.body.tools[0].strict, undefined);
});

test("gateway boundary plugin registers the tool strictness hook", async () => {
  const hooks = createGatewayPlugin().providerHooks;
  assert.equal(hooks[0].key, "ccr-upstream-header-sanitizer");
  assert.ok(hooks.some((hook) => hook.key === "ccr-responses-session-affinity"));
  const strictnessHook = hooks.find((hook) => hook.key === "ccr-responses-tool-strictness");
  assert.ok(strictnessHook);

  const input = responsesInput();
  const result = await strictnessHook.transformRequest(input);

  assert.equal(result.ok, true);
  assert.equal(result.value.body.tools[0].strict, false);
});
