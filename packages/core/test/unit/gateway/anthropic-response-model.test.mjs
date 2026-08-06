import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import {
  rewriteAnthropicMessageStartModelStream,
  rewriteAnthropicSseBlockMessageStartModelForTest,
  shouldRewriteAnthropicMessageStartModel
} from "@ccr/core/gateway/features/anthropic-response-model.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("Anthropic SSE response model rewrite keeps Claude Code visible model consistent", async () => {
  const thinkingBlock = 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"keep this"}}\n\n';
  const output = await streamText(rewriteAnthropicMessageStartModelStream(
    Readable.from([
      "event: message_start\n",
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"k3","content":[]}}\n',
      "\n",
      thinkingBlock.slice(0, 37),
      thinkingBlock.slice(37),
      "data: [DONE]\n\n"
    ]),
    "kimi-test/k3"
  ));

  assert.match(output, /event: message_start\n/);
  assert.match(output, /"type":"message_start"/);
  assert.match(output, /"model":"kimi-test\/k3"/);
  assert.doesNotMatch(output, /"model":"k3"/);
  assert.match(output, new RegExp(escapeRegExp(thinkingBlock)));
  assert.match(output, /data: \[DONE\]\n\n$/);
});

test("Anthropic SSE response model rewrite leaves unrelated blocks unchanged", () => {
  const block = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}';

  assert.equal(rewriteAnthropicSseBlockMessageStartModelForTest(block, "kimi-test/k3"), block);
  assert.equal(rewriteAnthropicSseBlockMessageStartModelForTest("data: [DONE]", "kimi-test/k3"), "data: [DONE]");
  assert.equal(rewriteAnthropicSseBlockMessageStartModelForTest("data: not-json", "kimi-test/k3"), "data: not-json");
});

test("Anthropic response model rewrite activates only for Anthropic SSE with a model", () => {
  assert.equal(shouldRewriteAnthropicMessageStartModel({
    contentType: "text/event-stream; charset=utf-8",
    model: "kimi-test/k3",
    protocol: "anthropic_messages"
  }), true);
  assert.equal(shouldRewriteAnthropicMessageStartModel({
    contentType: "application/json",
    model: "kimi-test/k3",
    protocol: "anthropic_messages"
  }), false);
  assert.equal(shouldRewriteAnthropicMessageStartModel({
    contentType: "text/event-stream",
    model: "kimi-test/k3",
    protocol: "openai_responses"
  }), false);
  assert.equal(shouldRewriteAnthropicMessageStartModel({
    contentType: "text/event-stream",
    model: "",
    protocol: "anthropic_messages"
  }), false);
});

test("gateway pipeline returns the Claude Code visible model when upstream responds with bare model", async () => {
  const result = await runAnthropicPipelineModelRewrite("kimi-test/k3");

  assert.equal(result.upstreamBody?.model, "k3");
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.headers["content-type"], "text/event-stream; charset=utf-8");
  assert.equal(result.response.headers["content-length"], undefined);
  assert.match(result.output, /"model":"kimi-test\/k3"/);
  assert.doesNotMatch(result.output, /"model":"k3"/);
  assert.match(result.output, /"type":"thinking"/);
});

test("gateway pipeline preserves Claude Code hex model id in Anthropic SSE response", async () => {
  const encodedModel = `anthropic/claude-ccr-h${Buffer.from("kimi-test/k3", "utf8").toString("hex")}`;
  const result = await runAnthropicPipelineModelRewrite(encodedModel);

  assert.equal(result.upstreamBody?.model, "k3");
  assert.match(result.output, new RegExp(`"model":"${escapeRegExp(encodedModel)}"`));
  assert.doesNotMatch(result.output, /"model":"kimi-test\/k3"/);
  assert.doesNotMatch(result.output, /"model":"k3"/);
});

async function runAnthropicPipelineModelRewrite(requestModel) {
  const config = createPipelineConfigForAnthropicModelRewrite();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const pipeline = new GatewayRequestPipeline({
    getBrowserWebSearchMcpIntegration: () => undefined,
    getConfig: () => config,
    getCoreAuthToken: () => "core-token",
    getPlugin: () => plugin,
    getStatus: () => ({
      coreEndpoint: "http://127.0.0.1:65535",
      endpoint: "http://127.0.0.1:3456"
    })
  });
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let upstreamBody;
  console.warn = (message, ...args) => {
    if (String(message).startsWith("[usage] Failed to record usage:")) {
      return;
    }
    originalWarn(message, ...args);
  };
  globalThis.fetch = async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return new Response(
      [
        "event: message_start\n",
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"k3","content":[]}}\n',
        "\n",
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"historical thinking must remain visible"}}\n\n',
        "data: [DONE]\n\n"
      ].join(""),
      {
        headers: {
          "content-length": "307",
          "content-type": "text/event-stream; charset=utf-8"
        },
        status: 200
      }
    );
  };

  try {
    const request = Readable.from([JSON.stringify({
      max_tokens: 64,
      messages: [{ content: "hello", role: "user" }],
      model: requestModel,
      stream: true
    })]);
    request.headers = {
      "content-type": "application/json",
      "user-agent": "claude-code/1.0"
    };
    request.method = "POST";
    request.url = "/v1/messages";

    const response = new CapturingResponse();
    const finished = new Promise((resolve, reject) => {
      response.once("finish", resolve);
      response.once("error", reject);
    });
    await pipeline.proxyRequest(request, response, "/v1/messages");
    await finished;

    return {
      output: response.bodyText(),
      response,
      upstreamBody
    };
  } finally {
    await new Promise((resolve) => setImmediate(resolve));
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createPipelineConfigForAnthropicModelRewrite() {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        capabilities: [{ baseUrl: "http://kimi.example/v1/messages", type: "anthropic_messages" }],
        models: ["k3"],
        name: "kimi-test"
      }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: false },
        codex: { enabled: false }
      },
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    contextArchive: {
      enabled: false,
      mcpEnabled: false
    },
    observability: {
      agentAnalysis: false,
      requestLogs: false
    },
    preferredProvider: "kimi-test",
    profile: {
      enabled: false,
      profiles: []
    },
    toolHub: { enabled: false },
    virtualModelProfiles: []
  };
}

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
