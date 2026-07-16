import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeAppGatewayInferenceModels,
  buildClaudeAppGatewayModelRoutes,
  effectiveProviderModelContextWindow,
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
  return createGatewayModelsResponse(
    config,
    { "user-agent": "claude-app/1.0" },
    { name: "Claude App" }
  );
}

function createClaudeCodeModelsResponse(config) {
  return createGatewayModelsResponse(config, { "user-agent": "claude-cli/2.1.215" });
}

function createFrontierProvider() {
  return {
    modelMetadata: {
      "custom-frontier": {
        contextWindow: 1_000_000,
        maxContextWindow: 1_000_000
      }
    },
    models: ["custom-frontier"],
    name: "Gateway",
    type: "openai_responses"
  };
}

function createVirtualModelProfile({ baseModel, exactAliases = [], id, prefixes = [], suffixes = [] }) {
  return {
    baseModel,
    displayName: id,
    enabled: true,
    execution: {
      clientToolsPolicy: "allow",
      maxToolCalls: 1,
      maxTurns: 1,
      mode: "decorate_only",
      streamMode: "buffered"
    },
    id,
    key: id,
    match: { exactAliases, prefixes, suffixes },
    materialization: { enabled: true, includeInGatewayModels: true },
    tools: []
  };
}

function findPublishedClaudeAppRoute(config, targetModel) {
  const route = buildClaudeAppGatewayModelRoutes(config).find((item) => item.targetModel === targetModel);
  assert.ok(route, `expected published route for ${targetModel}`);
  const inferenceModel = buildClaudeAppGatewayInferenceModels(config).find((item) => item.name === route.id);
  assert.ok(inferenceModel, `expected inference model for ${targetModel}`);
  const model = createClaudeModelsResponse(config).data.find((item) => item.id === route.id);
  assert.ok(model, `expected model discovery entry for ${targetModel}`);
  return { inferenceModel, model, route };
}

function assertOneMillionVirtualRoute(config, targetModel) {
  const { inferenceModel, model, route } = findPublishedClaudeAppRoute(config, targetModel);

  assert.equal(route.oneMillionContext, true);
  assert.equal(inferenceModel.supports1m, true);
  assert.equal(model.max_input_tokens, 1_000_000);
  assert.equal(model.capabilities.context_management.max_input_tokens, 1_000_000);
  assert.equal(model.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(model.capabilities.context_window.supports_1m_context, true);
  assert.equal(model.capabilities.context_window.one_million_context_variant, true);
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

test("Claude App marks a custom model with a configured 1M context window", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          aaa: {
            contextWindow: 1_000_000,
            maxContextWindow: 1_000_000
          }
        },
        models: ["aaa"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const inferenceModel = buildClaudeAppGatewayInferenceModels(config)[0];
  const discoveredModel = createClaudeModelsResponse(config).data[0];

  assert.equal(route.oneMillionContext, true);
  assert.equal(inferenceModel.supports1m, true);
  assert.equal(discoveredModel.max_input_tokens, 1_000_000);
  assert.equal(discoveredModel.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(discoveredModel.capabilities.context_window.supports_1m_context, true);
  assert.equal(discoveredModel.capabilities.context_window.one_million_context_variant, true);
});

test("Claude Code exposes a configured 1M context window as a visible model variant", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          aaa: {
            contextWindow: 1_000_000,
            maxContextWindow: 1_000_000
          }
        },
        models: ["aaa"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ]
  });
  const discoveredModel = createClaudeCodeModelsResponse(config).data[0];

  assert.match(discoveredModel.id, /\[1m\]$/);
  assert.equal(discoveredModel.display_name, "Zhipu AI (China) - Coding Plan/aaa (1M context)");
  assert.equal(discoveredModel.max_input_tokens, 1_000_000);
  assert.equal(discoveredModel.capabilities.context_window.one_million_context_variant, true);

  const rewrite = prepareClaudeAppDiscoveredModelRequest(
    config,
    "POST",
    "/v1/messages",
    Buffer.from(JSON.stringify({ messages: [], model: discoveredModel.id }))
  );
  assert.equal(rewrite?.routedModel, "Zhipu AI (China) - Coding Plan/aaa");
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
  assert.equal(route.oneMillionContext, false);
  assert.equal(buildClaudeAppGatewayInferenceModels(config)[0].supports1m, undefined);
  assert.equal(model.max_input_tokens, 258400);
  assert.equal(model.capabilities.context_management.max_input_tokens, 258400);
  assert.equal(model.capabilities.context_window.max_input_tokens, 258400);
  assert.equal(model.capabilities.context_window.supports_1m_context, false);
  assert.equal(model.capabilities.context_window.one_million_context_variant, false);
});

test("Claude App discovery honors configured reasoning levels for uncatalogued models", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "custom-model": {
            capabilities: { imageInput: false },
            contextWindow: 64000,
            supportedReasoningLevels: [
              { description: "Low", effort: "low" },
              { description: "High", effort: "high" },
              { description: "Ultra", effort: "ultra" }
            ],
            supportsReasoningSummaries: true
          }
        },
        models: ["custom-model"],
        name: "Custom",
        type: "openai_responses"
      }
    ]
  });
  const response = createClaudeModelsResponse(config);
  const model = response.data[0];

  assert.ok(model);
  assert.equal(model.max_input_tokens, 64000);
  assert.equal(model.capabilities.image_input.supported, false);
  assert.equal(model.capabilities.thinking.supported, true);
  assert.equal(model.capabilities.effort.low.supported, true);
  assert.equal(model.capabilities.effort.medium.supported, false);
  assert.equal(model.capabilities.effort.high.supported, true);
  assert.equal(model.capabilities.effort.xhigh.supported, false);
  assert.equal(model.capabilities.effort.max.supported, false);
  assert.equal(model.capabilities.effort.ultra.supported, true);
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
  assert.equal(route.oneMillionContext, false);
  assert.equal(buildClaudeAppGatewayInferenceModels(config)[0].supports1m, undefined);
  assert.equal(model.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_management.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_window.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_window.supports_1m_context, false);
  assert.equal(model.capabilities.context_window.one_million_context_variant, false);
});

test("Claude App discovery lets provider metadata enable one-million context", () => {
  const config = createConfig({
    providers: [
      {
        modelMetadata: {
          "custom-frontier": {
            contextWindow: 1_000_000,
            maxContextWindow: 1_000_000
          }
        },
        models: ["custom-frontier"],
        name: "Gateway",
        type: "openai_responses"
      }
    ]
  });
  const route = buildClaudeAppGatewayModelRoutes(config)[0];
  const inferenceModel = buildClaudeAppGatewayInferenceModels(config)[0];
  const response = createClaudeModelsResponse(config);
  const model = response.data.find((item) => item.id === route.id);

  assert.ok(model);
  assert.equal(route.oneMillionContext, true);
  assert.equal(inferenceModel.supports1m, true);
  assert.equal(model.max_input_tokens, 1_000_000);
  assert.equal(model.capabilities.context_window.supports_1m_context, true);
  assert.equal(model.capabilities.context_window.one_million_context_variant, true);
});

test("Claude App discovery resolves provider context through a virtual prefix profile", () => {
  const config = createConfig({
    providers: [createFrontierProvider()],
    virtualModelProfiles: [
      createVirtualModelProfile({
        baseModel: { mode: "strip_prefix" },
        id: "tools-prefix",
        prefixes: ["tools-"]
      })
    ]
  });

  assertOneMillionVirtualRoute(config, "Gateway/tools-custom-frontier");
});

test("Claude App discovery resolves provider context through a virtual suffix profile", () => {
  const config = createConfig({
    providers: [createFrontierProvider()],
    virtualModelProfiles: [
      createVirtualModelProfile({
        baseModel: { mode: "strip_suffix" },
        id: "tools-suffix",
        suffixes: ["-tools"]
      })
    ]
  });

  assertOneMillionVirtualRoute(config, "Gateway/custom-frontier-tools");
});

test("Claude App discovery resolves provider context through a fixed-alias profile", () => {
  const config = createConfig({
    providers: [createFrontierProvider()],
    virtualModelProfiles: [
      createVirtualModelProfile({
        baseModel: { fixedModel: "Gateway/custom-frontier", mode: "fixed" },
        exactAliases: ["frontier-tools"],
        id: "frontier-tools"
      })
    ]
  });

  assertOneMillionVirtualRoute(config, "Fusion/frontier-tools");
});

test("Claude App discovery keeps physical metadata distinct from a colliding fixed alias", () => {
  const config = createConfig({
    providers: [
      createFrontierProvider(),
      {
        modelMetadata: {
          tiny: {
            contextWindow: 128_000,
            maxContextWindow: 128_000
          }
        },
        models: ["tiny"],
        name: "Small",
        type: "openai_responses"
      }
    ],
    virtualModelProfiles: [
      createVirtualModelProfile({
        baseModel: { fixedModel: "Small/tiny", mode: "fixed" },
        exactAliases: ["custom-frontier"],
        id: "custom-frontier-alias"
      })
    ]
  });
  const physical = findPublishedClaudeAppRoute(config, "Gateway/custom-frontier");
  const virtual = findPublishedClaudeAppRoute(config, "Fusion/custom-frontier");

  assert.notEqual(physical.route.id, virtual.route.id);
  assert.equal(effectiveProviderModelContextWindow(config, physical.route.targetModel), 1_000_000);
  assert.equal(physical.route.oneMillionContext, true);
  assert.equal(physical.inferenceModel.supports1m, true);
  assert.equal(physical.model.max_input_tokens, 1_000_000);
  assert.equal(physical.model.capabilities.context_window.max_input_tokens, 1_000_000);

  assert.equal(effectiveProviderModelContextWindow(config, virtual.route.targetModel), 128_000);
  assert.equal(virtual.route.oneMillionContext, false);
  assert.equal(virtual.inferenceModel.supports1m, undefined);
  assert.equal(virtual.model.max_input_tokens, 128_000);
  assert.equal(virtual.model.capabilities.context_window.max_input_tokens, 128_000);
});

test("Claude App discovery falls back safely for cyclic fixed-alias profiles", () => {
  const config = createConfig({
    providers: [createFrontierProvider()],
    virtualModelProfiles: [
      createVirtualModelProfile({
        baseModel: { fixedModel: "Fusion/loop-b", mode: "fixed" },
        exactAliases: ["loop-a"],
        id: "loop-a"
      }),
      createVirtualModelProfile({
        baseModel: { fixedModel: "Fusion/loop-a", mode: "fixed" },
        exactAliases: ["loop-b"],
        id: "loop-b"
      })
    ]
  });
  const { inferenceModel, model, route } = findPublishedClaudeAppRoute(config, "Fusion/loop-a");

  assert.equal(effectiveProviderModelContextWindow(config, "Fusion/loop-a"), undefined);
  assert.equal(route.oneMillionContext, false);
  assert.equal(inferenceModel.supports1m, undefined);
  assert.equal(model.max_input_tokens, 0);
  assert.equal(model.capabilities.context_window, undefined);
});

test("Claude App discovery rejects an explicit one-million suffix for a bounded provider model", () => {
  const config = createConfig({
    profileModel: "Codex API/gpt-5-codex[1m]",
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
  assert.equal(inferClaudeAppGatewayTargetModel(config), "Codex API/gpt-5-codex");
  assert.equal(route.oneMillionContext, false);
  assert.equal(route.targetModel, "Codex API/gpt-5-codex");
  assert.equal(model.max_input_tokens, 244800);
  assert.equal(model.capabilities.context_window.supports_1m_context, false);
  assert.equal(model.capabilities.context_window.one_million_context_variant, false);
});

test("Claude App discovery does not number a deduplicated bounded context route", () => {
  const config = createConfig({
    profileModel: "Codex API/gpt-5-codex[1m]",
    providers: [
      {
        modelMetadata: {
          "gpt-5-codex": {
            contextWindow: 272000,
            maxContextWindow: 272000
          }
        },
        models: ["gpt-5-codex"],
        name: "Codex API",
        type: "openai_responses"
      }
    ]
  });
  const routes = buildClaudeAppGatewayModelRoutes(config);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].displayName, "Codex API/gpt-5-codex");
});
