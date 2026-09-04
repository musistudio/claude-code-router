import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { GatewayMediaExecutor } from "@ccr/core/media/executors.ts";

// Starts a loopback server that reports a large content-length but never ends
// the body, so the client keeps the connection open unless it explicitly
// cancels the response body. `closed.fired` flips once the upstream socket is
// torn down, which only happens when `download()` releases the body.
function stalledArtifactServer(statusCode) {
  return new Promise((resolve) => {
    const closed = { fired: false };
    const server = http.createServer((request, response) => {
      request.on("close", () => {
        closed.fired = true;
      });
      response.writeHead(statusCode, {
        "content-length": String(300 * 1024 * 1024),
        "content-type": "application/octet-stream"
      });
      response.write(Buffer.alloc(16));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ closed, port: server.address().port, server });
    });
  });
}

function loopbackExecutor(port) {
  return new GatewayMediaExecutor(
    {
      model: "test-model",
      protocol: "openai",
      providerBaseUrl: `http://127.0.0.1:${port}`,
      providerName: "test-provider"
    },
    {}
  );
}

async function connectionClosedWithin(closed, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (closed.fired) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return closed.fired;
}

test("download releases the response body when the declared artifact is too large", async () => {
  const { closed, port, server } = await stalledArtifactServer(200);
  const executor = loopbackExecutor(port);
  try {
    await assert.rejects(
      executor.download({ fileName: "artifact.bin", remoteUrl: `http://127.0.0.1:${port}/artifact` }, new AbortController().signal),
      /exceeds the 250 MB limit/
    );
    assert.equal(await connectionClosedWithin(closed, 2000), true, "expected the upstream response body to be cancelled");
  } finally {
    server.close();
  }
});

test("download releases the response body on a non-ok status", async () => {
  const { closed, port, server } = await stalledArtifactServer(404);
  const executor = loopbackExecutor(port);
  try {
    await assert.rejects(
      executor.download({ fileName: "artifact.bin", remoteUrl: `http://127.0.0.1:${port}/artifact` }, new AbortController().signal),
      /HTTP 404/
    );
    assert.equal(await connectionClosedWithin(closed, 2000), true, "expected the upstream response body to be cancelled");
  } finally {
    server.close();
  }
});
