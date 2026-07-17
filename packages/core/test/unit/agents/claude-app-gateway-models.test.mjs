import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeAppGatewayInferenceModels,
  buildClaudeAppGatewayModelRoutes,
  inferClaudeAppGatewayTargetModel,
  resolveClaudeAppGatewayRouteModel
} from "@ccr/core/agents/claude-app/gateway-routes.ts";
import {
  createGatewayModelsResponse,
  prepareClaudeAppDiscoveredModelRequest
} from "@ccr/core/gateway/features/model-discovery.ts";
import { ModelRegistry } from "@ccr/core/routing/model-registry.ts";

function createConfig({ profileModel, providers = [], virtualModelProfiles = [] } = {}) {
  return {
    Providers: providers.map((provider) => ({ ...provider })),
    profile: {
      enabled: true,
      profiles: profileModel === undefined
        ? []
        : [{
            agent: "claude-code",
            enabled: true,
            id: "claude-code-global",
            model: profileModel,
            name: "Claude Code",
            scope: "global"
          }]
    },
    virtualModelProfiles
  };
}

function createClaudeModelsResponse(config) {
  return createGatewayModelsResponse(config, { "user-agent": "claude-app/1.0" });
}

function assertPublishedRoutesResolveUniquely(config) {
  const registry = new ModelRegistry(config);
  const routes = buildClaudeAppGatewayModelRoutes(config);
  const response = createClaudeModelsResponse(config);

  assert.deepEqual(response.data.map((model) => model.id), routes.map((route) => route.id));
  for (const route of routes) {
    assert.equal(resolveClaudeAppGatewayRouteModel(route.id, config), route.targetModel);
    assert.equal(registry.resolve(route.targetModel)?.canonicalSelector, route.targetModel);
  }
}

test("issue 1535 Claude App discovery defaults to the first configured provider model", () => {
  const config = createConfig({
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);
  const response = createClaudeModelsResponse(config);

  assert.equal(inferClaudeAppGatewayTargetModel(config), "Provider-1/gpt-4.1");
  assert.equal(routes[0].targetModel, "Provider-1/gpt-4.1");
  assert.equal(response.first_id, routes[0].id);
  assert.equal(routes.some((route) => route.targetModel === "claude-sonnet-4-5"), false);
  assertPublishedRoutesResolveUniquely(config);
});

test("issue 1535 the discovered default is routable and the bare fallback resolves to a provider", () => {
  const config = createConfig({
    providers: [
      { models: ["AED"], name: "provider-1" },
      { models: ["claude-sonnet-4-5"], name: "provider-2" },
      { models: ["deepseek-v4-flash"], name: "provider-3" }
    ]
  });
  const response = createClaudeModelsResponse(config);

  assert.equal(
    response.data.some((model) => model.id === "claude-sonnet-4-5"),
    false,
    "the unroutable bare fallback must never be published by GET /v1/models"
  );
  assert.ok(response.first_id, "discovery must publish a routable default model");

  const rewritten = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ messages: [], model: response.first_id }))
  );
  assert.equal(
    rewritten?.routedModel,
    "provider-1/AED",
    "the discovered default must round-trip to a provider-prefixed selector instead of model-chain fallback"
  );

  const registry = new ModelRegistry(config);
  assert.equal(
    registry.resolve("claude-sonnet-4-5")?.canonicalSelector,
    "provider-2/claude-sonnet-4-5",
    "a bare fallback model id must resolve to a provider rather than going unroutable"
  );
});

test("issue 1535 Claude App discovery canonicalizes a uniquely configured bare profile model", () => {
  const config = createConfig({
    profileModel: "claude-sonnet-4-5",
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);

  assert.equal(inferClaudeAppGatewayTargetModel(config), "Provider-2/claude-sonnet-4-5");
  assert.equal(routes[0].targetModel, "Provider-2/claude-sonnet-4-5");
  assertPublishedRoutesResolveUniquely(config);
});

test("issue 1535 duplicate provider model names keep distinct deterministic Claude App routes", () => {
  const config = createConfig({
    profileModel: "claude-sonnet-4-5",
    providers: [
      { models: ["claude-sonnet-4-5"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);

  assert.equal(inferClaudeAppGatewayTargetModel(config), "Provider-1/claude-sonnet-4-5");
  assert.deepEqual(
    routes.map((route) => route.targetModel),
    ["Provider-1/claude-sonnet-4-5", "Provider-2/claude-sonnet-4-5"]
  );
  assert.equal(new Set(routes.map((route) => route.id.toLowerCase())).size, 2);
  assertPublishedRoutesResolveUniquely(config);
});

test("issue 1535 historical fallback IDs are never special-cased", () => {
  const configuredLegacyModel = createConfig({
    providers: [
      { models: ["gpt-4.1"], name: "Provider-1" },
      { models: ["claude-sonnet-4-5"], name: "Provider-2" }
    ]
  });
  const unconfiguredLegacyModel = createConfig({
    providers: [{ models: ["gpt-4.1"], name: "Provider-1" }]
  });
  const body = Buffer.from(JSON.stringify({ messages: [], model: "claude-sonnet-4-5" }));

  assert.equal(prepareClaudeAppDiscoveredModelRequest(
    configuredLegacyModel,
    "POST",
    "/v1/messages",
    body
  ), undefined);
  assert.equal(prepareClaudeAppDiscoveredModelRequest(
    unconfiguredLegacyModel,
    "POST",
    "/v1/messages",
    body
  ), undefined);
  assert.equal(
    buildClaudeAppGatewayModelRoutes(unconfiguredLegacyModel)
      .some((route) => route.id === "claude-sonnet-4-5" || route.targetModel === "claude-sonnet-4-5"),
    false
  );
});

test("issue 1535 Claude App discovery publishes no synthetic model without configured providers", () => {
  const config = createConfig();
  const response = createClaudeModelsResponse(config);

  assert.equal(inferClaudeAppGatewayTargetModel(config), undefined);
  assert.deepEqual(buildClaudeAppGatewayModelRoutes(config), []);
  assert.deepEqual(buildClaudeAppGatewayInferenceModels(config), []);
  assert.deepEqual(response.data, []);
  assert.equal(response.first_id, null);
  assert.equal(response.last_id, null);
  assert.equal(
    prepareClaudeAppDiscoveredModelRequest(
      config,
      "POST",
      "/v1/messages",
      Buffer.from(JSON.stringify({ messages: [], model: "claude-sonnet-4-5" }))
    ),
    undefined
  );
});

test("issue 1535 canonical profile resolution preserves the Claude App 1M context variant", () => {
  const config = createConfig({
    profileModel: "claude-opus-4-1[1m]",
    providers: [{ models: ["claude-opus-4-1"], name: "Anthropic" }]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);

  assert.equal(inferClaudeAppGatewayTargetModel(config), "Anthropic/claude-opus-4-1[1m]");
  assert.equal(routes[0].targetModel, "Anthropic/claude-opus-4-1");
  assert.equal(routes[0].oneMillionContext, true);
  assertPublishedRoutesResolveUniquely(config);
});

test("Claude App discovery publishes the effective provider context for uncatalogued models", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "gpt-5.6-sol": {
            contextWindow: 272000,
            effectiveContextWindowPercent: 95,
            maxContextWindow: 272000
          }
        },
        models: ["gpt-5.6-sol"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const response = createClaudeModelsResponse(config);
  const model = response.data.find((item) => item.id === route.id);

  assert.ok(model);
  assert.equal(model.max_input_tokens, 258400);
  assert.equal(model.capabilities.context_management.max_input_tokens, 258400);
  assert.equal(model.capabilities.context_window.max_input_tokens, 258400);
});

test("Claude App discovery prefers provider context metadata over the static catalog", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "gpt-5-codex": {
            contextWindow: 272000,
            effectiveContextWindowPercent: 90,
            maxContextWindow: 272000
          }
        },
        models: ["gpt-5-codex"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const response = createClaudeModelsResponse(config);
  const model = response.data.find((item) => item.id === route.id);

  assert.ok(model);
  assert.equal(model.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_management.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_window.max_input_tokens, 244800);
});
