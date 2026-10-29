import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const route = new AsyncFunction("input", "api", readFileSync(path.resolve("examples/routing/nadir.js"), "utf8"));
const input = { model: "auto", tokenCount: 20, summary: { lastUserText: "Rename foo to bar in utils.py", hasImage: false, toolNames: [] } };
const baseEnv = { CCR_NADIR_ROUTING_ENABLED: "1", CCR_NADIR_SIMPLE_MODEL: "local/small", CCR_NADIR_COMPLEX_MODEL: "local/large" };
const api = (bucket, env = baseEnv, seen = {}) => ({ env: name => env[name], fetch: async (url, request) => {
  seen.url = url;
  seen.headers = request.headers;
  const body = JSON.parse(request.body);
  assert.deepEqual(Object.keys(body).sort(), ["prompt", "source"]);
  assert.equal(body.source, "claude-code-router");
  return { ok: true, body: JSON.stringify({ bucket }) };
} });

test("Nadir example maps each bucket to a configured model", async () => {
  assert.deepEqual(await route(input, api("simple")), { model: "local/small" });
  assert.deepEqual(await route(input, api("complex")), { model: "local/large" });
  assert.deepEqual(await route(input, api("medium")), { model: "local/large" }, "medium falls back to the complex model");
  assert.deepEqual(await route(input, api("medium", { ...baseEnv, CCR_NADIR_MEDIUM_MODEL: "local/mid" })), { model: "local/mid" });
  for (const bucket of ["reasoning", "toString", undefined, 3]) assert.equal(await route(input, api(bucket)), null);
});

test("Nadir example sends the key only when set and normalizes the base URL", async () => {
  const keyless = {};
  await route(input, api("simple", baseEnv, keyless));
  assert.equal(keyless.url, "https://api.getnadir.com/v1/bucket");
  assert.equal(keyless.headers["x-api-key"], undefined);
  const keyed = {};
  await route(input, api("simple", { ...baseEnv, NADIR_API_KEY: "test-only", CCR_NADIR_BASE_URL: "http://nadir.internal:8000/v1/" }, keyed));
  assert.equal(keyed.url, "http://nadir.internal:8000/v1/bucket");
  assert.equal(keyed.headers["x-api-key"], "test-only");
});

test("Nadir example skips disabled, explicit-model and image requests and fails open", async () => {
  let calls = 0;
  const noFetch = { env: name => baseEnv[name], fetch: async () => { calls += 1; throw new Error("unavailable"); } };
  assert.equal(await route({ ...input, model: "local/explicit" }, noFetch), null);
  assert.equal(await route({ ...input, summary: { ...input.summary, hasImage: true } }, noFetch), null);
  assert.equal(await route({ ...input, summary: { ...input.summary, lastUserText: "  " } }, noFetch), null);
  assert.equal(await route(input, { ...noFetch, env: () => undefined }), null);
  assert.equal(calls, 0);
  assert.equal(await route(input, noFetch), null);
  assert.equal(await route(input, { ...noFetch, fetch: async () => ({ ok: false }) }), null);
  assert.equal(await route(input, { ...noFetch, fetch: async () => ({ ok: true, body: "invalid json" }) }), null);
});
