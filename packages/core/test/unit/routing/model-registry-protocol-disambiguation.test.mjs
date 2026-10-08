import assert from "node:assert/strict";
import test from "node:test";
import { ModelRegistry } from "@ccr/core/routing/model-registry.ts";

const anthropicOnly = {
  name: "anthropic-only",
  api_base_url: "https://anthropic-only.test",
  models: ["shared-model", "anthropic-only-model"],
  capabilities: [{ type: "anthropic_messages" }]
};

const openaiOnly = {
  name: "openai-only",
  api_base_url: "https://openai-only.test",
  models: ["shared-model", "openai-only-model"],
  capabilities: [
    { type: "openai_chat_completions" },
    { type: "openai_responses" }
  ]
};

const noCapability = {
  name: "no-capability",
  api_base_url: "https://no-capability.test",
  models: ["bare-shared"]
};

function registryWith(...providers) {
  return new ModelRegistry({ Providers: providers, virtualModelProfiles: [] });
}

test("bare id under two disjoint providers: protocol picks the matching owner", () => {
  const registry = registryWith(anthropicOnly, openaiOnly);

  const openaiRef = registry.resolve("shared-model", { protocol: "openai_chat_completions" });
  assert.equal(openaiRef?.provider, openaiOnly);
  assert.equal(openaiRef?.model, "shared-model");

  const anthropicRef = registry.resolve("shared-model", { protocol: "anthropic_messages" });
  assert.equal(anthropicRef?.provider, anthropicOnly);

  // no protocol → stays ambiguous on purpose (pre-existing behavior preserved)
  assert.equal(registry.resolve("shared-model"), undefined);
  // neither provider declares the protocol → no unique resolution
  assert.equal(registry.resolve("shared-model", { protocol: "gemini_generate_content" }), undefined);
});

test("single owner keeps resolving with or without protocol", () => {
  const registry = registryWith(anthropicOnly, openaiOnly);

  assert.equal(registry.resolve("anthropic-only-model")?.provider, anthropicOnly);
  assert.equal(registry.resolve("anthropic-only-model", { protocol: "openai_chat_completions" })?.provider, anthropicOnly);
});

test("providers without capability metadata degrade to the old ambiguous behavior", () => {
  const registry = registryWith(noCapability, { ...noCapability, name: "no-capability-2" });

  assert.equal(registry.resolve("bare-shared", { protocol: "openai_chat_completions" }), undefined);
  assert.equal(registry.resolve("bare-shared"), undefined);
});

test("case-insensitive fallback branch also disambiguates by protocol", () => {
  const a = { name: "ci-a", api_base_url: "https://ci-a.test", models: ["Model-X"], capabilities: [{ type: "anthropic_messages" }] };
  const b = { name: "ci-b", api_base_url: "https://ci-b.test", models: ["MODEL-X"], capabilities: [{ type: "openai_chat_completions" }] };
  const registry = registryWith(a, b);

  assert.equal(registry.resolve("model-x", { protocol: "openai_chat_completions" })?.provider, b);
  assert.equal(registry.resolve("model-x", { protocol: "anthropic_messages" })?.provider, a);
  assert.equal(registry.resolve("model-x"), undefined);
});
