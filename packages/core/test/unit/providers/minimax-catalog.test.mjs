import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog.ts";
import { probeGatewayProvider } from "@ccr/core/providers/probe.ts";

process.env.CCR_MODEL_CATALOG_PATH = path.resolve("packages/core/test/fixtures/minimax-provider-catalog.json");

test("MiniMax built-ins stay current even when the bundled catalog contains retired models", () => {
  for (const providerPresetId of ["minimax-global", "minimax-cn"]) {
    assert.deepEqual(getProviderCatalogModels({ providerPresetId }).models, ["MiniMax-M3.1-Flash", "MiniMax-M3"]);
  }
  for (const baseUrl of ["https://api.minimax.io/v1", "https://api.minimaxi.com/anthropic"]) {
    assert.deepEqual(getProviderCatalogModels({ baseUrl }).models, ["MiniMax-M3.1-Flash", "MiniMax-M3"]);
  }
});

test("known gateway catalogs hide retired MiniMax text without inventing available routes", () => {
  const openrouter = getProviderCatalogModels({ providerPresetId: "openrouter" });
  assert.deepEqual(openrouter.models, [
    "anthropic/claude-sonnet-4", "minimax/minimax-m3.1-flash:free", "minimax/minimax-m3"
  ]);
  assert.equal(openrouter.modelMetadata?.["minimax/minimax-m2.7"], undefined);
  assert.deepEqual(getProviderCatalogModels({ providerPresetId: "opencode" }).models, ["minimax-m3"]);
  assert.deepEqual(getProviderCatalogModels({ providerPresetId: "custom-router" }).models, ["minimax/minimax-m2.7"]);
});

test("live model discovery filters only known providers and preserves explicit model choices", async () => {
  const originalFetch = globalThis.fetch;
  const ids = ["minimax/minimax-m2.7", "minimax/minimax-m3", "minimax/minimax-m3.1-flash:free", "minimax/speech-02-hd", "other/model", "m3-independent"];
  let responseIds = ids;
  const requestedModels = [];
  globalThis.fetch = async (_url, init) => {
    if (typeof init?.body === "string") requestedModels.push(JSON.parse(init.body).model);
    return new Response(JSON.stringify({ data: responseIds.map((id) => ({ id, name: id })) }), {
      headers: { "content-type": "application/json" }, status: 200
    });
  };
  try {
    for (const baseUrl of ["https://openrouter.ai/api/v1", "https://opencode.ai/zen/v1"]) {
      const request = { baseUrl, mode: "models", protocols: ["openai_chat_completions"], forceRefresh: true };
      const result = await probeGatewayProvider(request);
      assert.equal(result.models.includes(ids[0]), false);
      assert.equal(result.modelDisplayNames?.[ids[0]], undefined);
      for (const id of ids.slice(1)) assert.ok(result.models.includes(id), id);
      requestedModels.length = 0;
      await probeGatewayProvider({ ...request, mode: "connectivity", models: [ids[0]] });
      assert.ok(requestedModels.includes(ids[0]), "explicit saved model still reaches the request transport");
    }
    const custom = await probeGatewayProvider({ baseUrl: "https://custom.invalid/v1", mode: "models", protocols: ["openai_chat_completions"], forceRefresh: true });
    assert.ok(custom.models.includes(ids[0]));
    responseIds = ["MiniMax-M2.7", "MiniMax-M3.1-Flash", "MiniMax-M3", "speech-02-hd"];
    for (const baseUrl of ["https://api.minimax.io/v1", "https://api.minimaxi.com/v1"]) {
      const direct = await probeGatewayProvider({ baseUrl, mode: "models", protocols: ["openai_chat_completions"], forceRefresh: true });
      assert.deepEqual([...direct.models].sort(), responseIds.slice(1).sort());
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
