import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";

const model = "z-ai/glm-5.3";

test("#1793 coalesces OpenAI reasoning for non-streaming Anthropic clients", { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-nonstream-reasoning-"));
  const upstreamBodies = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    upstreamBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));

    if (upstreamBodies.at(-1).stream === true) {
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      for (const payload of [
        {
          id: "chatcmpl-reasoning",
          model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
        },
        reasoningChunk("Choose "),
        reasoningChunk("carefully."),
        {
          id: "chatcmpl-reasoning",
          model,
          choices: [{ index: 0, delta: { content: " California." }, finish_reason: null }]
        },
        {
          id: "chatcmpl-reasoning",
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
        },
        {
          id: "chatcmpl-reasoning",
          model,
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
        }
      ]) {
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
      response.end("data: [DONE]\n\n");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "chatcmpl-reasoning",
      object: "chat.completion",
      model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          reasoning_content: "Choose carefully.",
          reasoning_details: [
            { type: "reasoning.text", text: "Choose ", format: "openrouter", index: 0 },
            { type: "reasoning.text", text: "carefully.", format: "openrouter", index: 0 }
          ],
          content: "California."
        },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
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

    const appConfig = createDefaultAppConfig();
    appConfig.Providers = [{
      apiKey: "test-only",
      baseUrl: "https://openrouter.ai/api/v1",
      id: "openrouter",
      models: [model],
      name: "OpenRouter",
      type: "openai_chat_completions"
    }, {
      apiKey: "test-only",
      baseUrl: "https://openrouter.ai/api/v1",
      id: "openrouter-direct",
      models: [model],
      name: "OpenRouter Direct",
      type: "openai_chat_completions"
    }];

    const configFile = path.join(root, "gateway.json");
    const redirectFile = path.join(root, "loopback-transport.cjs");
    writeFileSync(redirectFile, `exports.createGatewayPlugin = () => ({ providerHooks: [{
      key: 'test-loopback-transport', transformRequest({upstreamRequest}) {
        const url = new URL(upstreamRequest.url);
        if (url.hostname !== 'openrouter.ai') throw new Error('Unexpected upstream');
        return {ok: true, value: {...upstreamRequest, url: ${JSON.stringify(upstreamOrigin)} + url.pathname}};
      }
    }] });`);
    writeFileSync(configFile, JSON.stringify({
      host: "127.0.0.1",
      port,
      logging: { enabled: false },
      providers: [{
        name: "openrouter",
        type: "openai_chat_completions",
        baseurl: "https://openrouter.ai/api/v1",
        apikey: "test-only",
        models: [model]
      }, {
        name: "openrouter-direct",
        type: "openai_chat_completions",
        baseurl: "https://openrouter.ai/api/v1",
        apikey: "test-only",
        models: [model]
      }],
      providerPlugins: [{
        key: "force-openrouter-stream",
        providerName: "openrouter",
        models: [model],
        request: { bodySet: { stream: true } }
      }],
      plugins: [
        {
          key: "ccr-router",
          modulePath: path.resolve(".test-dist/core/runtime/router-plugin.js"),
          config: { appConfig }
        },
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
    await waitForGateway(origin, child, () => output);
    for (const provider of ["OpenRouter Direct", "OpenRouter"]) {
      const response = await fetch(`${origin}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          model: `${provider}/${model}`,
          max_tokens: 300,
          thinking: { type: "enabled", budget_tokens: 200 },
          messages: [{ role: "user", content: "In one sentence, name a US state." }]
        })
      });
      const responseText = await response.text();

      assert.equal(response.status, 200, responseText);
      const payload = JSON.parse(responseText);
      assert.deepEqual(payload.content, [
        { type: "thinking", thinking: "Choose carefully." },
        { type: "text", text: "California." }
      ]);
      assert.equal(payload.stop_reason, "end_turn");
    }
    assert.equal(upstreamBodies.length, 2);
    assert.equal(upstreamBodies[0].stream, undefined);
    assert.equal(upstreamBodies[1].stream, true);
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

function reasoningChunk(text) {
  return {
    id: "chatcmpl-reasoning",
    model,
    choices: [{
      index: 0,
      delta: {
        reasoning_content: text,
        reasoning_details: [{ type: "reasoning.text", text, format: "openrouter", index: 0 }]
      },
      finish_reason: null
    }]
  };
}

async function waitForGateway(origin, child, readOutput) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(readOutput());
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await delay(50);
  }
  assert.fail(`Gateway did not become ready.\n${readOutput()}`);
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
