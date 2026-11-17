import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/router-plugin.ts";

const body = { safeguards: { strict: true }, messages: [{ role: "user", content: "hi" }], tools: [
  { name: "t", defer_loading: true, input_schema: { type: "object", properties: { defer_loading: { type: "boolean" } } } },
  { type: "function", function: { name: "f", defer_loading: false, parameters: { type: "object" } } },
  { type: "namespace", name: "nested", tools: [{ name: "inner", defer_loading: true, input_schema: { type: "object" } }] }
] };
test("#1912 deferred-tool compatibility edits only the selected attempt and preserves schemas", async () => {
  const config = createDefaultAppConfig();
  config.Providers = [{ id: "old", name: "Old", type: "anthropic_messages", models: ["m"], supportsDeferredTools: false },
    { id: "new", name: "New", type: "anthropic_messages", models: ["m"] }];
  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const hook = plugin.providerHooks.find(hook => hook.key === "ccr-deferred-tool-compatibility");
  const upstreamRequest = { method: "POST", url: "https://test.invalid/messages", body: JSON.stringify(body) };
  const result = hook.transformRequest({ upstreamRequest, targetProviderConfig: { name: "old::anthropic_messages::cred:key" } });
  assert.equal(result.ok, true);
  const clean = JSON.parse(result.value.body);
  assert.equal(clean.tools.length, 3);
  assert.equal(clean.tools[0].defer_loading, undefined);
  assert.equal(clean.tools[1].function.defer_loading, undefined);
  assert.equal(clean.tools[2].tools[0].defer_loading, undefined);
  assert.deepEqual(clean.tools[0].input_schema, body.tools[0].input_schema);
  assert.deepEqual(clean.safeguards, body.safeguards);
  assert.deepEqual(JSON.parse(upstreamRequest.body), body);
  const next = hook.transformRequest({ upstreamRequest, targetProviderConfig: { name: "new" } });
  assert.equal(next.value, upstreamRequest, "a later compatible fallback provider receives the original flags");
  const jsonBody = hook.transformRequest({ upstreamRequest: { ...upstreamRequest, body, bodyEncoding: "json" }, targetProviderConfig: { name: "old" } });
  assert.deepEqual(jsonBody.value.body, clean, "JSON-encoded object bodies must not be serialized twice");
});
