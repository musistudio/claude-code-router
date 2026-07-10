import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeAppGatewayInferenceModels,
  buildClaudeAppGatewayModelRoutes
} from "../../packages/core/src/agents/claude-app/gateway-routes.ts";
import { createGatewayModelsResponseForTest } from "../../packages/core/src/gateway/service.ts";

function configWithProviders(Providers) {
  return {
    Providers,
    profile: { profiles: [] },
    virtualModelProfiles: []
  };
}

function routeFor(config, targetModel) {
  const route = buildClaudeAppGatewayModelRoutes(config).find((item) => item.targetModel === targetModel);
  assert.ok(route, `expected route for ${targetModel}`);
  return route;
}

function inferenceModelFor(config, labelOverride) {
  const model = buildClaudeAppGatewayInferenceModels(config).find((item) => item.labelOverride === labelOverride);
  assert.ok(model, `expected inference model ${labelOverride}`);
  return model;
}

test("Claude App gateway marks Sakana fugu models as 1M context by provider endpoint", () => {
  const config = configWithProviders([
    {
      baseUrl: "https://api.sakana.ai/v1",
      models: ["fugu-ultra"],
      name: "Sakana",
      type: "openai_chat_completions"
    },
    {
      baseurl: "https://api.sakana.ai/v1",
      models: ["fugu"],
      name: "provider-sakana-adbc620029::openai_chat_completions",
      type: "openai_chat_completions"
    }
  ]);

  assert.equal(routeFor(config, "Sakana/fugu-ultra").oneMillionContext, true);
  assert.equal(
    routeFor(config, "provider-sakana-adbc620029::openai_chat_completions/fugu").oneMillionContext,
    true
  );
  assert.equal(inferenceModelFor(config, "Sakana/fugu-ultra").supports1m, true);
  assert.equal(
    inferenceModelFor(config, "provider-sakana-adbc620029::openai_chat_completions/fugu").supports1m,
    true
  );
});

test("Claude App gateway does not mark fugu-like models as 1M outside Sakana", () => {
  const config = configWithProviders([
    {
      baseUrl: "https://example.com/v1",
      models: ["fugu-ultra"],
      name: "Custom",
      type: "openai_chat_completions"
    }
  ]);

  assert.equal(routeFor(config, "Custom/fugu-ultra").oneMillionContext, false);
  assert.equal(inferenceModelFor(config, "Custom/fugu-ultra").supports1m, undefined);
});

test("Claude App gateway keeps explicit [1m] suffix support", () => {
  const config = configWithProviders([
    {
      baseUrl: "https://example.com/v1",
      models: ["custom-long-context[1m]"],
      name: "Custom",
      type: "openai_chat_completions"
    }
  ]);

  assert.equal(routeFor(config, "Custom/custom-long-context").oneMillionContext, true);
});

test("Sakana 1M metadata is limited to Claude-compatible model responses", () => {
  const config = configWithProviders([
    {
      baseUrl: "https://api.sakana.ai/v1",
      models: ["fugu-ultra"],
      name: "Sakana",
      type: "openai_chat_completions"
    }
  ]);

  const openAiResponse = createGatewayModelsResponseForTest(config, { "user-agent": "openai-client" });
  const openAiModel = openAiResponse.data.find((item) => item.id === "Sakana/fugu-ultra");
  assert.ok(openAiModel, "expected generic OpenAI-compatible response to include Sakana/fugu-ultra");
  assert.equal(openAiModel.max_input_tokens, undefined);
  assert.equal(openAiModel.capabilities, undefined);

  const claudeResponse = createGatewayModelsResponseForTest(config, { "user-agent": "claude-code" });
  const sakanaClaudeModel = claudeResponse.data.find((item) => item.display_name === "Sakana/fugu-ultra");
  assert.ok(sakanaClaudeModel, "expected Claude-compatible response to include Sakana/fugu-ultra");
  assert.equal(sakanaClaudeModel.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel.capabilities.context_management.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel.capabilities.context_window.supported, true);
  assert.equal(sakanaClaudeModel.capabilities.context_window.supports_1m_context, true);
  assert.equal(sakanaClaudeModel.capabilities.context_window.one_million_context_variant, true);

  const sakanaClaudeModel1m = claudeResponse.data.find((item) => item.id.endsWith("[1m]"));
  assert.ok(sakanaClaudeModel1m, "expected Claude-compatible response to include Sakana/fugu-ultra[1m]");
  assert.equal(sakanaClaudeModel1m.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_management.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.supported, true);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.supports_1m_context, true);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.one_million_context_variant, true);
});
