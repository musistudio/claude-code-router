import assert from "node:assert/strict";
import test from "node:test";
import { backendService } from "@ccr/core/plugins/backend-service.ts";

test("plugin backend returns 500 for synchronous throws and continues serving requests", async () => {
  const ownerId = "sync-handler-error-test";
  const backend = await backendService.registerHttpBackend(ownerId, {
    handler(request, response) {
      if (request.url === "/fail") {
        throw new Error("Synchronous plugin failure");
      }
      response.end("healthy");
    }
  });
  try {
    const failure = await fetch(`${backend.url}/fail`, { signal: AbortSignal.timeout(3000) });
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: { message: "Synchronous plugin failure" } });
    const healthy = await fetch(`${backend.url}/healthy`, { signal: AbortSignal.timeout(3000) });
    assert.equal(await healthy.text(), "healthy");
  } finally {
    await backendService.stopOwner(ownerId);
  }
});

test("plugin backend still returns 500 for asynchronous handler rejections", async () => {
  const ownerId = "async-handler-error-test";
  const backend = await backendService.registerHttpBackend(ownerId, {
    async handler() {
      await Promise.resolve();
      throw new Error("Asynchronous plugin failure");
    }
  });
  try {
    const failure = await fetch(backend.url, { signal: AbortSignal.timeout(3000) });
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: { message: "Asynchronous plugin failure" } });
  } finally {
    await backendService.stopOwner(ownerId);
  }
});
