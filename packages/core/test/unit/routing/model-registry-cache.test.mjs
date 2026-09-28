import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { ModelRegistry, providerRuntimeId } from "@ccr/core/routing/model-registry.ts";

test("#1777 provider lookup reuses hashed identities across full scans", (t) => {
  const providers = Array.from({ length: 46 }, (_, index) => ({
    name: `provider-${index}`, api_base_url: `https://provider-${index}.test/v1`, models: ["model"]
  }));
  const registry = new ModelRegistry({ Providers: providers, virtualModelProfiles: [] });
  const hash = t.mock.method(crypto, "createHash");
  assert.equal(registry.findProvider("missing"), undefined);
  const initialCalls = hash.mock.callCount();
  assert.equal(initialCalls, 46);
  for (let repeat = 0; repeat < 100; repeat++) {
    assert.equal(registry.findProvider("missing"), undefined);
    assert.equal(registry.findProvider("PROVIDER-45::openai_chat_completions::cred:key"), providers[45]);
  }
  assert.equal(hash.mock.callCount(), initialCalls);
});

test("#1777 cached identities retain first-enabled precedence and reflect configuration edits", () => {
  const first = { name: "First", provider: "shared", models: ["first"], api_base_url: "https://first.test" };
  const second = { name: "Second", provider: "shared", models: ["second"] };
  const registry = new ModelRegistry({ Providers: [first, second], virtualModelProfiles: [] });
  assert.equal(registry.findProvider("shared"), first);
  const oldRuntimeId = providerRuntimeId(first);
  assert.equal(registry.findProvider(oldRuntimeId), first);
  first.name = "Renamed";
  first.provider = "new-family";
  first.api_base_url = "https://new.test";
  assert.equal(registry.findProvider("First"), undefined);
  assert.equal(registry.findProvider(oldRuntimeId), undefined);
  assert.equal(registry.findProvider(providerRuntimeId(first)), first);
  assert.equal(registry.findProvider("shared"), second);
  first.id = "explicit-id";
  assert.equal(registry.findProvider("explicit-id"), first);
  first.enabled = false;
  assert.equal(registry.findProvider("explicit-id"), undefined);
});
