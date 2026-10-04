import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import {
  prepareAnthropicToolUseIdRequest,
  sanitizeAnthropicToolUseIdResponseStream,
  sanitizeAnthropicToolUseIdSseBlockForTest,
  sanitizeAnthropicToolUseIdValue,
  shouldSanitizeAnthropicToolUseIdResponse
} from "@ccr/core/gateway/features/anthropic-tool-use-ids.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("#1808 tool_use ids outside the Anthropic pattern are sanitized deterministically", () => {
  assert.equal(sanitizeAnthropicToolUseIdValue("Bash:0"), "Bash_0");
  assert.equal(sanitizeAnthropicToolUseIdValue("functions.Bash:0"), "functions_Bash_0");
  assert.equal(sanitizeAnthropicToolUseIdValue("toolu_01ABC-def"), "toolu_01ABC-def");
  assert.equal(sanitizeAnthropicToolUseIdValue(""), "");
});

test("#1808 SSE content_block_start tool_use ids are sanitized across chunk boundaries", async () => {
  const toolBlock = 'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"Bash:0","name":"Bash","input":{}}}\n\n';
  const textBlock = 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"Bash:0"}}\n\n';
  const output = await streamText(sanitizeAnthropicToolUseIdResponseStream(
    Readable.from([textBlock, toolBlock.slice(0, 50), toolBlock.slice(50), "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"]),
    "text/event-stream"
  ));
  assert.ok(output.startsWith(textBlock), "non-tool blocks pass through untouched");
  assert.match(output, /"id":"Bash_0"/);
  assert.doesNotMatch(output, /"id":"Bash:0"/);
  assert.match(output, /event: message_stop/);
});

test("#1808 valid SSE tool_use blocks are returned byte for byte", () => {
  const block = 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"Bash","input":{}}}';
  assert.equal(sanitizeAnthropicToolUseIdSseBlockForTest(block), block);
});

test("#1808 JSON message tool_use ids are sanitized", async () => {
  const body = JSON.stringify({ type: "message", role: "assistant", content: [
    { type: "text", text: "running" },
    { type: "tool_use", id: "functions.Bash:0", name: "Bash", input: { command: "ls" } }
  ] });
  const output = JSON.parse(await streamText(sanitizeAnthropicToolUseIdResponseStream(
    Readable.from([body.slice(0, 20), body.slice(20)]),
    "application/json"
  )));
  assert.equal(output.content[1].id, "functions_Bash_0");
  assert.equal(output.content[0].text, "running");
});

test("#1808 response sanitizing only applies to Anthropic Messages bodies", () => {
  assert.equal(shouldSanitizeAnthropicToolUseIdResponse({ contentType: "text/event-stream", protocol: "anthropic_messages" }), true);
  assert.equal(shouldSanitizeAnthropicToolUseIdResponse({ contentType: "application/json; charset=utf-8", protocol: "anthropic_messages" }), true);
  assert.equal(shouldSanitizeAnthropicToolUseIdResponse({ contentType: "text/event-stream", protocol: "openai_chat_completions" }), false);
  assert.equal(shouldSanitizeAnthropicToolUseIdResponse({ contentType: "text/plain", protocol: "anthropic_messages" }), false);
});

test("#1808 poisoned transcripts are repaired so tool_result still pairs with tool_use", () => {
  const body = Buffer.from(JSON.stringify({ model: "claude-sonnet-4", messages: [
    { role: "user", content: "list files" },
    { role: "assistant", content: [{ type: "tool_use", id: "Bash:0", name: "Bash", input: {} }, { type: "tool_use", id: "toolu_ok", name: "Bash", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "Bash:0", content: "a" }, { type: "tool_result", tool_use_id: "toolu_ok", content: "b" }] }
  ] }));
  const prepared = prepareAnthropicToolUseIdRequest({ body, method: "POST", protocol: "anthropic_messages" });
  assert.equal(prepared?.rewritten, 2);
  const parsed = JSON.parse(prepared.body.toString("utf8"));
  assert.deepEqual(parsed.messages[1].content.map((block) => block.id), ["Bash_0", "toolu_ok"]);
  assert.deepEqual(parsed.messages[2].content.map((block) => block.tool_use_id), ["Bash_0", "toolu_ok"]);
});

test("#1808 clean or non-Anthropic requests are left alone", () => {
  const clean = Buffer.from(JSON.stringify({ messages: [{ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }] }] }));
  assert.equal(prepareAnthropicToolUseIdRequest({ body: clean, method: "POST", protocol: "anthropic_messages" }), undefined);
  const dirty = Buffer.from(JSON.stringify({ messages: [{ role: "assistant", content: [{ type: "tool_use", id: "Bash:0", name: "Bash", input: {} }] }] }));
  assert.equal(prepareAnthropicToolUseIdRequest({ body: dirty, method: "POST", protocol: "openai_chat_completions" }), undefined);
  assert.equal(prepareAnthropicToolUseIdRequest({ body: dirty, method: "GET", protocol: "anthropic_messages" }), undefined);
  assert.equal(prepareAnthropicToolUseIdRequest({ body: Buffer.from("not json"), method: "POST", protocol: "anthropic_messages" }), undefined);
});

test("#1808 gateway pipeline repairs the transcript and sanitizes converted tool_use ids", async () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [{ capabilities: [{ baseUrl: "http://kimi.example/v1/chat/completions", type: "openai_chat_completions" }], models: ["kimi-k3"], name: "nim" }],
    Router: { builtInRules: { "claude-code": { enabled: false }, codex: { enabled: false } }, fallback: { mode: "off", models: [], retryCount: 0 }, rules: [] },
    contextArchive: { enabled: false, mcpEnabled: false },
    observability: { agentAnalysis: false, requestLogs: false },
    preferredProvider: "nim",
    profile: { enabled: false, profiles: [] },
    toolHub: { enabled: false },
    virtualModelProfiles: []
  };
  const plugin = new ClaudeCodeRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "core-token",
    getPlugin: () => plugin,
    getStatus: () => ({ coreEndpoint: "http://127.0.0.1:65535", endpoint: "http://127.0.0.1:3456" })
  });
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let upstreamBody;
  console.warn = (message, ...args) => {
    if (!String(message).startsWith("[usage] Failed to record usage:")) originalWarn(message, ...args);
  };
  globalThis.fetch = async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"kimi-k3","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"Bash:1","name":"Bash","input":{}}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ].join(""), { headers: { "content-length": "999", "content-type": "text/event-stream" }, status: 200 });
  };
  try {
    const request = Readable.from([JSON.stringify({ max_tokens: 64, model: "nim/kimi-k3", stream: true, messages: [
      { role: "user", content: "list files" },
      { role: "assistant", content: [{ type: "tool_use", id: "Bash:0", name: "Bash", input: { command: "ls" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "Bash:0", content: "a" }] }
    ] })]);
    request.headers = { "content-type": "application/json", "user-agent": "claude-code/1.0" };
    request.method = "POST";
    request.url = "/v1/messages";
    const response = new CapturingResponse();
    const finished = new Promise((resolve, reject) => {
      response.once("finish", resolve);
      response.once("error", reject);
    });
    await pipeline.proxyRequest(request, response, "/v1/messages");
    await finished;

    assert.equal(upstreamBody.messages[1].content[0].id, "Bash_0");
    assert.equal(upstreamBody.messages[2].content[0].tool_use_id, "Bash_0");
    assert.equal(response.headers["content-length"], undefined);
    assert.match(response.bodyText(), /"id":"Bash_1"/);
    assert.doesNotMatch(response.bodyText(), /Bash:1/);
  } finally {
    await new Promise((resolve) => setImmediate(resolve));
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

class CapturingResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headers = {};
    this.statusCode = 0;
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(
      Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)])
    );
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  bodyText() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}
