import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCodexModelCatalog } from "@ccr/core/agents/codex/model-catalog.ts";

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
  for (const effort of ["low", "medium", "high"]) {
    assert.ok(model.supported_reasoning_levels.some((level) => level.effort === effort));
  }
  assert.equal(model.default_reasoning_level, "medium");
  assert.equal(model.apply_patch_tool_type, "freeform");
});

test("codex catalog exposes current capabilities for the GPT-5.6 family", () => {
  for (const modelName of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    const model = catalogModelFor({
      Providers: [
        { name: "uuroute", type: "openai_responses", models: [modelName] }
      ]
    }, `uuroute/${modelName}`);

    assert.equal(model.context_window, 1_050_000);
    assert.equal(model.max_context_window, 1_050_000);
    assert.deepEqual(model.input_modalities, ["text", "image"]);
    assert.equal(model.supports_image_detail_original, true);
    assert.equal(model.supports_parallel_tool_calls, true);
    assert.equal(model.supports_reasoning_summaries, true);
    assert.deepEqual(model.supported_reasoning_levels.map((level) => level.effort), [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]);
    assert.equal(model.default_reasoning_level, "medium");
  }
});

test("codex catalog uses provider model metadata for reasoning effort and speed tiers", () => {
  const model = catalogModelFor({
    Providers: [
      {
        modelMetadata: {
          "gpt-5-codex": {
            additionalSpeedTiers: [{ id: "fast", label: "Fast" }],
            contextWindow: 272000,
            defaultReasoningLevel: "high",
            defaultReasoningSummary: "auto",
            effectiveContextWindowPercent: 91,
            maxContextWindow: 300000,
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
  assert.equal(model.context_window, 272000);
  assert.equal(model.default_reasoning_level, "high");
  assert.equal(model.default_reasoning_summary, "auto");
  assert.equal(model.effective_context_window_percent, 91);
  assert.equal(model.max_context_window, 300000);
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
          context_window: 272000,
          default_reasoning_level: "high",
          effective_context_window_percent: 92,
          max_context_window: 300000,
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
    assert.equal(model.context_window, 272000);
    assert.equal(model.default_reasoning_level, "high");
    assert.equal(model.effective_context_window_percent, 92);
    assert.equal(model.max_context_window, 300000);
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

test("codex catalog marks image-recognition Fusion aliases as image capable", () => {
  const model = catalogModelFor({
    Providers: [],
    virtualModelProfiles: [
      {
        displayName: "Vision Fusion",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchMultimodal: true,
          maxToolCalls: 4,
          maxTurns: 4,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "vision-fusion",
        key: "vision",
        match: { exactAliases: ["vision"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionVision: { modelSelector: "provider/vision-model", toolName: "vision_understand_vision" }
        },
        tools: [{ name: "vision_understand_vision", visibility: "internal" }]
      }
    ]
  }, "Fusion/vision");

  assert.deepEqual(model.input_modalities, ["text", "image"]);
  assert.equal(model.supports_image_detail_original, true);
  assert.equal(model.web_search_tool_type, "text");
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
