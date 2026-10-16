import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { buildClaudeAppGatewayModelRoutes } from "@ccr/core/agents/claude-app/gateway-routes.ts";
import { createClaudeCliBootstrapResponse } from "@ccr/core/gateway/features/model-discovery.ts";
import { buildCodexModelCatalog } from "@ccr/core/agents/codex/model-catalog.ts";
import { getProviderCatalogModels } from "@ccr/core/providers/model-catalog.ts";

// Catalog mapping assertions use stable input while the bundled catalog follows live sources.
process.env.CCR_MODEL_CATALOG_PATH = path.resolve("packages/core/test/fixtures/model-catalog.json");

test("provider model catalog exposes models.json settings as editable defaults", () => {
  const catalog = getProviderCatalogModels({
    baseUrl: "https://api.anthropic.com",
    providerPresetId: "anthropic"
  });
  const metadata = catalog.modelMetadata?.["claude-sonnet-4-20250514"];

  assert.ok(catalog.models.includes("claude-sonnet-4-20250514"));
  assert.equal(metadata?.contextWindow, 1_000_000);
  assert.equal(metadata?.maxOutputTokens, 64_000);
  assert.equal(metadata?.capabilities?.imageInput, true);
  assert.equal(metadata?.pricing?.inputUsdPerMillionTokens, 3);
  assert.equal(metadata?.pricing?.outputUsdPerMillionTokens, 15);
  assert.equal(metadata?.pricing?.cacheReadUsdPerMillionTokens, 0.3);
  assert.equal(metadata?.pricing?.cacheWrite5mUsdPerMillionTokens, 3.75);
  assert.equal(metadata?.pricing?.cacheWrite1hUsdPerMillionTokens, 6);
});

test("provider model catalog maps preset aliases to models.json defaults", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "kimi-coding" });
  const metadata = catalog.modelMetadata?.["kimi-for-coding"];

  assert.deepEqual(catalog.models, ["kimi-for-coding"]);
  assert.equal(metadata?.contextWindow, 1_048_576);
  assert.equal(metadata?.capabilities?.imageInput, true);
});

test("provider model catalog exposes reasoning, web search, and image presets", () => {
  const catalog = getProviderCatalogModels({ providerPresetId: "openai" });
  const metadata = catalog.modelMetadata?.["gpt-5"];

  assert.deepEqual(metadata?.supportedReasoningLevels?.map((level) => level.effort), [
    "low",
    "medium",
    "high"
  ]);
  assert.equal(metadata?.capabilities?.webSearch, true);
  assert.equal(metadata?.capabilities?.imageInput, true);
});

test("Claude CLI bootstrap returns catalog-derived model configuration from models.json", () => {
  const config = {
    profile: { enabled: true, profiles: [] },
    virtualModelProfiles: [],
    Providers: [
      {
        models: ["glm-5.2"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ]
  };
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const bootstrap = createClaudeCliBootstrapResponse(config);
  const option = bootstrap.additional_model_options[0];

  assert.ok(route);
  assert.equal(option.id, `${route.id}[1m]`);
  assert.equal(option.model, `${route.id}[1m]`);
  assert.equal(option.display_name, "Zhipu AI (China) - Coding Plan/GLM-5.2 (1M context)");
  assert.equal(option.max_input_tokens, 1_049_000);
  assert.equal(option.max_tokens, 1_048_576);
  assert.equal(option.capabilities.context_window.max_input_tokens, 1_049_000);
  assert.equal(option.capabilities.context_management.max_input_tokens, 1_049_000);
  assert.equal(option.capabilities.context_window.supports_1m_context, true);
  assert.equal(option.capabilities.context_window.one_million_context_variant, true);
  assert.equal(option.capabilities.image_input.supported, true);
  assert.equal(option.capabilities.structured_outputs.supported, true);
  assert.equal(option.capabilities.tool_use.supported, true);
  assert.equal(option.capabilities.thinking.supported, true);
  assert.equal(bootstrap.auto_compact_windows[option.model], 1_000_000);
  assert.equal(bootstrap.client_data.rowan_thicket[option.model], 1_000_000);
});

function catalogModelFor(config, slug) {
  const model = buildCodexModelCatalog(config, slug).models.find(item => item.slug === slug);
  assert.ok(model, `expected catalog model ${slug}`);
  return model;
}

test("codex catalog enables multimodal reasoning and search when provider protocol supports it", () => {
  const model = catalogModelFor({
    Providers: [
      {
        name: "openrouter",
        type: "openai_responses",
        models: ["google/gemini-2.5-pro"],
        modelMetadata: { "google/gemini-2.5-pro": { supportsReasoningSummaries: true } }
      }
    ]
  }, "openrouter/google/gemini-2.5-pro");

  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.equal(model.supports_image_detail_original, true);
  assert.equal(model.supports_parallel_tool_calls, true);
  assert.equal(model.supports_reasoning_summaries, true);
  assert.equal(model.supports_search_tool, true);
  assert.equal(model.web_search_tool_type, "text_and_image");
  assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), [
    "low",
    "medium",
    "high"
  ]);
  assert.equal(model.default_reasoning_level, null);
  assert.equal(model.apply_patch_tool_type, "freeform");
});


test("codex catalog omits native search but enables apply_patch for non-GPT chat-completions models", () => {
  const model = catalogModelFor({
    Providers: [
      {
        name: "openrouter",
        type: "openai_chat_completions",
        models: ["google/gemini-2.5-pro"],
        modelMetadata: { "google/gemini-2.5-pro": { supportsReasoningSummaries: true } }
      }
    ]
  }, "openrouter/google/gemini-2.5-pro");

  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.equal(model.supports_parallel_tool_calls, true);
  assert.equal(model.supports_reasoning_summaries, true);
  assert.equal(model.supports_search_tool, false);
  assert.equal(model.web_search_tool_type, "text");
  assert.equal(model.apply_patch_tool_type, "freeform");
});
