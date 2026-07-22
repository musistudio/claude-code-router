import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  codexCompactResponseStream
} from "../../packages/core/src/gateway/context-archive.ts";
import {
  prepareCodexApplyPatchBridgeRequest,
  prepareCodexCompactCompatRequest,
  transformCodexApplyPatchBridgeResponseValue,
  transformCodexApplyPatchBridgeSseEvent
} from "../../packages/core/src/gateway/service.ts";

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

test("Codex patch bridge rewrites apply_patch custom tool and prior output to virtual function items", () => {
  const patch = "*** Begin Patch\n*** Add File: foo.txt\n+hi\n*** End Patch\n";
  const result = prepareCodexApplyPatchBridgeRequest({
    body: Buffer.from(JSON.stringify({
      model: "openrouter/google/gemini-2.5-pro",
      tools: [
        { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } }
      ],
      input: [
        { type: "custom_tool_call", call_id: "call_patch", name: "apply_patch", input: patch },
        { type: "custom_tool_call_output", call_id: "call_patch", output: "Success" }
      ]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.equal(body.tools[0].type, "function");
  assert.equal(body.tools[0].name, "virtual_apply_patch");
  assert.equal(body.input[0].type, "function_call");
  assert.equal(body.input[0].name, "virtual_apply_patch");
  assert.deepEqual(JSON.parse(body.input[0].arguments), { patch });
  assert.equal(body.input[1].type, "function_call_output");
});

test("Codex patch bridge leaves GPT models untouched", () => {
  const result = prepareCodexApplyPatchBridgeRequest({
    body: Buffer.from(JSON.stringify({
      model: "openai/gpt-5-codex",
      tools: [{ type: "custom", name: "apply_patch" }]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });

  assert.equal(result, undefined);
});

test("Codex patch bridge skips compaction requests", () => {
  const endpointResult = prepareCodexApplyPatchBridgeRequest({
    body: Buffer.from(JSON.stringify({
      input: [{ content: [{ text: "Compact history.", type: "input_text" }], role: "user", type: "message" }],
      model: "openrouter/google/gemini-2.5-pro",
      tools: [{ type: "custom", name: "apply_patch" }]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses/compact"
  });
  assert.equal(endpointResult, undefined);

  const triggerResult = prepareCodexApplyPatchBridgeRequest({
    body: Buffer.from(JSON.stringify({
      input: [{ type: "compaction_trigger" }],
      model: "openrouter/google/gemini-2.5-pro",
      tools: [{ type: "custom", name: "apply_patch" }]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });
  assert.equal(triggerResult, undefined);
});

test("Codex compact compat rewrites compact endpoint without context archive", async () => {
  const result = prepareCodexCompactCompatRequest({
    body: Buffer.from(JSON.stringify({
      input: [
        { content: [{ text: "Need to remember ISSUE-1776.", type: "input_text" }], role: "user", type: "message" }
      ],
      model: "gpt-5-codex",
      parallel_tool_calls: true,
      tools: [{ name: "apply_patch", type: "custom" }]
    })),
    method: "POST",
    path: "/v1/responses/compact",
    protocol: "openai_responses"
  });

  assert.ok(result);
  assert.equal(result.upstreamPath, "/v1/responses");
  assert.equal(result.responseMode, "codex_responses_compact_json");
  assert.equal(result.responseContentType, "application/json; charset=utf-8");
  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.parallel_tool_calls, undefined);
  assert.match(forwarded.input.at(-1).content[0].text, /compact continuation summary/);

  const transformed = await streamText(codexCompactResponseStream(
    Readable.from([JSON.stringify({ output: [{ content: [{ text: "Compat summary", type: "output_text" }], role: "assistant", type: "message" }] })]),
    "openai_responses",
    "application/json",
    result.responseMode
  ));
  const compact = JSON.parse(transformed);
  assert.equal(compact.output[0].type, "compaction");
  assert.equal(compact.output[0].encrypted_content, "Compat summary");
  assert.doesNotMatch(compact.output[0].encrypted_content, /CCR ARCHIVED HISTORY ACCESS/);
});

test("Codex compact compat rewrites compaction trigger without context archive", async () => {
  const result = prepareCodexCompactCompatRequest({
    body: Buffer.from(JSON.stringify({
      input: [
        { content: [{ text: "Need to remember TASK-4242.", type: "input_text" }], role: "user", type: "message" },
        { type: "compaction_trigger" }
      ],
      model: "gpt-5-codex",
      stream: true,
      tools: [{ name: "apply_patch", type: "custom" }]
    })),
    method: "POST",
    path: "/v1/responses",
    protocol: "openai_responses"
  });

  assert.ok(result);
  assert.equal(result.upstreamPath, undefined);
  assert.equal(result.responseMode, "codex_responses_compaction_sse");
  assert.equal(result.responseContentType, "text/event-stream; charset=utf-8");
  const forwarded = JSON.parse(result.body.toString("utf8"));
  assert.equal(forwarded.tools, undefined);
  assert.equal(forwarded.input.some((item) => item.type === "compaction_trigger"), false);
  assert.match(forwarded.input.at(-1).content[0].text, /compact continuation summary/);

  const upstreamSse = [
    "event: response.output_text.delta",
    'data: {"type":"response.output_text.delta","delta":"Trigger summary","output_index":0,"content_index":0,"item_id":"msg_1"}',
    "",
    "event: response.completed",
    'data: {"type":"response.completed","response":{"id":"resp_upstream"}}',
    ""
  ].join("\n");
  const transformed = await streamText(codexCompactResponseStream(
    Readable.from([upstreamSse]),
    "openai_responses",
    "text/event-stream",
    result.responseMode
  ));
  assert.match(transformed, /event: response.output_item.done/);
  assert.match(transformed, /"type":"compaction"/);
  assert.match(transformed, /Trigger summary/);
  assert.doesNotMatch(transformed, /CCR ARCHIVED HISTORY ACCESS/);
});

test("Codex patch bridge discourages shell-based file edits", () => {
  const result = prepareCodexApplyPatchBridgeRequest({
    body: Buffer.from(JSON.stringify({
      model: "provider-deepseek::openai_chat_completions/deepseek-v4-flash",
      instructions: "You are Codex, a coding agent.",
      tools: [
        {
          type: "function",
          name: "exec_command",
          description: "Runs a command.",
          parameters: {
            type: "object",
            properties: {
              cmd: { type: "string", description: "Shell command to execute." }
            }
          }
        },
        { type: "function", name: "write_stdin", description: "Writes to a running session." },
        { type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } }
      ]
    })),
    config,
    headers: { "user-agent": "codex-test" },
    method: "POST",
    path: "/v1/responses"
  });

  assert.ok(result);
  const body = JSON.parse(result.body.toString("utf8"));
  assert.match(body.instructions, /When modifying files, call virtual_apply_patch/);
  const execCommand = body.tools.find((tool) => tool.name === "exec_command");
  const writeStdin = body.tools.find((tool) => tool.name === "write_stdin");
  assert.match(execCommand.description, /do not use this tool to edit files/i);
  assert.match(execCommand.parameters.properties.cmd.description, /cat >, tee, sed -i/);
  assert.match(writeStdin.description, /Use virtual_apply_patch for manual file changes/);
  const virtualApplyPatch = body.tools.find((tool) => tool.name === "virtual_apply_patch");
  assert.equal(virtualApplyPatch?.type, "function");
  assert.match(virtualApplyPatch.description, /The patch field must match this Lark grammar:/);
  assert.match(virtualApplyPatch.description, /start: begin_patch hunk\+ end_patch/);
  assert.match(virtualApplyPatch.description, /%import common\.LF/);
  assert.match(virtualApplyPatch.parameters.properties.patch.description, /update_hunk: "\*\*\* Update File: " filename LF change_move\? change\?/);
});

test("Codex patch bridge rewrites virtual function response items to apply_patch custom tool calls", () => {
  const patch = "*** Begin Patch\n*** Add File: foo.txt\n+hi\n*** End Patch\n";
  const result = transformCodexApplyPatchBridgeResponseValue({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: "call_patch",
      name: "virtual_apply_patch",
      arguments: JSON.stringify({ patch })
    }
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.value.item, {
    type: "custom_tool_call",
    call_id: "call_patch",
    name: "apply_patch",
    input: patch
  });
});

test("Codex patch bridge rewrites virtual function SSE events", () => {
  const patch = "*** Begin Patch\n*** Add File: foo.txt\n+hi\n*** End Patch\n";
  const event = transformCodexApplyPatchBridgeSseEvent([
    "event: response.output_item.done",
    `data: ${JSON.stringify({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_patch",
        name: "virtual_apply_patch",
        arguments: JSON.stringify({ patch })
      }
    })}`
  ].join("\n"));

  assert.match(event, /^event: response\.output_item\.done\n/);
  const data = JSON.parse(event.split("\ndata: ")[1]);
  assert.equal(data.item.type, "custom_tool_call");
  assert.equal(data.item.name, "apply_patch");
  assert.equal(data.item.input, patch);
});

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
