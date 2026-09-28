import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog.ts";
import { providerCapabilityForClientProtocol } from "@ccr/core/providers/runtime-topology.ts";
import { createClaudeCliAutoCompactWindows } from "@ccr/core/gateway/features/model-discovery.ts";

const baseUrl = "https://openrouter.ai/api/v1";
const provider = {
  name: "OpenRouter", api_base_url: baseUrl,
  models: ["minimax/minimax-m3", "openrouter/minimax/minimax-m3"],
  capabilities: ["anthropic_messages", "openai_chat_completions", "openai_responses"].map((type) => ({ type, baseUrl }))
};

test("#1779 OpenRouter exact source limits override cross-provider merged maxima", () => {
  const metadata = getProviderCatalogModels({ providerPresetId: "openrouter" }).modelMetadata;
  const exact = metadata["minimax/minimax-m3"];
  const aggregate = metadata["openrouter/minimax/minimax-m3"];
  assert.ok(exact?.contextWindow);
  assert.ok(aggregate?.contextWindow);
  assert.ok(exact.contextWindow < aggregate.contextWindow);
});

test("#1779 Claude context cache uses provider limits and explicit discovery overrides", () => {
  const config = { ...createDefaultAppConfig(), Providers: [provider] };
  let windows = createClaudeCliAutoCompactWindows(config);
  assert.equal(windows["OpenRouter/minimax/minimax-m3"], 524288);
  assert.equal(windows["OpenRouter/openrouter/minimax/minimax-m3"], 1000000);
  config.Providers = [{ ...provider, models: ["minimax/minimax-m3:free"], modelMetadata: {
    "minimax/minimax-m3:free": { contextWindow: 1000000 }
  } }];
  windows = createClaudeCliAutoCompactWindows(config);
  assert.equal(windows["OpenRouter/minimax/minimax-m3:free"], 1000000);
});

test("#1779 OpenRouter prefers Chat for Anthropic clients without overriding single-protocol choices", () => {
  assert.equal(providerCapabilityForClientProtocol(provider, "anthropic_messages").type, "openai_chat_completions");
  assert.equal(providerCapabilityForClientProtocol({ ...provider, capabilities: [provider.capabilities[0]] }, "anthropic_messages").type, "anthropic_messages");
  assert.equal(providerCapabilityForClientProtocol({
    ...provider, api_base_url: "https://example.test/v1",
    capabilities: provider.capabilities.map((item) => ({ ...item, baseUrl: "https://example.test/v1" }))
  }, "anthropic_messages").type, "anthropic_messages");
});
