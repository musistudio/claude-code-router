import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const route = new AsyncFunction("input", "api", readFileSync(path.resolve("examples/routing/jev.js"), "utf8"));
const input = { model: "auto", tokenCount: 20, summary: { lastUserText: "Debug an intermittent deadlock", hasImage: false, toolNames: [] } };
const env = { CCR_JEV_ROUTING_ENABLED: "1", CCR_JEV_FAST_MODEL: "local/small", CCR_JEV_REASONING_MODEL: "local/large", TYPESAFE_API_KEY: "test-only" };
const api = (answer, extra = {}) => ({ env: name => env[name], fetch: async (_url, request) => {
  const body = JSON.parse(request.body);
  assert.equal(body.questions.route.type, "choice");
  assert.deepEqual(Object.keys(body.state).sort(), ["inputTokens", "task", "toolCount"]);
  return { ok: true, body: JSON.stringify({ answers: { route: answer } }) };
}, ...extra });

test("#1822 Jev example selects only configured models and limits state sent to the classifier", async () => {
  assert.deepEqual(await route(input, api({ type: "choice", choice: "reasoning", confidence: 0.9 })), { model: "local/large" });
  for (const answer of [{ type: "choice", choice: "fast", confidence: 0.1 }, { type: "choice", choice: "unconfigured", confidence: 1 }, { type: "choice", choice: "toString", confidence: 1 }, { type: "choice", choice: "fast" }]) {
    assert.equal(await route(input, api(answer)), null);
  }
});

test("#1822 Jev example skips disabled and explicit-model requests and fails open", async () => {
  let calls = 0;
  const noFetch = api(null, { fetch: async () => { calls += 1; throw new Error("unavailable"); } });
  assert.equal(await route({ ...input, model: "local/explicit" }, noFetch), null);
  assert.equal(await route(input, { ...noFetch, env: () => undefined }), null);
  assert.equal(calls, 0);
  assert.equal(await route(input, noFetch), null);
  assert.equal(await route(input, api(null, { fetch: async () => ({ ok: false }) })), null);
  assert.equal(await route(input, api(null, { fetch: async () => ({ ok: true, body: "invalid json" }) })), null);
});
