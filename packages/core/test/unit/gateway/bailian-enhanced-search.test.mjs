import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { parseProvidersForTest } from "@ccr/core/config/config.ts";
import { readProviderCredentialCooldown } from "@ccr/core/providers/credential-pool.ts";
import {
  bailianEnhancedSearchEndpointEnv,
  executeBailianEnhancedSearchSideQuery,
  prepareBailianEnhancedSearchSideQuery,
  isBailianEnhancedSearchSideQueryBody,
  normalizeBailianEnhancedSearchQuery,
  stripClaudeCodeWebSearchQueryPrefix
} from "@ccr/core/gateway/features/bailian-enhanced-search/index.ts";

function requestBody(query = "上海天气", stream = false) {
  return {
    max_tokens: 4096,
    messages: [{ content: `Perform a web search for the query: ${query}`, role: "user" }],
    model: "claude-sonnet-5",
    stream,
    system: "You are an assistant for performing a web search tool use",
    thinking: { type: "disabled" },
    tool_choice: { type: "tool", name: "web_search" },
    tools: [{ max_uses: 8, name: "web_search", type: "web_search_20250305" }]
  };
}

function enabledConfig() {
  const config = createDefaultAppConfig();
  config.Providers = [{
    enhancedSearch: { apiKey: "test-search-key", enabled: true },
    id: "bailian", models: ["glm-5.3"], name: "Alibaba Bailian", type: "anthropic_messages"
  }, {
    id: "other", models: ["other-model"], name: "Other provider", type: "anthropic_messages"
  }];
  return config;
}

function prepare(config = enabledConfig(), body = requestBody(), routedModel = "bailian/glm-5.3") {
  return prepareBailianEnhancedSearchSideQuery({ config, method: "POST", path: "/v1/messages", body: Buffer.from(JSON.stringify(body)), routedModel });
}

async function withMcp(pages, run) {
  const previousFetch = globalThis.fetch;
  const previousEndpoint = process.env[bailianEnhancedSearchEndpointEnv];
  const calls = [];
  process.env[bailianEnhancedSearchEndpointEnv] = "http://127.0.0.1/bailian-enhanced-search-mcp";
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    calls.push({ payload, headers: init?.headers });
    if (payload.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    const result = payload.method === "initialize" ? {} : { content: [{ type: "text", text: JSON.stringify({ pages }) }] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }), { headers: { "content-type": "application/json" } });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEndpoint === undefined) delete process.env[bailianEnhancedSearchEndpointEnv];
    else process.env[bailianEnhancedSearchEndpointEnv] = previousEndpoint;
  }
}

function reconstructSse(text) {
  const events = text.trim().split(/\n\n/).map((event) => JSON.parse(event.split("\ndata: ")[1]));
  let message;
  const jsonDeltas = new Map();
  for (const event of events) {
    if (event.type === "message_start") message = event.message;
    else if (event.type === "content_block_start") message.content[event.index] = structuredClone(event.content_block);
    else if (event.type === "content_block_delta") {
      const block = message.content[event.index];
      if (event.delta.type === "text_delta") block.text += event.delta.text;
      else if (event.delta.type === "input_json_delta") {
        jsonDeltas.set(event.index, (jsonDeltas.get(event.index) ?? "") + event.delta.partial_json);
      }
    } else if (event.type === "content_block_stop" && jsonDeltas.has(event.index)) {
      message.content[event.index].input = JSON.parse(jsonDeltas.get(event.index));
    } else if (event.type === "message_delta") {
      Object.assign(message, event.delta);
      Object.assign(message.usage, event.usage);
    }
  }
  return { events, message };
}

const pages = [{ title: "上海天气", url: "https://weather.example.test/shanghai", snippet: "上海多云 24-31 度" }];

test("side-query detection requires the dedicated single-user search prompt and server tool", () => {
  assert.equal(isBailianEnhancedSearchSideQueryBody(requestBody()), true);
  const dated = requestBody();
  dated.tools[0].type = "web_search_20260209";
  assert.equal(isBailianEnhancedSearchSideQueryBody(dated), true);
  const blocks = requestBody();
  blocks.messages[0].content = [{ type: "text", text: "Perform a web search for the query:" }, { type: "text", text: "上海天气" }];
  assert.equal(isBailianEnhancedSearchSideQueryBody(blocks), true);
  assert.equal(prepare(enabledConfig(), blocks).query, "上海天气");

  for (const change of [
    (body) => { body.messages[0].content = "Hello. Please explain this code."; },
    (body) => { body.messages.push({ role: "assistant", content: "earlier answer" }); },
    (body) => { body.messages[0].role = "assistant"; },
    (body) => { body.messages[0].content = [{ type: "tool_result", content: "Perform a web search for the query: text" }]; },
    (body) => { body.tools.push({ name: "Bash" }); },
    (body) => { body.tools[0] = { name: "web_search", input_schema: { type: "object" } }; },
    (body) => { body.tools[0] = { name: "WebSearch", input_schema: { type: "object" } }; },
    (body) => { body.tools[0] = { name: "google_search", type: "google_search" }; },
    (body) => { body.tools[0].type = "web_search_custom"; },
    (body) => { body.tool_choice = { type: "none" }; },
    (body) => { body.tool_choice = { type: "tool", name: "Bash" }; }
  ]) {
    const body = requestBody();
    change(body);
    assert.equal(isBailianEnhancedSearchSideQueryBody(body), false, JSON.stringify(body));
    assert.equal(prepare(enabledConfig(), body), undefined);
  }
});

test("preparation uses the routed provider and preserves the client model", () => {
  const config = enabledConfig();
  const context = prepare(config);
  assert.equal(context.provider, config.Providers[0]);
  assert.equal(context.model, "claude-sonnet-5");
  assert.equal(context.query, "上海天气");
  assert.equal(prepare(config, requestBody(), "other/other-model"), undefined);
  assert.equal(prepare(config, requestBody(), "missing/no-model"), undefined);
  config.Providers[0].enhancedSearch.enabled = false;
  assert.equal(prepare(config), undefined);
  config.Providers[0].enhancedSearch.enabled = true;
  config.Providers[0].enabled = false;
  assert.equal(prepare(config), undefined);
});

test("preparation only handles the messages endpoint and valid JSON", () => {
  const args = { config: enabledConfig(), method: "POST", path: "/v1/messages", body: Buffer.from(JSON.stringify(requestBody())), routedModel: "bailian/glm-5.3" };
  for (const patch of [{ method: "GET" }, { path: "/v1/messages/count_tokens" }, { path: "/v1/chat/completions" }, { body: undefined }, { body: Buffer.from("not json") }]) {
    assert.equal(prepareBailianEnhancedSearchSideQuery({ ...args, ...patch }), undefined);
  }
});

test("disabled or unrelated search providers skip request body decoding", (t) => {
  const body = Buffer.from(JSON.stringify(requestBody()));
  const decode = t.mock.method(body, "toString");
  for (const [config, routedModel] of [
    [createDefaultAppConfig(), undefined],
    [enabledConfig(), "other/other-model"],
    [enabledConfig(), "missing/no-model"]
  ]) {
    assert.equal(prepareBailianEnhancedSearchSideQuery({ config, routedModel, body, method: "POST", path: "/v1/messages" }), undefined);
  }
  assert.equal(decode.mock.callCount(), 0);
});

test("routed body controls search semantics while requestedModel only controls the reply model", async () => {
  const body = requestBody("路由修改后的查询", true);
  body.model = "bailian/glm-5.3";
  body.tools[0].allowed_domains = ["weather.example.test"];
  const input = {
    config: enabledConfig(), method: "POST", path: "/v1/messages",
    body: Buffer.from(JSON.stringify(body)), requestedModel: "claude-sonnet-5"
  };
  const context = prepareBailianEnhancedSearchSideQuery(input);
  assert.equal(context.provider.id, "bailian");
  assert.equal(context.query, "路由修改后的查询");
  assert.equal(context.stream, true);
  assert.equal(context.model, "claude-sonnet-5");
  await withMcp([...pages, { title: "Excluded", url: "https://other.test/result" }], async (calls) => {
    const response = await executeBailianEnhancedSearchSideQuery(context);
    const { message } = reconstructSse(response.body);
    assert.equal(message.model, "claude-sonnet-5");
    assert.equal(calls.at(-1).payload.params.arguments.query, "路由修改后的查询");
    assert.deepEqual(message.content[1].content.map((result) => result.url), [pages[0].url]);
  });
  delete body.tools;
  assert.equal(prepareBailianEnhancedSearchSideQuery({ ...input, body: Buffer.from(JSON.stringify(body)) }), undefined);
});

test("JSON replies preserve tool-result pairing and report only search usage", async () => {
  await withMcp(pages, async (calls) => {
    const reply = await executeBailianEnhancedSearchSideQuery(prepare());
    assert.equal(reply.statusCode, 200);
    const message = JSON.parse(reply.body);
    assert.equal(message.model, "claude-sonnet-5");
    assert.equal(message.stop_reason, "end_turn");
    assert.deepEqual(message.content[0].input, { query: "上海天气" });
    assert.equal(message.content[1].tool_use_id, message.content[0].id);
    assert.deepEqual(message.content[1].content, [{ type: "web_search_result", title: "上海天气", url: pages[0].url }]);
    assert.match(message.content[2].text, /上海多云 24-31 度/);
    assert.deepEqual(message.usage, { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 1 } });
    assert.equal(calls.length, 3);
    assert.equal(calls[2].payload.params.arguments.query, "上海天气");
    assert.equal(calls[0].headers.authorization, "Bearer test-search-key");
  });
});

test("Anthropic SSE reconstructs each query and result text exactly once", async () => {
  await withMcp(pages, async () => {
    const streamed = await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), requestBody("上海天气", true)));
    const plain = JSON.parse((await executeBailianEnhancedSearchSideQuery(prepare())).body);
    assert.match(streamed.headers["content-type"], /^text\/event-stream/);
    const { events, message } = reconstructSse(streamed.body);
    const starts = events.filter((event) => event.type === "content_block_start");
    assert.deepEqual(starts[0].content_block.input, {});
    assert.equal(starts[2].content_block.text, "");
    assert.equal(events.filter((event) => event.type === "content_block_delta" && event.index === 1).length, 0);
    assert.deepEqual(message.content[0].input, plain.content[0].input);
    assert.deepEqual(message.content[1].content, plain.content[1].content);
    assert.equal(message.content[2].text, plain.content[2].text);
    assert.deepEqual(message.usage, plain.usage);
    assert.equal(message.stop_reason, "end_turn");
    assert.equal(events.at(-1).type, "message_stop");
  });
});

test("domain filters include subdomains and paths without matching suffix impostors", async () => {
  const candidates = [
    { title: "root", url: "https://example.test/blog/a" },
    { title: "subdomain", url: "https://docs.example.test/blog/b/child" },
    { title: "other path", url: "https://example.test/news/a" },
    { title: "suffix impostor", url: "https://badexample.test/blog/a" },
    { title: "nested suffix", url: "https://example.test.evil.test/blog/a" }
  ];
  await withMcp(candidates, async () => {
    const allowed = requestBody();
    allowed.tools[0].allowed_domains = ["example.test/blog/*"];
    const message = JSON.parse((await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), allowed))).body);
    assert.deepEqual(message.content[1].content.map((result) => result.title), ["root", "subdomain"]);
    allowed.tools[0].allowed_domains = ["example.test/*/b"];
    const wildcard = JSON.parse((await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), allowed))).body);
    assert.deepEqual(wildcard.content[1].content.map((result) => result.title), ["subdomain"]);
    const blocked = requestBody();
    blocked.tools[0].blocked_domains = ["example.test"];
    const reply = JSON.parse((await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), blocked))).body);
    assert.deepEqual(reply.content[1].content.map((result) => result.title), ["suffix impostor", "nested suffix"]);
  });
});

test("invalid search options fail before reaching MCP", async () => {
  await withMcp(pages, async (calls) => {
    for (const fields of [
      { allowed_domains: ["example.test"], blocked_domains: ["blocked.test"] },
      { allowed_domains: ["https://example.test"] }, { allowed_domains: ["*.example.test"] },
      { allowed_domains: "example.test" }, { allowed_domains: [null] }, { max_uses: 0 },
      { allowed_domains: Array(65).fill("example.test") },
      { blocked_domains: ["example.test/" + "x".repeat(2048)] }
    ]) {
      const body = requestBody();
      Object.assign(body.tools[0], fields);
      const reply = await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), body));
      assert.equal(reply.statusCode, 400);
      assert.equal(JSON.parse(reply.body).error.type, "invalid_request_error");
    }
    assert.equal((await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), requestBody(" ")))).statusCode, 400);
    assert.equal(calls.length, 0);
  });
});

test("domain filters complete adversarial wildcard paths", async () => {
  if (process.env.CCR_TEST_SEARCH_FILTER_CHILD !== "1") {
    const env = { ...process.env, CCR_TEST_SEARCH_FILTER_CHILD: "1" };
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [
      "--test-name-pattern=^domain filters complete adversarial wildcard paths$", "--test-reporter=tap", process.argv[1]
    ], { env, encoding: "utf8", timeout: 3_000 });
    assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout);
    assert.match(child.stdout, /Subtest: domain filters complete adversarial wildcard paths/, child.stdout + child.stderr);
    return;
  }
  await withMcp([
    { title: "article", url: "https://example.test/articles/a-normal-search-result-page" },
    { title: "repeated characters", url: "https://example.test/" + "a".repeat(40) }
  ], async () => {
    const body = requestBody();
    body.tools[0].allowed_domains = [
      "example.test/" + "*".repeat(20) + "Z",
      "example.test/" + "*a".repeat(20) + "b"
    ];
    const reply = await executeBailianEnhancedSearchSideQuery(prepare(enabledConfig(), body));
    assert.equal(reply.statusCode, 200);
    assert.deepEqual(JSON.parse(reply.body).content[1].content, []);
  });
});

test("dedicated keys take precedence and credential pools honor enabled flags and request limits", async () => {
  await withMcp(pages, async (calls) => {
    const config = enabledConfig();
    const provider = config.Providers[0];
    provider.name = `Credential pool ${Date.now()}`;
    provider.api_key = "stale-legacy-key";
    provider.credentials = [
      { id: "disabled", api_key: "disabled-key", enabled: false, priority: 0 },
      { id: "first", api_key: "pool-first-key", priority: 1, limits: { rpm: 1 } },
      { id: "second", apiKey: "pool-second-key", priority: 2, limits: { rpm: 1 } }
    ];
    const context = prepare(config);
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
    assert.equal(calls[0].headers.authorization, "Bearer test-search-key");
    delete provider.enhancedSearch.apiKey;
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
    assert.equal(calls[3].headers.authorization, "Bearer pool-first-key");
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
    assert.equal(calls[6].headers.authorization, "Bearer pool-second-key");
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 503);
    provider.credentials.forEach((credential) => { credential.enabled = false; });
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 503);
    assert.equal(calls.length, 9);
  });
});

test("legacy provider keys still work and missing keys do not trigger searches", async () => {
  await withMcp(pages, async (calls) => {
    const config = enabledConfig();
    config.Providers[0].enhancedSearch = { enabled: true };
    assert.equal((await executeBailianEnhancedSearchSideQuery(prepare(config))).statusCode, 503);
    assert.equal(calls.length, 0);
    config.Providers[0].api_key = " legacy-key ";
    assert.equal((await executeBailianEnhancedSearchSideQuery(prepare(config))).statusCode, 200);
    assert.equal(calls[0].headers.authorization, "Bearer legacy-key");
  });
});

test("HTTP search refusals cool down only that pool key for subsequent searches", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const status of [401, 403, 429]) {
    await withMcp(pages, async () => {
      const config = enabledConfig();
      const provider = config.Providers[0];
      provider.enhancedSearch = { enabled: true };
      provider.credentials = [
        { id: `rejected-${status}`, api_key: `rejected-key-${status}`, priority: 1 },
        { id: `working-${status}`, api_key: `working-key-${status}`, priority: 2 }
      ];
      const [first, second] = provider.credentials;
      const originalKey = first.api_key;
      const fetchSuccess = globalThis.fetch;
      const searchedKeys = [];
      let rejectFirst = true;
      globalThis.fetch = async (input, init) => {
        if (JSON.parse(init.body).method === "tools/call") {
          searchedKeys.push(init.headers.authorization);
          if (rejectFirst && init.headers.authorization === `Bearer ${originalKey}`) {
            return new Response(null, { status });
          }
        }
        return fetchSuccess(input, init);
      };
      const context = prepare(config);
      assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 502);
      assert.deepEqual(searchedKeys, [`Bearer ${originalKey}`], "do not replay the current search with another credential");
      assert.equal(readProviderCredentialCooldown(provider, first), undefined, "model access must not inherit search-only failures");
      assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
      assert.equal(searchedKeys.at(-1), `Bearer ${second.api_key}`);

      first.api_key = `edited-key-${status}`;
      assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
      assert.equal(searchedKeys.at(-1), `Bearer ${first.api_key}`, "editing a rejected key clears its effective search cooldown");

      first.api_key = originalKey;
      rejectFirst = false;
      now += 60_001;
      assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
      assert.equal(searchedKeys.at(-1), `Bearer ${originalKey}`, "expired cooldowns restore normal priority");
    });
  }
});

test("HTTP server failures do not put pool keys in search refusal cooldown", async () => {
  await withMcp(pages, async () => {
    const config = enabledConfig();
    config.Providers[0].enhancedSearch = { enabled: true };
    config.Providers[0].credentials = [{ id: "server-error", api_key: "server-error-key" }];
    const context = prepare(config);
    const fetchSuccess = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 500 });
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 502);
    globalThis.fetch = fetchSuccess;
    assert.equal((await executeBailianEnhancedSearchSideQuery(context)).statusCode, 200);
  });
});

test("search failures return a redacted Anthropic error and cancellation propagates", async () => {
  await withMcp(pages, async () => {
    globalThis.fetch = async () => { throw new Error("private-upstream-content test-search-key"); };
    const reply = await executeBailianEnhancedSearchSideQuery(prepare());
    assert.equal(reply.statusCode, 502);
    assert.equal(JSON.parse(reply.body).type, "error");
    assert.doesNotMatch(reply.body, /private-upstream-content|test-search-key/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(executeBailianEnhancedSearchSideQuery(prepare(), controller.signal), { name: "AbortError" });
  });
});

test("search results and snippets have bounded reply size", async () => {
  await withMcp(Array.from({ length: 30 }, (_, index) => ({ title: `Result ${index}`, url: `https://example.test/${index}`, snippet: "x".repeat(20_000) })), async () => {
    const reply = await executeBailianEnhancedSearchSideQuery(prepare());
    assert.equal(JSON.parse(reply.body).content[1].content.length, 8);
    assert.ok(Buffer.byteLength(reply.body) < 50_000);
  });
});

test("query normalization strips the dedicated prefix, trims and clamps", () => {
  assert.equal(stripClaudeCodeWebSearchQueryPrefix("Perform a web search for the query: 上海天气"), "上海天气");
  assert.equal(normalizeBailianEnhancedSearchQuery("  claude code  "), "claude code");
  assert.equal(normalizeBailianEnhancedSearchQuery("a"), undefined);
  assert.equal(normalizeBailianEnhancedSearchQuery("x".repeat(600)).length, 500);
});

test("provider enhancedSearch settings parse without retaining disabled empty values", () => {
  const providers = parseProvidersForTest([{ enhancedSearch: { apiKey: "  search-key  ", enabled: true }, models: ["qwen-max"], name: "Bailian", type: "anthropic_messages" }]);
  assert.deepEqual(providers[0].enhancedSearch, { apiKey: "search-key", enabled: true });
  const disabled = parseProvidersForTest([{ enhancedSearch: { enabled: false }, models: ["qwen-max"], name: "Bailian", type: "anthropic_messages" }]);
  assert.equal(disabled[0].enhancedSearch, undefined);
});
