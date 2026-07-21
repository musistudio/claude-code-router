"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/integration/mcp/fusion-vision-mcp.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_child_process = require("node:child_process");
var import_node_http = __toESM(require("node:http"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
(0, import_node_test.default)("Fusion vision MCP sends the core API key and retries a body-free lightweight usage event", async (t) => {
  const seen = {
    providerAuthorization: "",
    providerBody: void 0,
    providerPath: "",
    usageAuthorization: "",
    usageBody: void 0,
    usageEventIds: [],
    usageRawBody: "",
    usageRequestCount: 0
  };
  const server = import_node_http.default.createServer(async (request, response2) => {
    const body = await readRequestBody(request);
    if (request.url === "/usage") {
      seen.usageRequestCount += 1;
      seen.usageAuthorization = request.headers["x-ccr-billing-usage-token"] ?? "";
      seen.usageRawBody = body;
      seen.usageBody = JSON.parse(body);
      seen.usageEventIds.push(seen.usageBody.eventId);
      if (seen.usageRequestCount === 1) {
        response2.writeHead(503, { "content-type": "application/json" });
        response2.end(JSON.stringify({ error: "temporarily unavailable" }));
        return;
      }
      response2.writeHead(200, { "content-type": "application/json" });
      response2.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    seen.providerAuthorization = request.headers.authorization ?? "";
    seen.providerPath = request.url ?? "";
    seen.providerBody = JSON.parse(body);
    response2.writeHead(200, {
      "content-type": "application/json",
      "x-gateway-billing-cache-read-tokens": "2",
      "x-gateway-billing-input-tokens": "10",
      "x-gateway-billing-output-tokens": "3",
      "x-gateway-billing-total-cost": "0.00042",
      "x-gateway-billing-total-tokens": "15"
    });
    response2.end(JSON.stringify({
      choices: [
        {
          message: {
            content: "vision ok"
          }
        }
      ],
      usage: { prompt_tokens: 999, completion_tokens: 999, total_tokens: 1998 }
    }));
  });
  try {
    await listen(server);
  } catch (error) {
    if (isLocalListenUnavailable(error)) {
      t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
      return;
    }
    throw error;
  }
  t.after(() => server.close());
  const address = server.address();
  import_strict.default.ok(address && typeof address === "object");
  const child = (0, import_node_child_process.spawn)(process.execPath, [import_node_path.default.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand_glm_5_2v",
      CCR_FUSION_USAGE_SYNC_ENDPOINT: `http://127.0.0.1:${address.port}/usage`,
      CCR_FUSION_USAGE_SYNC_HEADER: "x-ccr-billing-usage-token",
      CCR_FUSION_USAGE_SYNC_TOKEN: "usage-token",
      VISION_GATEWAY_API_KEY: "core-token",
      VISION_GATEWAY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      VISION_MODEL: "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1/glm-5v-turbo"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        prompt: "Describe this image."
      },
      name: "vision_understand_glm_5_2v"
    }
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.equal(response.result?.isError, void 0);
  import_strict.default.equal(response.result?.content?.[0]?.text, "vision ok");
  import_strict.default.equal(seen.providerAuthorization, "Bearer core-token");
  import_strict.default.equal(seen.providerPath, "/v1/chat/completions");
  import_strict.default.equal(seen.providerBody?.model, "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1/glm-5v-turbo");
  import_strict.default.equal(seen.providerBody?.messages?.[0]?.content?.[1]?.type, "image_url");
  await waitFor(() => seen.usageRequestCount === 2);
  import_strict.default.equal(seen.usageRequestCount, 2);
  import_strict.default.equal(seen.usageEventIds[0], seen.usageEventIds[1]);
  import_strict.default.equal(seen.usageAuthorization, "usage-token");
  import_strict.default.equal(seen.usageBody?.schema, "ccr.fusion-usage.v1");
  import_strict.default.equal(seen.usageBody?.source?.adapterKey, "openai_chat");
  import_strict.default.equal(seen.usageBody?.target?.providerName, "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1");
  import_strict.default.equal(seen.usageBody?.target?.model, "glm-5v-turbo");
  import_strict.default.equal(seen.usageBody?.target?.credentialId, "test-1");
  import_strict.default.deepEqual(seen.usageBody?.billing?.usage, {
    cache_read_tokens: 2,
    input_tokens: 10,
    output_tokens: 3,
    total_tokens: 15
  });
  import_strict.default.equal(seen.usageBody?.billing?.cost?.total, 42e-5);
  import_strict.default.equal(seen.usageBody?.trace, void 0);
  import_strict.default.equal(seen.usageRawBody.includes("Describe this image."), false);
  import_strict.default.equal(seen.usageRawBody.includes("iVBORw0KGgo="), false);
  import_strict.default.ok(Buffer.byteLength(seen.usageRawBody, "utf8") < 1024);
});
(0, import_node_test.default)("Fusion vision MCP preserves billing headers and status from non-JSON provider errors", async (t) => {
  const seen = {
    usageBody: void 0
  };
  const server = import_node_http.default.createServer(async (request, response2) => {
    const body = await readRequestBody(request);
    if (request.url === "/usage") {
      seen.usageBody = JSON.parse(body);
      response2.writeHead(200, { "content-type": "application/json" });
      response2.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    response2.writeHead(429, {
      "content-type": "text/plain",
      "x-gateway-billing-cache-read-tokens": "2",
      "x-gateway-billing-input-tokens": "9",
      "x-gateway-billing-output-tokens": "1",
      "x-gateway-billing-total-cost": "0.0007",
      "x-gateway-billing-total-tokens": "10"
    });
    response2.end("provider temporarily unavailable");
  });
  try {
    await listen(server);
  } catch (error) {
    if (isLocalListenUnavailable(error)) {
      t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
      return;
    }
    throw error;
  }
  t.after(() => server.close());
  const address = server.address();
  import_strict.default.ok(address && typeof address === "object");
  const child = (0, import_node_child_process.spawn)(process.execPath, [import_node_path.default.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand_non_json",
      CCR_FUSION_USAGE_SYNC_ENDPOINT: `http://127.0.0.1:${address.port}/usage`,
      CCR_FUSION_USAGE_SYNC_HEADER: "x-ccr-billing-usage-token",
      CCR_FUSION_USAGE_SYNC_TOKEN: "usage-token",
      VISION_GATEWAY_API_KEY: "core-token",
      VISION_GATEWAY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      VISION_MODEL: "provider-openai-compatible::openai_chat_completions::cred:test-2/openai-vision"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        prompt: "Describe this image."
      },
      name: "vision_understand_non_json"
    }
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.equal(response.result?.isError, true);
  import_strict.default.match(response.result?.content?.[0]?.text ?? "", /Invalid JSON from provider/);
  await waitFor(() => seen.usageBody !== void 0);
  import_strict.default.equal(seen.usageBody?.outcome?.statusCode, 429);
  import_strict.default.equal(seen.usageBody?.outcome?.status, "rate-limited");
  import_strict.default.deepEqual(seen.usageBody?.billing?.usage, {
    cache_read_tokens: 2,
    input_tokens: 9,
    output_tokens: 1,
    total_tokens: 10
  });
  import_strict.default.equal(seen.usageBody?.billing?.cost?.total, 7e-4);
  import_strict.default.deepEqual(seen.usageBody?.target, {
    credentialId: "test-2",
    model: "openai-vision",
    providerName: "provider-openai-compatible::openai_chat_completions::cred:test-2"
  });
});
(0, import_node_test.default)("Fusion vision MCP preserves slash-containing model IDs for external runtimes", async (t) => {
  const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";
  const seen = {
    providerBody: void 0,
    usageBody: void 0
  };
  const server = import_node_http.default.createServer(async (request, response2) => {
    const body = JSON.parse(await readRequestBody(request));
    if (request.url === "/usage") {
      seen.usageBody = body;
      response2.writeHead(200, { "content-type": "application/json" });
      response2.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    seen.providerBody = body;
    response2.writeHead(200, { "content-type": "application/json" });
    response2.end(JSON.stringify({
      choices: [{ message: { content: "external vision ok" } }],
      usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 }
    }));
  });
  try {
    await listen(server);
  } catch (error) {
    if (isLocalListenUnavailable(error)) {
      t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
      return;
    }
    throw error;
  }
  t.after(() => server.close());
  const address = server.address();
  import_strict.default.ok(address && typeof address === "object");
  const child = (0, import_node_child_process.spawn)(process.execPath, [import_node_path.default.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand_external",
      CCR_FUSION_USAGE_SYNC_ENDPOINT: `http://127.0.0.1:${address.port}/usage`,
      CCR_FUSION_USAGE_SYNC_HEADER: "x-ccr-billing-usage-token",
      CCR_FUSION_USAGE_SYNC_TOKEN: "usage-token",
      VISION_API_KEY: "external-key",
      VISION_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      VISION_MODEL: model
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        prompt: "Describe this image."
      },
      name: "vision_understand_external"
    }
  });
  import_strict.default.equal(response.error, void 0);
  import_strict.default.equal(response.result?.content?.[0]?.text, "external vision ok");
  import_strict.default.equal(seen.providerBody?.model, model);
  await waitFor(() => seen.usageBody !== void 0);
  import_strict.default.deepEqual(seen.usageBody?.target, { model });
});
function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}
function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
async function waitFor(predicate, timeoutMs = 2e3) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the lightweight Fusion usage event.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function sendJsonRpc(child, payload) {
  return new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = "";
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const onStdout = (chunk) => {
      stdout = Buffer.concat([stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const parsed = readJsonRpcFrame(stdout);
      if (!parsed) {
        return;
      }
      finish(parsed.value);
    };
    const onStderr = (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    };
    const onExit = (code, signal) => {
      fail(new Error(`fusion-vision MCP exited before response: code=${code ?? ""} signal=${signal ?? ""} stderr=${stderr}`));
    };
    const onError = (error) => fail(error);
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for fusion-vision MCP response. stderr=${stderr}`)), 5e3);
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
    const message = Buffer.from(JSON.stringify(payload), "utf8");
    child.stdin.write(`Content-Length: ${message.byteLength}\r
\r
`);
    child.stdin.write(message);
  });
}
function readJsonRpcFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return void 0;
  }
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) {
    throw new Error(`Missing Content-Length in MCP response: ${header}`);
  }
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) {
    return void 0;
  }
  return {
    rest: buffer.subarray(bodyEnd),
    value: JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"))
  };
}
function isLocalListenUnavailable(error) {
  return error && typeof error === "object" && (error.code === "EPERM" || error.code === "EACCES");
}
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
