import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const pngA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("Fusion vision MCP sends the core API key and retries a body-free lightweight usage event", async (t) => {
  const seen = {
    providerAuthorization: "",
    providerBody: undefined,
    providerPath: "",
    usageAuthorization: "",
    usageBody: undefined,
    usageEventIds: [],
    usageRawBody: "",
    usageRequestCount: 0
  };
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    if (request.url === "/usage") {
      seen.usageRequestCount += 1;
      seen.usageAuthorization = request.headers["x-ccr-billing-usage-token"] ?? "";
      seen.usageRawBody = body;
      seen.usageBody = JSON.parse(body);
      seen.usageEventIds.push(seen.usageBody.eventId);
      if (seen.usageRequestCount === 1) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "temporarily unavailable" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    seen.providerAuthorization = request.headers.authorization ?? "";
    seen.providerPath = request.url ?? "";
    seen.providerBody = JSON.parse(body);
    response.writeHead(200, {
      "content-type": "application/json",
      "x-gateway-billing-cache-read-tokens": "2",
      "x-gateway-billing-input-tokens": "10",
      "x-gateway-billing-output-tokens": "3",
      "x-gateway-billing-total-cost": "0.00042",
      "x-gateway-billing-total-tokens": "15"
    });
    response.end(JSON.stringify({
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
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
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

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, undefined);
  assert.equal(response.result?.content?.[0]?.text, "vision ok");
  assert.equal(seen.providerAuthorization, "Bearer core-token");
  assert.equal(seen.providerPath, "/v1/chat/completions");
  assert.equal(seen.providerBody?.model, "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1/glm-5v-turbo");
  assert.equal(seen.providerBody?.messages?.[0]?.content?.[1]?.type, "image_url");

  await waitFor(() => seen.usageRequestCount === 2);
  assert.equal(seen.usageRequestCount, 2);
  assert.equal(seen.usageEventIds[0], seen.usageEventIds[1]);
  assert.equal(seen.usageAuthorization, "usage-token");
  assert.equal(seen.usageBody?.schema, "ccr.fusion-usage.v1");
  assert.equal(seen.usageBody?.source?.adapterKey, "openai_chat");
  assert.equal(seen.usageBody?.target?.providerName, "provider-zhipu-ai-china---coding-plan-d63a2c4b21::openai_chat_completions::cred:test-1");
  assert.equal(seen.usageBody?.target?.model, "glm-5v-turbo");
  assert.equal(seen.usageBody?.target?.credentialId, "test-1");
  assert.deepEqual(seen.usageBody?.billing?.usage, {
    cache_read_tokens: 2,
    input_tokens: 10,
    output_tokens: 3,
    total_tokens: 15
  });
  assert.equal(seen.usageBody?.billing?.cost?.total, 0.00042);
  assert.equal(seen.usageBody?.trace, undefined);
  assert.equal(seen.usageRawBody.includes("Describe this image."), false);
  assert.equal(seen.usageRawBody.includes("iVBORw0KGgo="), false);
  assert.ok(Buffer.byteLength(seen.usageRawBody, "utf8") < 1_024);
});

test("Fusion vision MCP retries and falls back between configured vision models", async (t) => {
  const primaryModel = "provider-zhipu::openai_chat_completions::cred:primary/glm-5v-turbo";
  const fallbackModel = "provider-qwen::openai_chat_completions::cred:backup/qwen-vl-plus";
  const seen = {
    providerBodies: [],
    usageBodies: []
  };
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    if (request.url === "/usage") {
      seen.usageBodies.push(JSON.parse(body));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }

    seen.providerBodies.push(JSON.parse(body));
    if (seen.providerBodies.length < 3) {
      response.writeHead(503, {
        "content-type": "application/json",
        "retry-after": "0.001"
      });
      response.end(JSON.stringify({ error: { message: "vision temporarily unavailable" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content: "fallback vision ok" } }],
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
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand_with_fallback",
      CCR_FUSION_USAGE_SYNC_ENDPOINT: `http://127.0.0.1:${address.port}/usage`,
      CCR_FUSION_USAGE_SYNC_HEADER: "x-ccr-billing-usage-token",
      CCR_FUSION_USAGE_SYNC_TOKEN: "usage-token",
      VISION_FALLBACK_MODELS_JSON: JSON.stringify([fallbackModel]),
      VISION_GATEWAY_API_KEY: "core-token",
      VISION_GATEWAY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
      VISION_MODEL: primaryModel,
      VISION_RETRY_COUNT: "1"
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
      name: "vision_understand_with_fallback"
    }
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, undefined);
  assert.equal(response.result?.content?.[0]?.text, "fallback vision ok");
  assert.deepEqual(seen.providerBodies.map((body) => body.model), [
    primaryModel,
    primaryModel,
    fallbackModel
  ]);

  await waitFor(() => seen.usageBodies.length === 3);
  assert.deepEqual(seen.usageBodies.map((body) => body.outcome?.statusCode), [503, 503, 200]);
  assert.deepEqual(seen.usageBodies.map((body) => body.target?.model), [
    "glm-5v-turbo",
    "glm-5v-turbo",
    "qwen-vl-plus"
  ]);
});

test("Fusion vision MCP preserves billing headers and status from non-JSON provider errors", async (t) => {
  const seen = {
    usageBody: undefined
  };
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    if (request.url === "/usage") {
      seen.usageBody = JSON.parse(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    response.writeHead(429, {
      "content-type": "text/plain",
      "x-gateway-billing-cache-read-tokens": "2",
      "x-gateway-billing-input-tokens": "9",
      "x-gateway-billing-output-tokens": "1",
      "x-gateway-billing-total-cost": "0.0007",
      "x-gateway-billing-total-tokens": "10"
    });
    response.end("provider temporarily unavailable");
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
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
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

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text ?? "", /Invalid JSON from provider/);
  await waitFor(() => seen.usageBody !== undefined);
  assert.equal(seen.usageBody?.outcome?.statusCode, 429);
  assert.equal(seen.usageBody?.outcome?.status, "rate-limited");
  assert.deepEqual(seen.usageBody?.billing?.usage, {
    cache_read_tokens: 2,
    input_tokens: 9,
    output_tokens: 1,
    total_tokens: 10
  });
  assert.equal(seen.usageBody?.billing?.cost?.total, 0.0007);
  assert.deepEqual(seen.usageBody?.target, {
    credentialId: "test-2",
    model: "openai-vision",
    providerName: "provider-openai-compatible::openai_chat_completions::cred:test-2"
  });
});

test("Fusion vision MCP preserves slash-containing model IDs for external runtimes", async (t) => {
  const model = "accounts/fireworks/models/llama-v3p2-11b-vision-instruct";
  const seen = {
    providerBody: undefined,
    usageBody: undefined
  };
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await readRequestBody(request));
    if (request.url === "/usage") {
      seen.usageBody = body;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ applied: true, ok: true }));
      return;
    }
    seen.providerBody = body;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
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
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
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

  assert.equal(response.error, undefined);
  assert.equal(response.result?.content?.[0]?.text, "external vision ok");
  assert.equal(seen.providerBody?.model, model);
  await waitFor(() => seen.usageBody !== undefined);
  assert.deepEqual(seen.usageBody?.target, { model });
});

test("Fusion vision MCP accepts a full data URL in imageBase64", async (t) => {
  const provider = await serveVision(t);
  if (!provider) {
    return;
  }
  const child = spawnVision(t, provider.port);
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { imageBase64: `data:image/png;base64,${pngA}`, prompt: "Read it." },
      name: "vision_understand"
    }
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, undefined);
  assert.equal(provider.requests, 1);
  assert.equal(provider.lastBody?.messages?.[0]?.content?.[1]?.image_url?.url, `data:image/png;base64,${pngA}`);
});

test("Fusion vision MCP refuses a local SVG file instead of forwarding it as a fake PNG", async (t) => {
  const provider = await serveVision(t);
  if (!provider) {
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "fusion-vision-svg-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const svgPath = path.join(dir, "logo.svg");
  await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>', "utf8");

  const child = spawnVision(t, provider.port);
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { images: [{ path: svgPath }], prompt: "Read it." },
      name: "vision_understand"
    }
  });

  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text, /SVG\/XML/);
  assert.equal(provider.requests, 0, "the SVG must never reach the upstream");
});

test("Fusion vision MCP restricts the forwarded media-type label to supported raster types", async (t) => {
  const provider = await serveVision(t);
  if (!provider) {
    return;
  }
  const child = spawnVision(t, provider.port);

  const octetStream = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { imageBase64: pngA, mimeType: "application/octet-stream", prompt: "Read it." },
      name: "vision_understand"
    }
  });
  assert.equal(provider.lastBody?.messages?.[0]?.content?.[1]?.image_url?.url, `data:image/png;base64,${pngA}`);

  const textPlain = await sendJsonRpc(child, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { imageUrl: `data:text/plain;base64,${pngA}`, prompt: "Read it." },
      name: "vision_understand"
    }
  });
  assert.equal(provider.lastBody?.messages?.[0]?.content?.[1]?.image_url?.url, `data:image/png;base64,${pngA}`);

  const webp = await sendJsonRpc(child, {
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { imageUrl: `data:image/webp;base64,${pngA}`, prompt: "Read it." },
      name: "vision_understand"
    }
  });
  assert.equal(provider.lastBody?.messages?.[0]?.content?.[1]?.image_url?.url, `data:image/webp;base64,${pngA}`);
});

test("Fusion vision MCP forwards a local PNG file with a supported label", async (t) => {
  const provider = await serveVision(t);
  if (!provider) {
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "fusion-vision-png-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const pngPath = path.join(dir, "img.png");
  await writeFile(pngPath, Buffer.from(pngA, "base64"));

  const child = spawnVision(t, provider.port);
  const response = await sendJsonRpc(child, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { images: [{ path: pngPath }], prompt: "Read it." },
      name: "vision_understand"
    }
  });

  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, undefined);
  assert.equal(provider.requests, 1);
  assert.equal(provider.lastBody?.messages?.[0]?.content?.[1]?.image_url?.url, `data:image/png;base64,${pngA}`);
});

async function serveVision(t, respond) {
  let requests = 0;
  let lastBody;
  const server = http.createServer(async (request, response) => {
    const body = readRequestBody(request);
    requests += 1;
    lastBody = JSON.parse(await body);
    if (respond) {
      respond(lastBody);
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content: "vision ok" } }],
      usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 }
    }));
  });
  try {
    await listen(server);
  } catch (error) {
    if (isLocalListenUnavailable(error)) {
      t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
      return undefined;
    }
    throw error;
  }
  t.after(() => server.close());
  assert.ok(server.address() && typeof server.address() === "object");
  return { port: server.address().port, get requests() { return requests; }, get lastBody() { return lastBody; } };
}

function spawnVision(t, port, env = {}) {
  const child = spawn(process.execPath, [path.join(process.cwd(), ".test-dist", "core", "runtime", "fusion-vision-mcp.js")], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FUSION_BUILTIN_TOOL_KIND: "vision",
      FUSION_TOOL_NAME: "vision_understand",
      VISION_API_KEY: "external-key",
      VISION_BASE_URL: `http://127.0.0.1:${port}/v1`,
      VISION_MODEL: "test-vision",
      ...env
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });
  return child;
}
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

async function waitFor(predicate, timeoutMs = 2_000) {
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
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for fusion-vision MCP response. stderr=${stderr}`)), 5000);

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);

    const message = Buffer.from(JSON.stringify(payload), "utf8");
    child.stdin.write(`Content-Length: ${message.byteLength}\r\n\r\n`);
    child.stdin.write(message);
  });
}

function readJsonRpcFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return undefined;
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
    return undefined;
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
