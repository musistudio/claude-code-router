import assert from "node:assert/strict";
import test from "node:test";
import { translateBodyForProtocol } from "@ccr/core/gateway/upstream/body-translate.ts";

function toJsonBuffer(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function parseOutput(buffer) {
  return JSON.parse(buffer.toString("utf8"));
}

test("translates Anthropic messages -> OpenAI chat completions", () => {
  const anthropic = {
    model: "claude-sonnet-5",
    system: "You are a helpful assistant.",
    messages: [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me look" },
          { type: "tool_use", id: "t1", name: "search", input: { q: "x" } }
        ]
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "results" }] }
    ],
    max_tokens: 4096,
    temperature: 0.5,
    stop_sequences: ["\n\n"],
    tools: [{ name: "search", description: "Search the web", input_schema: { type: "object", properties: { q: { type: "string" } } } }],
    stream: true
  };

  const out = parseOutput(translateBodyForProtocol(toJsonBuffer(anthropic), "anthropic_messages", "openai_chat_completions"));

  assert.equal(out.model, "claude-sonnet-5");
  assert.deepEqual(out.messages[0], { role: "system", content: "You are a helpful assistant." });
  assert.deepEqual(out.messages[1], { role: "user", content: "hi" });
  assert.equal(out.messages[2].role, "assistant");
  assert.equal(out.messages[2].content, "let me look");
  assert.deepEqual(out.messages[2].tool_calls, [
    { id: "t1", type: "function", function: { name: "search", arguments: JSON.stringify({ q: "x" }) } }
  ]);
  assert.deepEqual(out.messages[3], { role: "tool", tool_call_id: "t1", content: "results" });
  assert.deepEqual(out.stop, ["\n\n"]);
  assert.deepEqual(out.tools, [
    { type: "function", function: { name: "search", description: "Search the web", parameters: { type: "object", properties: { q: { type: "string" } } } } }
  ]);
  assert.equal(out.max_tokens, 4096);
  assert.equal(out.temperature, 0.5);
  assert.equal(out.stream, true);
});

test("translates OpenAI chat completions -> Anthropic messages", () => {
  const openAi = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "let me look",
        tool_calls: [{ id: "t1", type: "function", function: { name: "search", arguments: JSON.stringify({ q: "x" }) } }]
      },
      { role: "tool", tool_call_id: "t1", content: "results" }
    ],
    max_tokens: 4096,
    temperature: 0.5,
    stop: ["\n\n"],
    tools: [{ type: "function", function: { name: "search", description: "Search the web", parameters: { type: "object", properties: { q: { type: "string" } } } } }],
    stream: true
  };

  const out = parseOutput(translateBodyForProtocol(toJsonBuffer(openAi), "openai_chat_completions", "anthropic_messages"));

  assert.equal(out.model, "gpt-4o");
  assert.equal(out.system, "You are a helpful assistant.");
  assert.deepEqual(out.messages[0], { role: "user", content: [{ type: "text", text: "hi" }] });
  assert.equal(out.messages[1].role, "assistant");
  assert.deepEqual(out.messages[1].content, [{ type: "text", text: "let me look" }, { type: "tool_use", id: "t1", name: "search", input: { q: "x" } }]);
  assert.deepEqual(out.messages[2], { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "results" }] });
  assert.deepEqual(out.stop_sequences, ["\n\n"]);
  assert.deepEqual(out.tools, [
    { name: "search", description: "Search the web", input_schema: { type: "object", properties: { q: { type: "string" } } } }
  ]);
});

test("returns the original body when protocols match", () => {
  const body = toJsonBuffer({ model: "x", messages: [{ role: "user", content: "hi" }] });
  assert.equal(translateBodyForProtocol(body, "anthropic_messages", "anthropic_messages"), body);
});

test("returns the original body for unsupported protocol pairs", () => {
  const body = toJsonBuffer({ model: "x", messages: [] });
  assert.equal(translateBodyForProtocol(body, "anthropic_messages", "gemini_generate_content"), body);
});

test("returns the original body when either protocol is missing", () => {
  const body = toJsonBuffer({ model: "x", messages: [] });
  assert.equal(translateBodyForProtocol(body, "anthropic_messages", undefined), body);
  assert.equal(translateBodyForProtocol(body, undefined, "openai_chat_completions"), body);
});

test("preserves incidental fields (stream_options) through Anthropic -> OpenAI translation", () => {
  const body = {
    model: "deepseek-v4-flash",
    messages: [],
    stream: true,
    stream_options: { extra_flag: "keep" }
  };
  const out = parseOutput(translateBodyForProtocol(toJsonBuffer(body), "anthropic_messages", "openai_chat_completions"));
  assert.deepEqual(out.stream_options, { extra_flag: "keep" });
  assert.deepEqual(out.messages, []);
  assert.equal(out.stream, true);
  assert.equal(out.model, "deepseek-v4-flash");
});
