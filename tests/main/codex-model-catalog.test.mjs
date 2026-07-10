import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCodexModelCatalog } from "../../packages/core/src/agents/codex/model-catalog.ts";

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
  assert.deepEqual(model.supported_reasoning_levels, []);
  assert.equal(model.default_reasoning_level, null);
  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog uses provider-specific reasoning effort levels when declared", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "openrouter", type: "openai_responses", models: ["z-ai/glm-5.2"] }
    ]
  }, "openrouter/z-ai/glm-5.2");

  assert.equal(model.supports_reasoning_summaries, true);
  assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), ["xhigh", "high"]);
  assert.equal(model.default_reasoning_level, "high");
});

test("codex catalog provides GPT reasoning levels for Codex API models", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "Codex API", type: "openai_responses", models: ["gpt-5.5"] }
    ]
  }, "Codex API/gpt-5.5");

  assert.equal(model.supports_reasoning_summaries, true);
  assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), ["minimal", "low", "medium", "high"]);
  assert.equal(model.default_reasoning_level, "medium");
});

test("codex catalog does not merge reasoning efforts from unrelated providers", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "wrapped-zhipu", type: "openai_responses", models: ["glm-5.2"] }
    ]
  }, "wrapped-zhipu/glm-5.2");

  assert.equal(model.supports_reasoning_summaries, true);
  assert.deepEqual(model.supported_reasoning_levels, []);
  assert.equal(model.default_reasoning_level, null);
});

test("codex catalog uses provider model metadata for reasoning effort and speed tiers", () => {
  const model = catalogModelFor({
    Providers: [
      {
        modelMetadata: {
          "gpt-5-codex": {
            additionalSpeedTiers: [{ id: "fast", label: "Fast" }],
            defaultReasoningLevel: "high",
            defaultReasoningSummary: "auto",
            serviceTiers: [{ id: "auto" }],
            supportedReasoningLevels: [
              { description: "Low", effort: "low" },
              { description: "High", effort: "high" }
            ],
            supportsReasoningSummaries: true
          }
        },
        models: ["gpt-5-codex"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  }, "Codex API/gpt-5-codex");

  assert.deepEqual(model.additional_speed_tiers, [{ id: "fast", label: "Fast" }]);
  assert.equal(model.default_reasoning_level, "high");
  assert.equal(model.default_reasoning_summary, "auto");
  assert.deepEqual(model.service_tiers, [{ id: "auto" }]);
  assert.deepEqual(model.supported_reasoning_levels, [
    { description: "Low", effort: "low" },
    { description: "High", effort: "high" }
  ]);
  assert.equal(model.supports_reasoning_summaries, true);
});

test("codex catalog falls back to local Codex model cache metadata", () => {
  const previousCcrHome = process.env.CCR_INTERNAL_HOME_DIR;
  const previousHome = process.env.HOME;
  const home = mkdtempSync(path.join(os.tmpdir(), "ccr-codex-model-catalog-"));
  try {
    process.env.CCR_INTERNAL_HOME_DIR = home;
    process.env.HOME = home;
    const codexHome = path.join(home, ".codex");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(path.join(codexHome, "models_cache.json"), JSON.stringify({
      models: [
        {
          additional_speed_tiers: [{ id: "fast", label: "Fast" }],
          default_reasoning_level: "high",
          service_tiers: [{ id: "auto" }],
          slug: "gpt-5-codex",
          supported_reasoning_levels: [
            { description: "Low", effort: "low" },
            { description: "High", effort: "high" }
          ],
          supports_reasoning_summaries: true
        }
      ]
    }));

    const model = catalogModelFor({
      Providers: [
        {
          api_base_url: "https://chatgpt.com/backend-api/codex",
          api_key: "ccr-local-agent-login",
          models: ["gpt-5-codex"],
          name: "Codex API",
          type: "openai_responses"
        }
      ]
    }, "Codex API/gpt-5-codex");

    assert.deepEqual(model.additional_speed_tiers, [{ id: "fast", label: "Fast" }]);
    assert.equal(model.default_reasoning_level, "high");
    assert.deepEqual(model.service_tiers, [{ id: "auto" }]);
    assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), ["low", "high"]);
  } finally {
    if (previousCcrHome === undefined) {
      delete process.env.CCR_INTERNAL_HOME_DIR;
    } else {
      process.env.CCR_INTERNAL_HOME_DIR = previousCcrHome;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { force: true, recursive: true });
  }
});

test("codex catalog enables native search for Gemini Interactions providers", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "gemini", type: "gemini_interactions", models: ["gemini-2.5-pro"] }
    ]
  }, "gemini/gemini-2.5-pro");

  assert.equal(model.supports_search_tool, true);
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
  assert.deepEqual(model.supported_reasoning_levels, []);
  assert.equal(model.default_reasoning_level, null);
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

test("codex catalog enables apply_patch bridge for non-GPT models when Codex built-in route enables it", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "openrouter", type: "openai_chat_completions", models: ["google/gemini-2.5-pro"] }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: true },
        codex: { enabled: true }
      },
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: []
    }
  }, "openrouter/google/gemini-2.5-pro");

  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog disables apply_patch bridge for non-GPT models when the Codex built-in route is off", () => {
  const model = catalogModelFor({
    Providers: [
      { name: "openrouter", type: "openai_chat_completions", models: ["google/gemini-2.5-pro"] }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: true },
        codex: { enabled: false }
      },
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: []
    }
  }, "openrouter/google/gemini-2.5-pro");

  assert.equal(model.apply_patch_tool_type, null);
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
        tools: [{ name: "web_prefix_web_search", visibility: "internal" }]
      }
    ]
  }, "deepseek/web-deepseek-chat");

  assert.deepEqual(model.input_modalities, ["text"]);
  assert.equal(model.supports_search_tool, true);
  assert.equal(model.web_search_tool_type, "text");
  assert.equal(model.apply_patch_tool_type, null);
});
