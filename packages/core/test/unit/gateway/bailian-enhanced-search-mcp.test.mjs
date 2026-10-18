import assert from "node:assert/strict";
import test from "node:test";
import { searchBailianEnhancedWeb } from "@ccr/core/gateway/features/bailian-enhanced-search/mcp.ts";
import { executeBailianEnhancedSearchSideQuery } from "@ccr/core/gateway/features/bailian-enhanced-search/side-query.ts";
import { readProviderCredentialCooldown } from "@ccr/core/providers/credential-pool.ts";

const input = { apiKey: "search-secret", endpoint: "http://127.0.0.1/mcp", query: "Shanghai weather", timeoutMs: 1000 };
const rpc = (id, result) => Response.json({ id, jsonrpc: "2.0", result });
const tool = (pages = []) => ({ content: [{ type: "text", text: JSON.stringify({ pages }) }] });
const handshake = () => [rpc(1, {}), new Response(null, { status: 202 })];

function stub(t, responses) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    assert.ok(responses.length, "unexpected extra MCP request");
    const response = responses.shift();
    return typeof response === "function" ? response() : response;
  });
  return requests;
}

function sse(chunks, cancel, close = false) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      if (close) controller.close();
    },
    cancel
  }), { headers: { "content-type": "text/event-stream" } });
}

test("MCP completes the handshake and distinguishes empty results from failed tools", async (t) => {
  for (const [name, result, expected] of [
    ["results", tool([{ title: "Weather", url: "https://example.test" }]), [{ title: "Weather", url: "https://example.test" }]],
    ["empty", tool(), []],
    ["failed", { ...tool(), isError: true }, /tool call failed/],
    ["malformed", { content: [{ type: "text", text: input.apiKey }] }, /unparseable search payload/]
  ]) await t.test(name, async (t) => {
    const requests = stub(t, [...handshake(), rpc(2, result)]);
    if (Array.isArray(expected)) assert.deepEqual(await searchBailianEnhancedWeb(input), expected);
    else await assert.rejects(searchBailianEnhancedWeb(input), expected);
    assert.deepEqual(requests.map(request => request.method), ["initialize", "notifications/initialized", "tools/call"]);
    assert.equal(requests[2].params.arguments.query, input.query);
  });
});

test("MCP errors are redacted and are not replayed", async (t) => {
  for (const [name, response, pattern] of [
    ["RPC error", Response.json({ id: 1, jsonrpc: "2.0", error: { code: -32001, message: input.apiKey } }), /RPC failed/],
    ["wrong id", rpc(2, {}), /unexpected RPC response/],
    ["HTTP error", new Response(input.apiKey, { status: 403 }), /HTTP 403/],
    ["transport error", () => { throw new Error(input.apiKey); }, /request failed/]
  ]) await t.test(name, async (t) => {
    const requests = stub(t, [response]);
    await assert.rejects(searchBailianEnhancedWeb(input), error => {
      assert.match(error.message, pattern);
      assert.ok(!error.message.includes(input.apiKey));
      return true;
    });
    assert.equal(requests.length, 1);
  });
});

test("only an empty 200 retries the complete handshake, at most once", async (t) => {
  await t.test("empty tool result", async (t) => {
    const requests = stub(t, [...handshake(), new Response(""), ...handshake(), rpc(2, tool())]);
    assert.deepEqual(await searchBailianEnhancedWeb(input), []);
    assert.equal(requests.length, 6);
  });
  await t.test("repeated empty initialize", async (t) => {
    const requests = stub(t, [new Response(""), new Response("")]);
    await assert.rejects(searchBailianEnhancedWeb(input), /empty response/);
    assert.equal(requests.length, 2);
  });
});

test("fragmented UTF-8 SSE returns the matching response and closes the open stream", async (t) => {
  let cancelled = false;
  const pages = [{ title: "上海天气", url: "https://example.test" }];
  const payload = ': keepalive\r\n\r\ndata: {"jsonrpc":"2.0","id":99,"result":{}}\r\n\r\n' +
    'data: {"jsonrpc":"2.0",\r\ndata: "id":2,"result":' + JSON.stringify(tool(pages)) + '}\r\n\r\n';
  const chunks = Array.from(new TextEncoder().encode(payload), byte => Uint8Array.of(byte));
  stub(t, [...handshake(), sse(chunks, () => { cancelled = true; })]);
  assert.deepEqual(await searchBailianEnhancedWeb(input), pages);
  assert.equal(cancelled, true);
});

test("a completed SSE stream without the requested response fails", async (t) => {
  stub(t, [...handshake(), sse(['data: {"jsonrpc":"2.0","id":99,"result":{}}\n\n'], () => {}, true)]);
  await assert.rejects(searchBailianEnhancedWeb(input), /without a matching RPC response/);
});

test("the deadline cancels a hanging SSE response without another request", async (t) => {
  let cancelled = false;
  const requests = stub(t, [...handshake(), sse([], () => { cancelled = true; })]);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(searchBailianEnhancedWeb({ ...input, timeoutMs: 20 }), { name: "TimeoutError" });
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(cancelled, true);
  assert.equal(requests.length, 3);
});

test("search refusals isolate pool keys until expiry or rotation without cooling model access", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const status of [401, 403, 429, 500, "network"]) await t.test(String(status), async (t) => {
    const provider = { id: `cooldown-${status}`, name: `Cooldown ${status}`, enhancedSearch: { enabled: true },
      credentials: [{ id: "first", api_key: "first-key", priority: 1 }, { id: "second", api_key: "second-key", priority: 2 }] };
    const [first, second] = provider.credentials;
    let rejectedKey = first.api_key;
    const calls = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(init.headers.authorization);
      if (body.method === "tools/call" && init.headers.authorization === `Bearer ${rejectedKey}`) {
        if (status === "network") throw Object.assign(new Error("HTTP 401"), { statusCode: 401 });
        return new Response(null, { status });
      }
      return body.method === "notifications/initialized" ? new Response(null, { status: 202 })
        : rpc(body.id, body.method === "initialize" ? {} : tool());
    });
    const context = { provider, query: input.query, model: "search-model", stream: false };
    const run = () => executeBailianEnhancedSearchSideQuery(context);
    assert.equal((await run()).statusCode, 502);
    assert.equal(calls.length, 3, "the failed search is not replayed");
    assert.equal(readProviderCredentialCooldown(provider, first), undefined);
    if (status === 500 || status === "network") {
      rejectedKey = undefined;
      assert.equal((await run()).statusCode, 200);
      assert.equal(calls.at(-1), `Bearer ${first.api_key}`);
      return;
    }
    assert.equal((await run()).statusCode, 200);
    assert.equal(calls.at(-1), `Bearer ${second.api_key}`);
    rejectedKey = second.api_key;
    assert.equal((await run()).statusCode, 502);
    now += 59_999;
    const before = calls.length;
    assert.equal((await run()).statusCode, 503);
    assert.equal(calls.length, before, "all keys are still cooling");
    first.api_key = "edited-key";
    assert.equal((await run()).statusCode, 200);
    assert.equal(calls.at(-1), "Bearer edited-key");
    first.api_key = "first-key";
    rejectedKey = undefined;
    now += 2;
    assert.equal((await run()).statusCode, 200);
    assert.equal(calls.at(-1), "Bearer first-key");
  });
});
