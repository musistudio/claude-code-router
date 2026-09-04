import assert from "node:assert/strict";
import test from "node:test";
import { getOpenRouterProviderCatalog } from "@ccr/core/providers/openrouter-provider-catalog.ts";

test("OpenRouter provider catalog loads provider names and slugs", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  try {
    globalThis.fetch = async (url, init) => {
      requestedUrl = String(url);
      assert.equal(init?.headers?.authorization, undefined);
      return new Response(JSON.stringify({
        data: [
          { name: "OpenAI", slug: "openai" },
          { name: "Google Vertex", slug: "google-vertex" },
          { name: "", slug: "" }
        ]
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    };

    const result = await getOpenRouterProviderCatalog({
      baseUrl: "https://openrouter.ai/api/v1"
    });

    assert.equal(requestedUrl, "https://openrouter.ai/api/v1/providers");
    assert.deepEqual(result.providers, [
      { name: "Google Vertex", slug: "google-vertex" },
      { name: "OpenAI", slug: "openai" }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter provider catalog loads endpoint providers for a model", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  try {
    globalThis.fetch = async (url, init) => {
      requestedUrls.push(String(url));
      if (String(url).includes("/api/v1/activity")) {
        assert.equal(init?.headers?.authorization, "Bearer sk-or-test");
        return new Response(JSON.stringify({
          data: [
            { completion_tokens: 500, model: "anthropic/claude-fable-5", prompt_tokens: 1000, provider_name: "OpenAI" },
            { completion_tokens: 15, model: "anthropic/claude-fable-5", prompt_tokens: 10, provider_name: "Google Vertex" },
            { completion_tokens: 1, model: "openai/gpt-5", prompt_tokens: 1, provider_name: "OpenAI" }
          ]
        }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }
      assert.equal(init?.headers?.authorization, undefined);
      return new Response(JSON.stringify({
        data: {
          endpoints: [
            { provider_name: "OpenAI", quantization: "fp16", tag: "openai/flexible", uptime_last_1d: 0.98 },
            { provider_name: "Google Vertex", provider_slug: "google-vertex", quantization: "bf16", uptime_last_30m: 0.991 },
            { provider_name: "OpenAI", quantization: "fp8", tag: "openai/standard", uptime_last_5m: 0.995 }
          ]
        }
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    };

    const result = await getOpenRouterProviderCatalog({
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-fable-5"
    });

    assert.equal(requestedUrls[0], "https://openrouter.ai/api/v1/models/anthropic/claude-fable-5/endpoints");
    assert.match(requestedUrls[1], /^https:\/\/openrouter\.ai\/api\/v1\/activity\?date=\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(result.providers, [
      { name: "Google Vertex", quantizations: ["bf16"], slug: "google-vertex", tokensYesterday: 25, uptimePercent: 0.991 },
      { name: "OpenAI", quantizations: ["fp16", "fp8"], slug: "openai", tokensYesterday: 1500, uptimePercent: 0.995 }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter provider catalog loads model endpoints without an API key", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  try {
    globalThis.fetch = async (url, init) => {
      requestedUrls.push(String(url));
      assert.equal(init?.headers?.authorization, undefined);
      return new Response(JSON.stringify({
        data: {
          endpoints: [
            { provider_name: "Alibaba", provider_slug: "alibaba", quantization: "fp8", uptime_last_5m: 100 }
          ]
        }
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    };

    const result = await getOpenRouterProviderCatalog({
      baseUrl: "https://openrouter-no-key.test/api/v1",
      model: "z-ai/glm-5.2"
    });

    assert.deepEqual(requestedUrls, ["https://openrouter-no-key.test/api/v1/models/z-ai/glm-5.2/endpoints"]);
    assert.deepEqual(result.providers, [
      { name: "Alibaba", quantizations: ["fp8"], slug: "alibaba", uptimePercent: 100 }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
