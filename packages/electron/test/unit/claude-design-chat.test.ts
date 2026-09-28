import assert from "node:assert/strict";
import path from "node:path";
import { Writable } from "node:stream";
import test, { type TestContext } from "node:test";

const previousTestExports = process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS;
process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS = "1";
const plugin = require(path.resolve("packages/electron/bundled-plugins/claude-design/index.cjs"));
if (previousTestExports === undefined) {
  delete process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS;
} else {
  process.env.CCR_CLAUDE_DESIGN_PLUGIN_TEST_EXPORTS = previousTestExports;
}

const messages = [{ role: "user", content: "Create a dashboard." }];
const instructions = "Ask about visual preferences with questions_v2 before building, then wait for the user's answer.";
const questionTool = {
  name: "questions_v2",
  description: "Ask the user to choose a visual style before creating files.",
  input_schema: {
    type: "object",
    properties: { title: { type: "string" }, questions: { type: "array", items: { type: "object" } } },
    required: ["title", "questions"]
  }
};

for (const [name, context] of Object.entries({
  "top-level system text": { system: instructions },
  "top-level system blocks": { system: [{ type: "text", text: instructions, cache_control: { type: "ephemeral" } }] },
  "system messages": { messages: [{ role: "system", content: instructions }, ...messages] },
  "native tools without a system prompt": { tools: [questionTool] }
})) {
  test(`Claude Design preserves ${name} without injecting file-generation instructions`, async (t) => {
    const body = { model: "provider/model", messages, ...context };
    const original = structuredClone(body);
    const { forwarded, result } = await chat(t, body);

    assert.equal(result.status, 200);
    assert.deepEqual(forwarded.messages, body.messages);
    assert.deepEqual(forwarded.system, "system" in body ? body.system : undefined);
    assert.deepEqual(forwarded.tools, "tools" in body ? body.tools : undefined);
    assert.deepEqual(body, original);
  });
}

test("Claude Design forwards streamed style questions and ends the turn for user input", async (t) => {
  const question = {
    title: "Choose a visual style",
    questions: [{ id: "style", kind: "text-options", title: "Which style?", options: ["Minimal", "Colorful", "Decide for me"] }]
  };
  const input = JSON.stringify(question);
  const events = [
    { type: "message_start", message: { id: "assistant-question", role: "assistant", model: "provider/model", content: [] } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-question", name: "questions_v2", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: input.slice(0, 30) } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: input.slice(30) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
    { type: "message_stop" }
  ];
  const upstream = new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }
  }), { headers: { "content-type": "text/event-stream" } });
  const body = { model: "provider/model", system: instructions, messages, tools: [questionTool] };
  const { forwarded, result, requests } = await chat(t, body, upstream);
  assert.deepEqual(forwarded.system, instructions);
  assert.deepEqual(forwarded.messages, messages);
  assert.deepEqual(forwarded.tools, [questionTool]);

  const chunks: Buffer[] = [];
  await result.stream(new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  }));
  const frames = readFrames(Buffer.concat(chunks));
  const rawEvents = frames.flatMap((frame) => {
    if (frame.flags !== 0) return [];
    const raw = readFields(frame.body).get(6);
    if (!raw) return [];
    const fields = readFields(raw);
    return [{ type: fields.get(1)?.toString(), payload: JSON.parse(fields.get(2)!.toString()) }];
  });
  const tools = rawEvents.filter((event) => event.type === "tool_block_complete");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].payload.name, "questions_v2");
  assert.deepEqual(tools[0].payload.input, question);
  assert.equal(rawEvents.find((event) => event.type === "done")?.payload.message.stop_reason, "tool_use");
  assert.equal(requests.length, 1, "the plugin must wait for the user instead of generating another response");
  assert.equal(frames.at(-1)?.flags, 2, "Connect stream must include an end frame");
});

test("Claude Design keeps a clarification-friendly fallback for simple requests", async (t) => {
  const { forwarded } = await chat(t, { messages, system: "", tools: [] });
  assert.equal(forwarded.messages.length, 2);
  assert.equal(forwarded.messages[0].role, "system");
  assert.match(forwarded.messages[0].content, /local CCR project workspace/);
  assert.match(forwarded.messages[0].content, /ask the user before creating files/i);
  assert.doesNotMatch(forwarded.messages[0].content, /Do not only ask clarifying questions/);
  assert.deepEqual(forwarded.messages[1], messages[0]);
});

async function chat(t: TestContext, body: object, upstream = new Response(JSON.stringify({
  id: "assistant-test", role: "assistant", content: [{ type: "text", text: "OK" }], stop_reason: "end_turn"
}), { headers: { "content-type": "application/json" } })) {
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(String(url), "http://gateway.test/v1/messages");
    requests.push(JSON.parse(String(options.body)));
    return upstream;
  });
  const payload = field(2, Buffer.from(JSON.stringify(body)));
  const envelope = Buffer.alloc(5);
  envelope.writeUInt32BE(payload.length, 1);
  const result = await plugin.__test.routeMockRequest(
    {
      gatewayUrl: "http://gateway.test",
      me: { defaultModelId: "provider/model" },
      routing: { enabled: false },
      store: { database: { prepare: () => ({ bind() {}, step: () => false, free() {} }) } }
    },
    "POST",
    new URL("http://design.test/design/anthropic.omelette.api.v1alpha.OmeletteService/Chat"),
    { headers: { "content-type": "application/connect+proto" } },
    Buffer.concat([envelope, payload])
  );
  assert.equal(requests.length, 1);
  return { forwarded: requests[0], result, requests };
}

function field(number: number, bytes: Buffer): Buffer {
  return Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
}

function varint(value: number): Buffer {
  const bytes = [];
  while (value > 127) {
    bytes.push((value & 127) | 128);
    value >>>= 7;
  }
  return Buffer.from([...bytes, value]);
}

function readFields(buffer: Buffer): Map<number, Buffer> {
  const fields = new Map<number, Buffer>();
  let offset = 0;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = buffer[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
  };
  while (offset < buffer.length) {
    const tag = readVarint();
    if ((tag & 7) === 0) {
      readVarint();
    } else {
      assert.equal(tag & 7, 2);
      const length = readVarint();
      fields.set(tag >>> 3, buffer.subarray(offset, offset + length));
      offset += length;
    }
  }
  return fields;
}

function readFrames(buffer: Buffer): Array<{ flags: number; body: Buffer }> {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset + 1);
    frames.push({ flags: buffer[offset], body: buffer.subarray(offset + 5, offset + 5 + length) });
    offset += 5 + length;
  }
  return frames;
}
