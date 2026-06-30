import assert from "node:assert/strict";
import test from "node:test";
import { buildCodexModelCatalog } from "../../src/main/codex-model-catalog.ts";

function catalogModelFor(config, slug) {
  const catalog = buildCodexModelCatalog(config, slug);
  const model = catalog.models.find((item) => item.slug === slug);
  assert.ok(model, `expected catalog model ${slug}`);
  return model;
}

test("codex catalog treats unknown models as text-only without advanced tools", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "Custom", type: "openai_chat_completions", models: ["unknown-model"] }
    ]
  }, "Custom/unknown-model");

  assert.deepEqual(model.input_modalities, ["text"]);
  assert.equal(model.supports_search_tool, false);
  assert.equal(model.supports_parallel_tool_calls, false);
  assert.equal(model.supports_reasoning_summaries, false);
  assert.equal(model.supports_image_detail_original, false);
  assert.deepEqual(model.supported_reasoning_levels, []);
  assert.equal(model.default_reasoning_level, null);
  assert.equal(model.apply_patch_tool_type, null);
});

test("codex catalog uses model catalog capabilities for known text models", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "deepseek", type: "openai_chat_completions", models: ["deepseek-chat"] }
    ]
  }, "deepseek/deepseek-chat");

  assert.deepEqual(model.input_modalities, ["text"]);
  assert.equal(model.supports_parallel_tool_calls, true);
  assert.equal(model.supports_search_tool, false);
  assert.equal(model.supports_reasoning_summaries, false);
  assert.equal(model.supports_image_detail_original, false);
  assert.deepEqual(model.supported_reasoning_levels, []);
  assert.equal(model.default_reasoning_level, null);
  assert.equal(model.apply_patch_tool_type, null);
});

test("codex catalog enables multimodal reasoning and search when provider protocol supports it", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "openrouter", type: "openai_responses", models: ["google/gemini-2.5-pro"] }
    ]
  }, "openrouter/google/gemini-2.5-pro");

  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.equal(model.supports_image_detail_original, true);
  assert.equal(model.supports_parallel_tool_calls, true);
  assert.equal(model.supports_reasoning_summaries, true);
  assert.equal(model.supports_search_tool, true);
  assert.equal(model.web_search_tool_type, "text_and_image");
  assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), ["low", "medium", "high"]);
  assert.equal(model.default_reasoning_level, "medium");
  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog does not expose native search through chat-completions-only providers", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "openrouter", type: "openai_chat_completions", models: ["google/gemini-2.5-pro"] }
    ]
  }, "openrouter/google/gemini-2.5-pro");

  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.equal(model.supports_parallel_tool_calls, true);
  assert.equal(model.supports_reasoning_summaries, true);
  assert.equal(model.supports_search_tool, false);
  assert.equal(model.web_search_tool_type, "text");
  assert.equal(model.apply_patch_tool_type, null);
});

test("codex catalog keeps freeform apply_patch for GPT-named chat-compatible models", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "gateway", type: "openai_chat_completions", models: ["gpt-compatible-coder"] }
    ]
  }, "gateway/gpt-compatible-coder");

  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog keeps freeform apply_patch when provider advertises Responses capability", () => {
  const model = catalogModelFor({
    Providers: [
      {
        capabilities: [
          { baseUrl: "https://openrouter.ai/api/v1", type: "openai_chat_completions" },
          { baseUrl: "https://openrouter.ai/api/v1", type: "openai_responses" }
        ],
        name: "openrouter",
        type: "openai_chat_completions",
        models: ["google/gemini-2.5-pro"]
      }
    ]
  }, "openrouter/google/gemini-2.5-pro");

  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog marks Fusion aliases with builtin web search as searchable", () => {
  const model = catalogModelFor({
    Providers: [],
    virtualModelProfiles: [
      {
        displayName: "Research Fusion",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchWebSearch: false,
          maxToolCalls: 4,
          maxTurns: 4,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "research-fusion",
        key: "research",
        match: { exactAliases: ["research"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionWebSearch: { provider: "brave", toolName: "web_search_research" }
        },
        tools: [{ name: "web_search_research", visibility: "internal" }]
      }
    ]
  }, "Fusion/research");

  assert.deepEqual(model.input_modalities, ["text"]);
  assert.equal(model.supports_search_tool, true);
  assert.equal(model.web_search_tool_type, "text");
  assert.equal(model.apply_patch_tool_type, null);
});

test("codex catalog marks prefixed Fusion virtual models with legacy web search tools as searchable", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "deepseek", type: "openai_chat_completions", models: ["deepseek-chat"] }
    ],
    virtualModelProfiles: [
      {
        displayName: "Web Prefix",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          maxToolCalls: 4,
          maxTurns: 4,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "web-prefix",
        key: "web-prefix",
        match: { exactAliases: [], prefixes: ["web-"], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        tools: [{ name: "web_search", visibility: "internal" }]
      }
    ]
  }, "deepseek/web-deepseek-chat");

  assert.deepEqual(model.input_modalities, ["text"]);
  assert.equal(model.supports_search_tool, true);
  assert.equal(model.web_search_tool_type, "text");
  assert.equal(model.apply_patch_tool_type, null);
});
