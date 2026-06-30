import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderDeepLinkRequest,
  isAppDeepLinkUrl,
  parseProviderDeepLinkPayload,
  parseProviderManifestDeepLinkPayload,
  parseProviderManifestPayload
} from "../src/shared/deep-link.ts";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test("parseProviderDeepLinkPayload reads payload JSON, models, display names, and usage account mapping", () => {
  const payload = {
    account: {
      connectors: {
        auth: "provider-api-key",
        endpoint: "https://usage.example.com/balance",
        mapping: { meters: [{ id: "balance", kind: "balance", remaining: "$.balance" }] },
        type: "http-json"
      },
      enabled: true,
      refreshIntervalMs: 60000
    },
    api_key: "sk-test",
    base_url: "https://api.example.com/v1",
    fetch_usage: true,
    model_display_names: {
      "model-a": "Model A"
    },
    models: [
      { displayName: "Model B", id: "model-b" },
      "model-a,model-c"
    ],
    name: "Example AI",
    protocol: "openai_chat_completions",
    source: "https://example.com/install"
  };

  const parsed = parseProviderDeepLinkPayload(`ccr://provider?payload=${base64UrlJson(payload)}`);

  assert.equal(parsed.name, "Example AI");
  assert.equal(parsed.baseUrl, "https://api.example.com/v1");
  assert.equal(parsed.apiKey, "sk-test");
  assert.equal(parsed.protocol, "openai_chat_completions");
  assert.deepEqual(parsed.models, ["model-b", "model-a", "model-c"]);
  assert.deepEqual(parsed.modelDisplayNames, {
    "model-a": "Model A",
    "model-b": "Model B"
  });
  assert.equal(parsed.account?.enabled, true);
  assert.equal(parsed.account?.refreshIntervalMs, 60000);
  assert.equal(parsed.account?.connectors?.[0]?.type, "http-json");
});

test("parseProviderDeepLinkPayload builds usage account config from query params", () => {
  const usageHeaders = encodeURIComponent(JSON.stringify({ "x-usage": "yes", ignored: 123 }));
  const parsed = parseProviderDeepLinkPayload(
    [
      "ccr://provider?name=Query%20AI",
      "base_url=https%3A%2F%2Fapi.example.com%2Fv1",
      "models=model-a%2Cmodel-b",
      "models=model-b%0Amodel-c",
      "fetch_usage=true",
      "usage_url=https%3A%2F%2Fusage.example.com%2Fme",
      "usage_method=post",
      `usage_headers=${usageHeaders}`,
      "balance=%24.balance.remaining",
      "balance_unit=CNY",
      "subscription=%24.quota.remaining",
      "subscription_limit=%24.quota.limit"
    ].join("&")
  );

  assert.deepEqual(parsed.models, ["model-a", "model-b", "model-c"]);
  const connector = parsed.account?.connectors?.[0];
  assert.equal(connector?.type, "http-json");
  assert.equal(connector?.method, "POST");
  assert.deepEqual(connector?.headers, { "x-usage": "yes" });
  assert.equal(connector?.mapping.meters.length, 2);
  assert.equal(connector?.mapping.meters[0].unit, "CNY");
});

test("provider deeplink manifest parsing accepts only HTTPS manifest URLs", () => {
  assert.equal(isAppDeepLinkUrl(" ccr://provider?base_url=https://api.example.com "), true);
  assert.deepEqual(
    parseProviderManifestDeepLinkPayload("ccr://provider?manifest=https%3A%2F%2Fexample.com%2Fccr.json"),
    { url: "https://example.com/ccr.json" }
  );
  assert.throws(
    () => parseProviderManifestDeepLinkPayload("ccr://provider?manifest=http%3A%2F%2Fexample.com%2Fccr.json"),
    /must use https/
  );
});

test("createProviderDeepLinkRequest captures parsing errors without throwing", () => {
  const request = createProviderDeepLinkRequest("https://example.com/not-ccr", new Date("2026-06-30T00:00:00.000Z"));

  assert.equal(request.rawUrl, "https://example.com/not-ccr");
  assert.equal(request.receivedAt, "2026-06-30T00:00:00.000Z");
  assert.match(request.error ?? "", /Unsupported link protocol/);
});

test("parseProviderManifestPayload accepts provider wrappers and source fallback", () => {
  const parsed = parseProviderManifestPayload(
    {
      provider: {
        base_url: "https://api.example.com/v1",
        models: [{ display_name: "Display Model", id: "display-model" }],
        name: "Manifest AI"
      }
    },
    "https://example.com/manifest.json"
  );

  assert.equal(parsed.name, "Manifest AI");
  assert.equal(parsed.source, "https://example.com/manifest.json");
  assert.deepEqual(parsed.models, ["display-model"]);
  assert.deepEqual(parsed.modelDisplayNames, { "display-model": "Display Model" });
});
