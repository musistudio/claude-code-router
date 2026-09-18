import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const model = "deepseek-v4.1-flash";
const cacheReadTokens = 800;
const promptTokens = 1000;

test("#1791 actual gateway reports OpenCode Go cache reads to Anthropic clients", { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-opencode-go-cache-"));
  const captured = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    captured.push({ body, headers: request.headers, path: request.url });

    if (request.url.endsWith("/messages")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: "msg-cache-native",
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: "cached" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: promptTokens - cacheReadTokens,
          output_tokens: 1,
          cache_read_input_tokens: cacheReadTokens,
          cache_creation_input_tokens: 0
        }
      }));
      return;
    }

    if (body.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-cache-stream",
        object: "chat.completion.chunk",
        created: 1,
        model,
        choices: [{ index: 0, delta: { role: "assistant", content: "cached" }, finish_reason: null }]
      })}\n\n`);
      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-cache-stream",
        object: "chat.completion.chunk",
        created: 1,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: 1,
          total_tokens: promptTokens + 1,
          prompt_cache_hit_tokens: cacheReadTokens,
          prompt_cache_miss_tokens: promptTokens - cacheReadTokens,
          prompt_tokens_details: {}
        }
      })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "chatcmpl-cache-json",
      object: "chat.completion",
      created: 1,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: "cached" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: 1,
        total_tokens: promptTokens + 1,
        prompt_cache_hit_tokens: cacheReadTokens,
        prompt_cache_miss_tokens: promptTokens - cacheReadTokens,
        prompt_tokens_details: {}
      }
    }));
  });

  let child;
  let exited;
  let output = "";
  try {
    await listen(upstream);
    const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
    const reservation = createServer();
    await listen(reservation);
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));

    const configFile = path.join(root, "gateway.json");
    const redirectFile = path.join(root, "loopback-transport.cjs");
    writeFileSync(redirectFile, `exports.createGatewayPlugin = () => ({ providerHooks: [{
      key: 'test-loopback-transport', transformRequest({upstreamRequest}) {
        const url = new URL(upstreamRequest.url);
        if (url.hostname !== 'opencode.ai') throw new Error('Unexpected upstream');
        return {ok: true, value: {...upstreamRequest, url: ${JSON.stringify(upstreamOrigin)} + url.pathname}};
      }
    }] });`);
    writeFileSync(configFile, JSON.stringify({
      host: "127.0.0.1",
      port,
      logging: { enabled: false },
      providers: [
        {
          name: "opencode-go-chat",
          type: "openai_chat_completions",
          baseurl: "https://opencode.ai/zen/go/v1",
          apikey: "test-only",
          models: [model]
        },
        {
          name: "opencode-go-anthropic",
          type: "anthropic_messages",
          baseurl: "https://opencode.ai/zen/go",
          apikey: "test-only",
          models: [model]
        }
      ],
      plugins: [
        { key: "ccr-test-boundary", modulePath: path.resolve(".test-dist/core/runtime/upstream-header-sanitizer.js") },
        { key: "test-transport", modulePath: redirectFile }
      ]
    }));

    child = spawn(process.execPath, [path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js")], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
        GATEWAY_CONFIG_PATH: configFile
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    exited = once(child, "exit");
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8000); });

    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error(output);
      try { ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, output);

    const sessionId = "claude-conversation-1791";
    const requestBody = {
      model,
      max_tokens: 16,
      system: [{ type: "text", text: "stable prefix", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "hello" }]
    };
    const headers = {
      "content-type": "application/json",
      "user-agent": "claude-cli/2.1.220",
      "x-claude-code-session-id": sessionId,
      "x-target-provider": "opencode-go-chat"
    };

    const jsonResponse = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(requestBody)
    });
    const jsonResponseText = await jsonResponse.text();
    assert.equal(jsonResponse.status, 200, jsonResponseText);
    const jsonPayload = JSON.parse(jsonResponseText);
    assert.equal(jsonPayload.usage.input_tokens, promptTokens - cacheReadTokens);
    assert.equal(jsonPayload.usage.cache_read_input_tokens, cacheReadTokens);

    const streamResponse = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ ...requestBody, stream: true })
    });
    const streamResponseText = await streamResponse.text();
    assert.equal(streamResponse.status, 200, streamResponseText);
    const events = parseSseEvents(streamResponseText);
    const finalUsage = events.findLast((event) => event.usage?.cache_read_input_tokens !== undefined)?.usage;
    assert.equal(finalUsage?.input_tokens, promptTokens - cacheReadTokens);
    assert.equal(finalUsage?.cache_read_input_tokens, cacheReadTokens);

    const nativeResponse = await fetch(`${origin}/v1/messages`, {
      method: "POST",
      headers: { ...headers, "x-target-provider": "opencode-go-anthropic" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(requestBody)
    });
    const nativeResponseText = await nativeResponse.text();
    assert.equal(nativeResponse.status, 200, nativeResponseText);
    const nativePayload = JSON.parse(nativeResponseText);
    assert.equal(nativePayload.usage.input_tokens, promptTokens - cacheReadTokens);
    assert.equal(nativePayload.usage.cache_read_input_tokens, cacheReadTokens);

    assert.equal(captured.length, 3);
    for (const request of captured) {
      assert.equal(request.headers["x-opencode-session"], sessionId);
      assert.equal(request.headers["user-agent"], "claude-cli/2.1.220");
    }
    assert.equal(captured[0].path, "/zen/go/v1/chat/completions");
    assert.equal(captured[1].path, "/zen/go/v1/chat/completions");
    assert.equal(captured[1].body.stream_options?.include_usage, true);
    assert.equal(captured[2].path, "/zen/go/v1/messages");
    assert.deepEqual(captured[2].body.system[0].cache_control, { type: "ephemeral" });
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(force);
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});

function parseSseEvents(payload) {
  return payload
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
