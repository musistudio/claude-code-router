import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { gatewayService } from "@ccr/core/gateway/service.ts";

test("gateway treats downstream client aborts as expected stream cleanup", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ccr-gateway-client-abort-test-"));
  const uncaughtErrors = [];
  const unhandledRejections = [];
  const onUncaughtException = (error) => uncaughtErrors.push(error);
  const onUnhandledRejection = (error) => unhandledRejections.push(error);
  process.prependListener("uncaughtException", onUncaughtException);
  process.prependListener("unhandledRejection", onUnhandledRejection);
  let upstreamResponseClosed = false;
  const patch = "*** Begin Patch\n*** Add File: foo.txt\n+hi\n*** End Patch\n";

  const upstream = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("event: response.output_text.delta\n");
    response.write(`data: ${JSON.stringify({
      item: {
        arguments: JSON.stringify({ patch }),
        call_id: "call_patch",
        name: "virtual_apply_patch",
        type: "function_call"
      },
      type: "response.output_item.done"
    })}\n\n`);
    const interval = setInterval(() => {
      response.write("event: response.output_text.delta\n");
      response.write(`data: ${JSON.stringify({ delta: "tick", type: "response.output_text.delta" })}\n\n`);
    }, 20);
    response.on("close", () => {
      upstreamResponseClosed = true;
      clearInterval(interval);
    });
  });
  const gateway = createServer((request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    void gatewayService.proxyRequest(request, response, requestPath).catch((error) => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json" });
      }
      if (!response.writableEnded) {
        response.end(`${JSON.stringify({ error: { message: String(error?.message ?? error) } })}\n`);
      }
    });
  });

  try {
    try {
      await listen(upstream);
    } catch (error) {
      if (isLocalListenUnavailable(error)) {
        t.skip(`Local HTTP listen is unavailable: ${formatError(error)}`);
        return;
      }
      throw error;
    }
    await waitForTcpListener(upstream);
    const upstreamPort = serverPort(upstream);
    const config = createDefaultAppConfig({ generatedConfigFile: path.join(dir, "gateway.config.json") });
    config.APIKEY = "test-api-key";
    config.gateway.coreHost = "127.0.0.1";
    config.gateway.corePort = upstreamPort;
    config.gateway.host = "127.0.0.1";
    config.gateway.port = 0;
    gatewayService.updateConfig(config);
    gatewayService.coreAuthToken = "test-core-auth-token";

    await listen(gateway);
    await waitForTcpListener(gateway);
    const gatewayUrl = `http://127.0.0.1:${serverPort(gateway)}/v1/responses`;
    const controller = new AbortController();
    const response = await fetch(gatewayUrl, {
      body: JSON.stringify({
        input: "hello",
        model: "provider-deepseek::openai_chat_completions/deepseek-v4-flash",
        stream: true,
        tools: [{ type: "custom", name: "apply_patch", format: { type: "grammar", syntax: "lark", definition: "start: begin_patch" } }]
      }),
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
        "user-agent": "codex-test"
      },
      method: "POST",
      signal: controller.signal
    });

    const errorText = response.status === 200 ? "" : await response.text();
    assert.equal(response.status, 200, errorText);
    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    assert.equal(firstChunk.done, false);
    const firstChunkText = new TextDecoder().decode(firstChunk.value);
    assert.match(firstChunkText, /"type":"custom_tool_call"/, "expected the response to use the Codex apply_patch response transform");
    assert.match(firstChunkText, /"name":"apply_patch"/, "expected virtual_apply_patch to be rewritten back to apply_patch");

    await reader.cancel("test downstream disconnect");
    controller.abort();
    await waitFor(() => upstreamResponseClosed, 1000);

    assert.deepEqual(uncaughtErrors.map((error) => error?.message ?? String(error)), []);
    assert.deepEqual(unhandledRejections.map((error) => error?.message ?? String(error)), []);
  } finally {
    process.off("uncaughtException", onUncaughtException);
    process.off("unhandledRejection", onUnhandledRejection);
    await closeServer(gateway);
    await closeServer(upstream);
    await gatewayService.stop();
    rmSync(dir, { force: true, recursive: true });
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function serverPort(server) {
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  return address.port;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => server.closeAllConnections?.(), 1000);
    server.close((error) => {
      clearTimeout(timeout);
      error ? reject(error) : resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTcpListener(server, timeoutMs = 1000) {
  const port = serverPort(server);
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(port, "127.0.0.1");
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Timed out connecting to TCP listener on port ${port}`));
        }, Math.max(1, deadline - Date.now()));
        socket.once("connect", () => {
          clearTimeout(timer);
          socket.end();
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          socket.destroy();
          reject(error);
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(10);
    }
  }
  throw lastError ?? new Error(`Timed out waiting for TCP listener on port ${port}`);
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(10);
  }
  assert.equal(predicate(), true);
}

function isLocalListenUnavailable(error) {
  return error && typeof error === "object" && (error.code === "EPERM" || error.code === "EACCES");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
