import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareCodexMultiAgentBridgeRequest,
  transformCodexMultiAgentBridgeResponseValue,
  transformCodexMultiAgentBridgeSseEvent
} from "@ccr/core/gateway/service.ts";

const config = {
  Providers: [],
  Router: {
    builtInRules: {
      "claude-code": { enabled: true },
      codex: { enabled: true }
    },
    fallback: { mode: "off", models: [], retryCount: 1 },
    rules: []
  }
};

function multiAgentNamespaceTool() {
  return {
    type: "namespace",
    name: "multi_agent_v1",
    description: "Tools for spawning and managing sub-agents.",
    tools: [
      {
        type: "function",
        name: "spawn_agent",
        description: "Spawn a sub-agent.",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            message: { type: "string" },
            model: { type: "string" }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "wait_agent",
        description: "Wait for agents.",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            targets: { type: "array", items: { type: "string" } }
          },
          required: ["targets"],
          additionalProperties: false
        }
      }
    ]
  };
}

test("Codex multi-agent bridge expands namespace tools for non-GPT models", () => {
  const result = prepareCodexMultiAgentBridgeRequest({
    body: Buffer.from(JSON.stringify({
      input: [
        {
          arguments: JSON.stringify({ message: "inspect tests" }),
          call_id: "call_agent",
          name: "spawn_agent",
          namespace: "multi_agent_v1",
          type: "function_call"
        }
      ],
      model: "Provider/claude-sonnet",
      parallel_tool_calls: true,
      tool_choice: { type: "tool", name: "multi_agent_v1" },
      tools: [
        { type: "function", name: "exec_command" },
        multiAgentNamespaceTool()
      ]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.deepEqual(
    body.tools.map((tool) => `${tool.type}:${tool.name}`),
    ["function:exec_command", "function:multi_agent_v1_spawn_agent", "function:multi_agent_v1_wait_agent"]
  );
  assert.match(body.tools[1].description, /multi_agent_v1\.spawn_agent/);
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.parallel_tool_calls, true);
  assert.equal(body.input[0].name, "multi_agent_v1_spawn_agent");
  assert.equal(body.input[0].namespace, undefined);
});

test("Codex multi-agent bridge leaves GPT models untouched", () => {
  const result = prepareCodexMultiAgentBridgeRequest({
    body: Buffer.from(JSON.stringify({
      model: "openai/gpt-5-codex",
      tools: [multiAgentNamespaceTool()]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });

  assert.equal(result, undefined);
});

test("Codex multi-agent bridge rewrites flattened function response items to namespace calls", () => {
  const result = transformCodexMultiAgentBridgeResponseValue({
    type: "response.output_item.done",
    item: {
      arguments: JSON.stringify({ message: "inspect tests" }),
      call_id: "call_agent",
      name: "multi_agent_v1_spawn_agent",
      type: "function_call"
    }
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.value.item, {
    arguments: JSON.stringify({ message: "inspect tests" }),
    call_id: "call_agent",
    name: "spawn_agent",
    namespace: "multi_agent_v1",
    type: "function_call"
  });
});

test("Codex multi-agent bridge rewrites flattened function SSE events", () => {
  const event = transformCodexMultiAgentBridgeSseEvent([
    "event: response.output_item.done",
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      item: {
        arguments: JSON.stringify({ targets: ["agent-1"] }),
        call_id: "call_wait",
        name: "multi_agent_v1_wait_agent",
        type: "function_call"
      }
    })}`
  ].join("\n"));

  assert.match(event, /^event: response\.output_item\.done\n/);
  const data = JSON.parse(event.split("\ndata: ")[1]);
  assert.equal(data.item.type, "function_call");
  assert.equal(data.item.name, "wait_agent");
  assert.equal(data.item.namespace, "multi_agent_v1");
});
