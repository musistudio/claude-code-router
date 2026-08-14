import assert from "node:assert/strict";
import test from "node:test";
import { buildClaudeAppGatewayModelRoutes } from "@ccr/core/agents/claude-app/gateway-routes.ts";
import { createClaudeCliBootstrapResponse, createGatewayModelsResponse } from "@ccr/core/gateway/features/model-discovery.ts";
import {
  filterModelIdsForProfile,
  isModelAllowedForProfile,
  profileAllowedModels,
  profileForApiKey
} from "@ccr/core/profiles/model-allowlist.ts";
import {
  profileAllowedRouteFallbackForTest,
  profileDeniedModelForTest
} from "@ccr/core/gateway/request/pipeline.ts";
import { profileApiKeyId } from "@ccr/core/profiles/api-key.ts";

function testConfig(profileOverrides = {}) {
  const profile = {
    agent: "codex",
    enabled: true,
    id: "work",
    model: "Provider/alpha",
    name: "Work",
    scope: "ccr",
    ...profileOverrides
  };
  return {
    Providers: [
      { models: ["alpha", "beta"], name: "Provider", type: "openai_responses" },
      { models: ["gamma"], name: "Other", type: "openai_responses" }
    ],
    profile: {
      enabled: true,
      profiles: [profile]
    },
    Router: {
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    virtualModelProfiles: []
  };
}

test("profile model allowlist resolves profile API keys and filters model IDs", () => {
  const config = testConfig({ availableModels: ["Provider/alpha"] });
  const profile = config.profile.profiles[0];
  const apiKey = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: profileApiKeyId(profile),
    key: "profile-key",
    name: "Profile: Work"
  };

  assert.equal(profileForApiKey(config, apiKey), profile);
  assert.deepEqual(profileAllowedModels(profile), ["Provider/alpha"]);
  assert.deepEqual(
    filterModelIdsForProfile(config, ["Provider/alpha", "Provider/beta", "Other/gamma"], profile),
    ["Provider/alpha"]
  );
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/alpha"), true);
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/beta"), false);
});

test("profile model allowlist keeps existing all-model behavior when unset", () => {
  const config = testConfig();
  const profile = config.profile.profiles[0];

  assert.equal(profileAllowedModels(profile), undefined);
  assert.deepEqual(
    filterModelIdsForProfile(config, ["Provider/alpha", "Provider/beta", "Other/gamma"], profile),
    ["Provider/alpha", "Provider/beta", "Other/gamma"]
  );
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/beta"), true);
});

test("profile model allowlist does not add implicit defaults to explicit lists", () => {
  const config = testConfig({ availableModels: ["Provider/beta"], model: "" });
  const profile = config.profile.profiles[0];

  assert.deepEqual(profileAllowedModels(profile), ["Provider/beta"]);
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/alpha"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/beta"), true);
});

test("profile model allowlist does not treat configured claude-prefixed models as discovery aliases", () => {
  const config = testConfig({
    availableModels: ["Provider/sonnet"],
    model: "Provider/sonnet"
  });
  config.Providers = [{
    models: ["sonnet", "claude-sonnet"],
    name: "Provider",
    type: "openai_responses"
  }];
  const profile = config.profile.profiles[0];

  assert.equal(isModelAllowedForProfile(config, profile, "claude-sonnet"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/claude-sonnet"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "claude-Provider/sonnet"), true);
  assert.equal(isModelAllowedForProfile(config, profile, "Provider/sonnet[1m]"), true);
});

test("profile model allowlist resolves Claude App encoded route IDs", () => {
  const config = testConfig({ availableModels: ["Provider/alpha"] });
  const profile = config.profile.profiles[0];
  const apiKey = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: profileApiKeyId(profile),
    key: "profile-key",
    name: "Claude App"
  };
  const response = createGatewayModelsResponse(config, {}, apiKey);
  const routeId = response.data[0]?.id;
  const betaRouteId = buildClaudeAppGatewayModelRoutes(config).find((route) =>
    route.targetModel === "Provider/beta"
  )?.id;

  assert.ok(routeId);
  assert.notEqual(routeId, "Provider/alpha");
  assert.ok(betaRouteId);
  assert.equal(isModelAllowedForProfile(config, profile, routeId), true);
  assert.equal(isModelAllowedForProfile(config, profile, betaRouteId), false);
});

test("profile model access is decided by the final routed model", () => {
  const config = testConfig({ availableModels: ["Provider/alpha"] });
  const profile = config.profile.profiles[0];

  assert.equal(
    profileDeniedModelForTest(config, profile, "Provider/alpha", "Provider/beta"),
    "Provider/beta"
  );
  assert.equal(
    profileDeniedModelForTest(config, profile, "Provider/beta", "Provider/alpha"),
    undefined
  );
});

test("profile model allowlist filters model-chain fallback attempts", () => {
  const config = testConfig({ availableModels: ["Provider/alpha"] });
  const profile = config.profile.profiles[0];

  assert.deepEqual(
    profileAllowedRouteFallbackForTest(config, profile, {
      mode: "model-chain",
      models: ["Provider/beta", "Provider/alpha", "Other/gamma"],
      retryCount: 0
    }),
    {
      mode: "model-chain",
      models: ["Provider/alpha"],
      retryCount: 0
    }
  );
});

test("gateway model discovery uses the authenticated profile allowlist", () => {
  const config = testConfig({ availableModels: ["Provider/alpha"] });
  const profile = config.profile.profiles[0];
  const apiKey = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: profileApiKeyId(profile),
    key: "profile-key",
    name: "Profile: Work"
  };

  const response = createGatewayModelsResponse(config, {}, apiKey);
  assert.deepEqual(response.data.map((model) => model.id), ["Provider/alpha"]);

  const unrestricted = createGatewayModelsResponse(config, {}, {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "general",
    key: "general-key",
    name: "General"
  });
  assert.deepEqual(unrestricted.data.map((model) => model.id), ["Provider/alpha", "Provider/beta", "Other/gamma"]);
});

test("Claude CLI bootstrap options are filtered by profile allowlist", () => {
  const config = testConfig({
    agent: "claude-code",
    availableModels: ["Provider/alpha"],
    scope: "global"
  });
  const profile = config.profile.profiles[0];
  const apiKey = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: profileApiKeyId(profile),
    key: "profile-key",
    name: "Profile: Work"
  };

  const response = createClaudeCliBootstrapResponse(config, apiKey);
  assert.equal(response.additional_model_options.length, 1);
});
