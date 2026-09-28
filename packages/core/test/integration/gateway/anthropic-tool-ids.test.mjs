import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const model = "meta/muse-spark-1.3-contributor";

test("#1781 actual gateway preserves parallel Anthropic tool IDs in Chat and Responses", { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccr-tool-ids-"));
  const captured = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    captured.push({ path: request.url, body });
    response.setHeader("content-type", "application/json");
    if (request.url.endsWith("/chat/completions")) {
      response.end(JSON.stringify({ id: "chat-test", object: "chat.completion", model, choices: [
        { index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }
      ], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }));
    } else {
      response.end(JSON.stringify({ id: "resp-test", object: "response", model, status: "completed", output: [
        { type: "message", id: "msg-test", role: "assistant", content: [{ type: "output_text", text: "done", annotations: [] }] }
      ], usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } }));
    }
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
        if (url.hostname !== 'openrouter.ai') throw new Error('Unexpected upstream');
        return {ok: true, value: {...upstreamRequest, url: ${JSON.stringify(upstreamOrigin)} + url.pathname}};
      }
    }] });`);
    writeFileSync(configFile, JSON.stringify({
      host: "127.0.0.1", port, logging: { enabled: false },
      providers: ["openai_chat_completions", "openai_responses"].map((type) => ({
        name: type, type, baseurl: "https://openrouter.ai/api/v1", apikey: "test-only", models: [model]
      })),
      plugins: [
        { key: "ccr-test-boundary", modulePath: path.resolve(".test-dist/core/runtime/upstream-header-sanitizer.js") },
        { key: "test-transport", modulePath: redirectFile }
      ]
    }));
    child = spawn(process.execPath, [path.resolve("node_modules/@the-next-ai/ai-gateway/dist/index.js")], {
      cwd: root,
      env: { PATH: process.env.PATH, ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE, GATEWAY_CONFIG_PATH: configFile },
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
    const ids = Array.from({ length: 12 }, (_, index) => `toolu_${index}`);
    for (const protocol of ["openai_chat_completions", "openai_responses"]) {
      const response = await fetch(`${origin}/v1/messages`, {
        method: "POST", headers: { "content-type": "application/json", "x-target-provider": protocol },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ model, max_tokens: 1, messages: [
          { role: "user", content: "inspect files" },
          { role: "assistant", content: ids.map((id) => ({ type: "tool_use", id, name: "read_file", input: { path: id } })) },
          { role: "user", content: ids.map((id) => ({ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: `result ${id}` }] })) }
        ], tools: [{ name: "read_file", input_schema: { type: "object", properties: { path: { type: "string" } } } }] })
      });
      assert.equal(response.status, 200, await response.text());
      const { body } = captured.at(-1);
      if (protocol === "openai_responses") {
        assert.deepEqual(body.input.filter((item) => item.type === "function_call").map((item) => item.call_id), ids);
        assert.deepEqual(body.input.filter((item) => item.type === "function_call_output").map((item) => item.call_id), ids);
        assert.equal(body.max_output_tokens, 16);
      } else {
        assert.deepEqual(body.messages.flatMap((item) => item.tool_calls ?? []).map((item) => item.id), ids);
        assert.deepEqual(body.messages.filter((item) => item.role === "tool").map((item) => item.tool_call_id), ids);
        assert.equal(body.max_tokens ?? body.max_completion_tokens, 16);
      }
    }
    assert.equal(captured.length, 2);
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

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
