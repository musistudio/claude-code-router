import assert from "node:assert/strict";
import test from "node:test";

test("top-level provider protocol becomes a capability when none are configured", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Codex API",
      protocol: "openai_responses",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      models: ["gpt-5.5"]
    }
  ]);

  assert.equal(providers?.length, 1);
  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://chatgpt.com/backend-api/codex", type: "openai_responses" }
  ]);
});

test("provider auto model refresh flag is parsed from camel and snake case config", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      autoFetchKnownModels: ["model-a", "model-hidden"],
      autoFetchModels: true,
      baseUrl: "https://api.example.test/v1",
      models: ["model-a"],
      name: "Camel"
    },
    {
      auto_fetch_known_models: "model-b,model-hidden",
      auto_fetch_models: true,
      baseUrl: "https://api.example.test/v1",
      models: ["model-b"],
      name: "Snake"
    }
  ]);

  assert.equal(providers[0].autoFetchModels, true);
  assert.deepEqual(providers[0].autoFetchKnownModels, ["model-a", "model-hidden"]);
  assert.equal(providers[1].autoFetchModels, true);
  assert.deepEqual(providers[1].autoFetchKnownModels, ["model-b", "model-hidden"]);
});

test("explicit capabilities win over the top-level protocol", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Codex API",
      protocol: "openai_responses",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      capabilities: [
        { type: "openai_chat_completions", baseUrl: "https://example.com/v1" }
      ],
      models: []
    }
  ]);

  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://example.com/v1", endpoint: undefined, source: undefined, type: "openai_chat_completions" }
  ]);
});

test("protocol aliases are normalized", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Claude Code API",
      protocol: "anthropic_messages",
      baseUrl: "https://api.anthropic.com",
      models: []
    }
  ]);

  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://api.anthropic.com", type: "anthropic_messages" }
  ]);
});

test("unknown or missing protocol yields no synthesized capability", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { name: "DeepInfra", api_base_url: "https://api.deepinfra.com/v1/openai", models: [] },
    { name: "Mystery", protocol: "carrier_pigeon", baseUrl: "https://example.com", models: [] }
  ]);

  assert.equal(providers[0].capabilities, undefined);
  assert.equal(providers[1].capabilities, undefined);
});

test("protocol without any base URL yields no synthesized capability", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { name: "Codex API", protocol: "openai_responses", models: [] }
  ]);

  assert.equal(providers[0].capabilities, undefined);
});
