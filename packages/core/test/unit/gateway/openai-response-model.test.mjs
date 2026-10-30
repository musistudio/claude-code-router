import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "@ccr/core/gateway/claude-code-router-plugin.ts";
import {
  rewriteOpenAiResponseModelStream,
  shouldRewriteOpenAiResponseModel
} from "@ccr/core/gateway/features/anthropic-response-model.ts";
import { GatewayRequestPipeline } from "@ccr/core/gateway/request/pipeline.ts";

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("OpenAI chat completion chunks carry the client visible model", async () => {
  const output = await streamText(rewriteOpenAiResponseModelStream(
    Readable.from([
      'data: {"id":"c1","model":"gpt-upstream","choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"id":"c2","choices":[{"delta":{"content":"!"}}]}\n\n',
      "data: [DONE]\n\n"
    ]),
    "openai-test/gpt-upstream",
    "text/event-stream"
  ));

  assert.match(output, /"model":"openai-test\/gpt-upstream"/);
  assert.doesNotMatch(output, /"model":"gpt-upstream"/);
  // Chunks without a model field stay untouched.
  assert.match(output, /"id":"c2","choices"/);
  assert.match(output, /data: \[DONE\]\n\n$/);
});

test("OpenAI Responses events rewrite response.model only", async () => {
  const output = await streamText(rewriteOpenAiResponseModelStream(
    Readable.from([
      'event: response.created\ndata: {"type":"response.created","response":{"id":"r1","model":"gpt-upstream"}}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n',
      "data: [DONE]\n\n"
    ]),
    "openai-test/gpt-upstream",
    "text/event-stream"
  ));

  assert.match(output, /"response":\{"id":"r1","model":"openai-test\/gpt-upstream"\}/);
  assert.match(output, /"type":"response.output_text.delta","delta":"hi"/);
  assert.doesNotMatch(output, /"model":"gpt-upstream"/);
});

test("Non-streaming OpenAI JSON body model is rewritten", async () => {
  const output = await streamText(rewriteOpenAiResponseModelStream(
    Readable.from([JSON.stringify({
      choices: [{ message: { content: "hi", role: "assistant" } }],
      id: "c1",
      model: "gpt-upstream"
    })]),
    "openai-test/gpt-upstream",
    "application/json"
  ));

  assert.equal(JSON.parse(output).model, "openai-test/gpt-upstream");
  assert.equal(JSON.parse(output).id, "c1");
});

test("Non-streaming body without a model stays byte-identical", async () => {
  const body = JSON.stringify({ ok: true });
  const output = await streamText(
    rewriteOpenAiResponseModelStream(Readable.from([body]), "openai-test/gpt-upstream", "application/json")
  );
  assert.equal(output, body);
});

test("OpenAI response model rewrite activates only for OpenAI protocols with a model", () => {
  for (const protocol of ["openai_chat_completions", "openai_responses"]) {
    assert.equal(shouldRewriteOpenAiResponseModel({
      contentType: "text/event-stream; charset=utf-8",
      model: "openai-test/gpt-upstream",
      protocol
    }), true);
    assert.equal(shouldRewriteOpenAiResponseModel({
      contentType: "application/json",
      model: "openai-test/gpt-upstream",
      protocol
    }), true);
    assert.equal(shouldRewriteOpenAiResponseModel({
      contentType: "application/json",
      model: "",
      protocol
    }), false);
  }
  assert.equal(shouldRewriteOpenAiResponseModel({
    contentType: "text/event-stream",
    model: "openai-test/gpt-upstream",
    protocol: "anthropic_messages"
  }), false);
  assert.equal(shouldRewriteOpenAiResponseModel({
    contentType: "text/plain",
    model: "openai-test/gpt-upstream",
    protocol: "openai_responses"
  }), false);
});

test("gateway pipeline returns the requested model for a streaming OpenAI fallback leg", async () => {
  const result = await runOpenAiPipelineModelRewrite({
    path: "/v1/chat/completions",
    responseBody: [
      'data: {"id":"c1","model":"gpt-upstream","choices":[{"delta":{"content":"hi"}}]}\n\n',
      "data: [DONE]\n\n"
    ].join(""),
    responseContentType: "text/event-stream; charset=utf-8"
  });

  assert.equal(result.upstreamBody?.model, "gpt-upstream");
  assert.equal(result.response.headers["content-length"], undefined);
  assert.match(result.output, /"model":"openai-test\/gpt-upstream"/);
  assert.doesNotMatch(result.output, /"model":"gpt-upstream"/);
});

test("gateway pipeline returns the requested model for a non-streaming OpenAI leg", async () => {
  const result = await runOpenAiPipelineModelRewrite({
    path: "/v1/chat/completions",
    responseBody: JSON.stringify({
      choices: [{ message: { content: "hi", role: "assistant" } }],
      id: "c1",
      model: "gpt-upstream"
    }),
    responseContentType: "application/json"
  });

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.headers["content-length"], undefined);
  assert.equal(JSON.parse(result.output).model, "openai-test/gpt-upstream");
});

test("gateway pipeline rewrites response.model for a Responses fallback leg", async () => {
  const result = await runOpenAiPipelineModelRewrite({
    path: "/v1/responses",
    responseBody: JSON.stringify({
      id: "r1",
      model: "gpt-upstream",
      object: "response",
      output: []
    }),
    responseContentType: "application/json"
  });

  assert.equal(JSON.parse(result.output).model, "openai-test/gpt-upstream");
});

async function runOpenAiPipelineModelRewrite({ path, responseBody, responseContentType }) {
  const config = createPipelineConfigForOpenAiModelRewrite();
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
    return new Response(responseBody, {
      headers: {
        "content-length": String(Buffer.byteLength(responseBody)),
        "content-type": responseContentType
      },
      status: 200
    });
  };

  try {
    const request = Readable.from([JSON.stringify({
      messages: [{ content: "hello", role: "user" }],
      model: "openai-test/gpt-upstream",
      stream: responseContentType.includes("text/event-stream")
    })]);
    request.headers = {
      "content-type": "application/json",
      "user-agent": "codex/1.0"
    };
    request.method = "POST";
    request.url = path;

    const response = new CapturingResponse();
    const finished = new Promise((resolve, reject) => {
      response.once("finish", resolve);
      response.once("error", reject);
    });
    await pipeline.proxyRequest(request, response, path);
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

function createPipelineConfigForOpenAiModelRewrite() {
  return {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        capabilities: [{ baseUrl: "http://openai-test.example/v1", type: "openai_chat_completions" }],
        models: ["gpt-upstream"],
        name: "openai-test"
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
    preferredProvider: "openai-test",
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
