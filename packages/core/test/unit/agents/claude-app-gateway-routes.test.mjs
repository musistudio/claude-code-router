import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeAppGatewayInferenceModels,
  buildClaudeAppGatewayModelRoutes
} from "@ccr/core/agents/claude-app/gateway-routes";
import { createClaudeCodeModelsResponseForTest } from "@ccr/core/gateway/service";

function configWithProviders(Providers) {
  return {
    Providers: Providers.map((provider) => ({
      ...provider,
      enabled: provider.enabled !== false
    })),
    profile: {
      enabled: true,
      profiles: []
    },
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

  // Check routes first
  const routes = buildClaudeAppGatewayModelRoutes(config);
  const sakanaRoute = routes.find((r) => r.targetModel === "Sakana/fugu-ultra");
  const providerRoute = routes.find((r) => r.targetModel === "provider-sakana-adbc620029::openai_chat_completions/fugu");
  
  assert.ok(sakanaRoute, "expected route for Sakana/fugu-ultra");
  assert.equal(sakanaRoute.oneMillionContext, true);
  assert.ok(providerRoute, "expected route for provider-sakana-adbc620029::openai_chat_completions/fugu");
  assert.equal(providerRoute.oneMillionContext, true);
  
  // Check inference models
  const models = buildClaudeAppGatewayInferenceModels(config);
  const sakanaModel = models.find((m) => m.labelOverride === sakanaRoute.displayName);
  const providerModel = models.find((m) => m.labelOverride === providerRoute.displayName);
  
  assert.ok(sakanaModel, `expected inference model with label ${sakanaRoute.displayName}`);
  assert.equal(sakanaModel.supports1m, true);
  assert.ok(providerModel, `expected inference model with label ${providerRoute.displayName}`);
  assert.equal(providerModel.supports1m, true);
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
  const config = {
    Providers: [{
      baseUrl: "https://api.sakana.ai/v1",
      models: ["fugu-ultra"],
      name: "Sakana",
      type: "openai_chat_completions",
      enabled: true
    }],
    profile: {
      enabled: true,
      profiles: []
    },
    virtualModelProfiles: []
  };

  const claudeResponse = createClaudeCodeModelsResponseForTest(config);
  
  // Find the Sakana model (IDs are prefixed with "claude-")
  const sakanaClaudeModel = claudeResponse.data.find((item) => 
    item.id.toLowerCase().includes("fugu-ultra") && !item.id.endsWith("[1m]")
  );
  
  assert.ok(sakanaClaudeModel, "expected Claude-compatible response to include Sakana fugu-ultra model");
  assert.equal(sakanaClaudeModel.max_input_tokens, 1_000_000, "max_input_tokens should be 1M");
  assert.equal(sakanaClaudeModel.capabilities.context_management.max_input_tokens, 1_000_000, "context_management.max_input_tokens should be 1M");
  assert.equal(sakanaClaudeModel.capabilities.context_window.max_input_tokens, 1_000_000, "context_window.max_input_tokens should be 1M");
  assert.equal(sakanaClaudeModel.capabilities.context_window.supported, true, "context_window.supported should be true");
  assert.equal(sakanaClaudeModel.capabilities.context_window.supports_1m_context, true, "context_window.supports_1m_context should be true");
  assert.equal(sakanaClaudeModel.capabilities.context_window.one_million_context_variant, true, "context_window.one_million_context_variant should be true");

  const sakanaClaudeModel1m = claudeResponse.data.find((item) =>
    item.id.toLowerCase().includes("fugu-ultra") && item.id.endsWith("[1m]")
  );
  assert.ok(sakanaClaudeModel1m, "expected Claude-compatible response to include Sakana fugu-ultra [1m] variant");
  assert.equal(sakanaClaudeModel1m.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_management.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.supported, true);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.supports_1m_context, true);
  assert.equal(sakanaClaudeModel1m.capabilities.context_window.one_million_context_variant, true);
});
