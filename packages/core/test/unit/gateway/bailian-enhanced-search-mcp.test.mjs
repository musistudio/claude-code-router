import assert from "node:assert/strict";
import test from "node:test";
import { bailianEnhancedSearchHttpStatus, searchBailianEnhancedWeb } from "@ccr/core/gateway/features/bailian-enhanced-search/mcp.ts";

const searchInput = {
  apiKey: "sk-ws-test-secret",
  endpoint: "http://127.0.0.1/bailian-enhanced-search-mcp",
  query: "Shanghai weather",
  timeoutMs: 1_000
};

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function rpcResult(id, result) {
  return jsonResponse({ id, jsonrpc: "2.0", result });
}

function toolResult(pages = []) {
  return { content: [{ type: "text", text: JSON.stringify({ pages }) }] };
}

function handshake() {
  return [rpcResult(1, {}), new Response(null, { status: 202 })];
}

function installFetchStub(t, responses) {
  const requests = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const request = { body: JSON.parse(init.body), signal: init.signal, url };
    requests.push(request);
    assert.ok(responses.length > 0, "Unexpected extra MCP request");
    const next = responses.shift();
    return typeof next === "function" ? next(request) : next;
  };
  t.after(() => { globalThis.fetch = previous; });
  return requests;
}

function sseResponse(chunks, { close = true, onCancel } = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk));
      if (close) controller.close();
    },
    cancel() { onCancel?.(); }
  }), { headers: { "content-type": "text/event-stream" } });
}

test("EnhancedSearch distinguishes valid zero results from invalid tool payloads", async (t) => {
  for (const [name, result, pattern] of [
    ["empty content", { content: [] }, /no search payload/],
    ["non-JSON text", { content: [{ type: "text", text: `upstream error ${searchInput.apiKey}` }] }, /unparseable search payload/],
    ["missing pages", { content: [{ type: "text", text: "{}" }] }, /unexpected search payload/],
    ["wrong pages type", { content: [{ type: "text", text: '{"pages":null}' }] }, /unexpected search payload/],
    ["tool error", { ...toolResult(), isError: true }, /tool call failed/]
  ]) {
    await t.test(name, async (t) => {
      const requests = installFetchStub(t, [...handshake(), rpcResult(2, result)]);
      await assert.rejects(searchBailianEnhancedWeb(searchInput), (error) => {
        assert.match(error.message, pattern);
        assert.equal(error.message.includes(searchInput.apiKey), false);
        assert.equal(bailianEnhancedSearchHttpStatus(error), undefined, "Tool failures must not mark credentials as HTTP-rejected");
        return true;
      });
      assert.equal(requests.length, 3, "Malformed and failed tools must not be retried");
    });
  }
  await t.test("legitimate empty result", async (t) => {
    const requests = installFetchStub(t, [...handshake(), rpcResult(2, toolResult())]);
    assert.deepEqual(await searchBailianEnhancedWeb(searchInput), []);
    assert.equal(requests.length, 3);
  });
});

test("EnhancedSearch reports JSON-RPC failures without disclosing upstream messages", async (t) => {
  for (const id of [1, 2]) {
    await t.test(`request ${id}`, async (t) => {
      const responses = id === 1 ? [] : handshake();
      responses.push(jsonResponse({ id, jsonrpc: "2.0", error: { code: -32001, message: `Invalid key ${searchInput.apiKey}` } }));
      const requests = installFetchStub(t, responses);
      await assert.rejects(searchBailianEnhancedWeb(searchInput), (error) => {
        assert.equal(error.message, "Bailian enhanced search RPC failed (-32001).");
        assert.equal(bailianEnhancedSearchHttpStatus(error), undefined, "RPC errors are not HTTP credential rejections");
        return true;
      });
      assert.equal(requests.length, id === 1 ? 1 : 3);
    });
  }
});

test("EnhancedSearch rejects wrong RPC ids and versions without retry", async (t) => {
  for (const response of [
    { id: 2, jsonrpc: "2.0", result: {} },
    { id: "1", jsonrpc: "2.0", result: {} },
    { id: 1, result: {} }
  ]) {
    await t.test(JSON.stringify(response), async (t) => {
      const requests = installFetchStub(t, [jsonResponse(response)]);
      await assert.rejects(searchBailianEnhancedWeb(searchInput), /unexpected RPC response/);
      assert.equal(requests.length, 1);
    });
  }
});

test("EnhancedSearch releases HTTP error bodies and does not retry rejected requests", async (t) => {
  for (const status of [401, 403, 429, 500]) {
    await t.test(`HTTP ${status}`, async (t) => {
      let cancelled = false;
      const response = new Response(new ReadableStream({
        cancel() { cancelled = true; }
      }), { status });
      const requests = installFetchStub(t, [response]);
      await assert.rejects(searchBailianEnhancedWeb(searchInput), (error) => {
        assert.equal(error.message, `Bailian enhanced search endpoint returned HTTP ${status}.`);
        assert.equal(bailianEnhancedSearchHttpStatus(error), status, "The caller can apply search-only credential cooldowns");
        return true;
      });
      assert.equal(cancelled, true);
      assert.equal(requests.length, 1);
    });
  }
});

test("EnhancedSearch retries an empty tools/call 200 with a fresh three-step handshake", async (t) => {
  const requests = installFetchStub(t, [
    ...handshake(), new Response(""),
    ...handshake(), rpcResult(2, toolResult([{ title: "Weather", url: "https://example.test", snippet: "Sunny" }]))
  ]);
  assert.deepEqual(await searchBailianEnhancedWeb(searchInput), [{ title: "Weather", url: "https://example.test", snippet: "Sunny" }]);
  assert.deepEqual(requests.map((request) => request.body.method), [
    "initialize", "notifications/initialized", "tools/call", "initialize", "notifications/initialized", "tools/call"
  ]);
  assert.ok(requests.every((request) => request.signal === requests[0].signal), "Retries share one deadline");
});

test("EnhancedSearch retries an empty initialize response at most once", async (t) => {
  const requests = installFetchStub(t, [new Response(""), new Response("")]);
  await assert.rejects(searchBailianEnhancedWeb(searchInput), /empty response/);
  assert.equal(requests.length, 2);
});

test("EnhancedSearch parses SSE framing across chunks and returns before the stream closes", async (t) => {
  let cancelled = false;
  const pages = [{ title: "上海天气", url: "https://example.test/shanghai" }];
  const response = { jsonrpc: "2.0", id: 2, result: toolResult(pages) };
  const payload = [
    ": keepalive\r\n\r\n",
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: 99, result: {} })}\r\n\r\n`,
    `event: message\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":2,"result":${JSON.stringify(response.result)}}\r\n\r\n`,
    `data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\r\n\r\n`
  ].join("");
  // Split every byte, including UTF-8 characters and CRLF boundaries.
  const chunks = Array.from(new TextEncoder().encode(payload), (byte) => Uint8Array.of(byte));
  const requests = installFetchStub(t, [...handshake(), sseResponse(chunks, { close: false, onCancel() { cancelled = true; } })]);
  assert.deepEqual(await searchBailianEnhancedWeb(searchInput), pages);
  assert.equal(cancelled, true);
  assert.equal(requests.length, 3);
});

test("EnhancedSearch rejects a completed SSE stream without the requested RPC id", async (t) => {
  const requests = installFetchStub(t, [...handshake(), sseResponse([
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: 9, result: toolResult() })}\n\n`
  ])]);
  await assert.rejects(searchBailianEnhancedWeb(searchInput), /without a matching RPC response/);
  assert.equal(requests.length, 3);
});

test("EnhancedSearch reports matching SSE RPC errors and cancels the open stream", async (t) => {
  let cancelled = false;
  const requests = installFetchStub(t, [...handshake(), sseResponse([
    `data: ${JSON.stringify({ jsonrpc: "2.0", id: 2, error: { code: -32603, message: searchInput.apiKey } })}\n\n`
  ], { close: false, onCancel() { cancelled = true; } })]);
  await assert.rejects(searchBailianEnhancedWeb(searchInput), { message: "Bailian enhanced search RPC failed (-32603)." });
  assert.equal(cancelled, true);
  assert.equal(requests.length, 3);
});

test("EnhancedSearch caller cancellation stops an open SSE stream without a retry", async (t) => {
  const controller = new AbortController();
  let cancelled = false;
  const requests = installFetchStub(t, [...handshake(), () => {
    setImmediate(() => controller.abort(new Error(`Disconnected ${searchInput.apiKey}`)));
    return sseResponse([": keepalive\n\n"], { close: false, onCancel() { cancelled = true; } });
  }]);
  await assert.rejects(searchBailianEnhancedWeb({ ...searchInput, signal: controller.signal }), {
    name: "AbortError", message: "Bailian enhanced search was cancelled."
  });
  assert.equal(cancelled, true);
  assert.equal(requests.length, 3);
});

test("EnhancedSearch deadline cancels a hanging SSE response without a retry", async (t) => {
  let cancelled = false;
  const requests = installFetchStub(t, [...handshake(), sseResponse([], {
    close: false, onCancel() { cancelled = true; }
  })]);
  // AbortSignal.timeout does not keep Node alive by itself.
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    await assert.rejects(searchBailianEnhancedWeb({ ...searchInput, timeoutMs: 20 }), {
      name: "TimeoutError", message: "Bailian enhanced search timed out."
    });
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(cancelled, true);
  assert.equal(requests.length, 3);
});

test("EnhancedSearch makes no requests for an already aborted caller", async (t) => {
  const requests = installFetchStub(t, []);
  const signal = AbortSignal.abort(new Error(searchInput.apiKey));
  await assert.rejects(searchBailianEnhancedWeb({ ...searchInput, signal }), { name: "AbortError" });
  assert.equal(requests.length, 0);
});

test("EnhancedSearch sanitizes transport errors and does not replay them", async (t) => {
  const requests = installFetchStub(t, [() => {
    throw Object.assign(new Error(`Failed to fetch https://${searchInput.apiKey}@host`), { statusCode: 401 });
  }]);
  await assert.rejects(searchBailianEnhancedWeb(searchInput), (error) => {
    assert.equal(error.message, "Bailian enhanced search request failed.");
    assert.equal(bailianEnhancedSearchHttpStatus(error), undefined, "A transport error must not cool down a valid credential");
    return true;
  });
  assert.equal(requests.length, 1);
});

test("EnhancedSearch HTTP status inspection rejects unrelated errors", () => {
  for (const error of [undefined, null, new Error("HTTP 401"), { statusCode: 401 }, Object.assign(new Error("HTTP 403"), { statusCode: 403 })]) {
    assert.equal(bailianEnhancedSearchHttpStatus(error), undefined);
  }
});
