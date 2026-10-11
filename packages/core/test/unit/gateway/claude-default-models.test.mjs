import assert from "node:assert/strict";
import test from "node:test";

import {
  findClaudeDefaultModelTier,
  isClaudeDefaultModelListEnabled,
  resolveClaudeDefaultTierTarget
} from "@ccr/core/gateway/features/claude-default-models.ts";
import {
  claudeClientDiscoveryPayloads,
  createClaudeCliBootstrapResponse,
  createGatewayModelsResponse,
  prepareClaudeCodeDiscoveredModelRequest,
  prepareClaudeDefaultTierModelRequest
} from "@ccr/core/gateway/features/model-discovery.ts";
import {
  isModelAllowedForProfile,
  profileAllowedModels
} from "@ccr/core/profiles/model-allowlist.ts";


test("claude default model tiers match request names with and without the [1m] suffix", () => {
  assert.equal(findClaudeDefaultModelTier("claude-fable-5-1")?.profileSlot, "fableModel");
  assert.equal(findClaudeDefaultModelTier("claude-fable-5-1[1m]")?.profileSlot, "fableModel");
  assert.equal(findClaudeDefaultModelTier("claude-opus-5-5")?.profileSlot, "opusModel");
  assert.equal(findClaudeDefaultModelTier("claude-opus-5-5[1m]")?.profileSlot, "opusModel");
  assert.equal(findClaudeDefaultModelTier("CLAUDE-SONNET-5[1M]")?.profileSlot, "sonnetModel");
  assert.equal(findClaudeDefaultModelTier("claude-sonnet-5-5")?.profileSlot, "sonnetModel");
  assert.equal(findClaudeDefaultModelTier("CLAUDE-SONNET-5-5[1M]")?.profileSlot, "sonnetModel");
  assert.equal(findClaudeDefaultModelTier("claude-haiku-4-5")?.profileSlot, "haikuModel");
});


test("Claude family routing accepts versions and suffixes independently of discovery IDs", () => {
  for (const [family, slot] of [
    ["fable", "fableModel"],
    ["opus", "opusModel"],
    ["sonnet", "sonnetModel"],
    ["haiku", "haikuModel"]
  ]) {
    for (const suffix of ["5", "5.1", "99-1", "99-1-20990101", "99-1-2099010", "99-1-preview", "latest"]) {
      const model = `claude-${family}-${suffix}`;
      assert.equal(findClaudeDefaultModelTier(model)?.profileSlot, slot, model);
      assert.equal(findClaudeDefaultModelTier(` ${model.toUpperCase()}[1M] `)?.profileSlot, slot, model);
    }
  }
});


test("Claude family routing excludes other families, empty suffixes, and explicit providers", () => {
  for (const model of [
    undefined,
    "",
    "claude-fable-",
    "claude-opus-[1m]",
    "claude-sonnet",
    "claude-haikux-99-1",
    "claude-unknown-99-1",
    "prefix-claude-sonnet-99-1",
    "claude-3-5-haiku-20241022",
    "CCS/claude-sonnet-99-1",
    "CCS,claude-sonnet-99-1",
    "claude-fable-provider/claude-sonnet-99-1",
    "claude-fable-provider,claude-sonnet-99-1",
    "prov/glm-5.3"
  ]) {
    assert.equal(findClaudeDefaultModelTier(model), undefined, model);
  }
});


test("tier targets resolve through profile slots with the default model fallback", () => {
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    haikuModel: "prov/qwen3.6-plus",
    id: "p1",
    model: "prov/default",
    opusModel: "prov/opus-target[1m]",
    sonnetModel: "prov/sonnet-target"
  };
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-sonnet-5[1m]"), "prov/sonnet-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-sonnet-5-5[1m]"), "prov/sonnet-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-opus-5-5"), "prov/opus-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-fable-5-1"), "prov/default");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-haiku-4-5"), "prov/qwen3.6-plus");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-haiku-4-5-20251001"), "prov/qwen3.6-plus");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-fable-99-1"), "prov/default");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-opus-99-1[1m]"), "prov/opus-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-sonnet-99-1-preview"), "prov/sonnet-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-haiku-99-1-20990101"), "prov/qwen3.6-plus");
  assert.equal(resolveClaudeDefaultTierTarget({ model: "prov/default" }, "claude-haiku-4-5-20251001"), "prov/default");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "prov/glm-5.3"), undefined);
  assert.equal(resolveClaudeDefaultTierTarget({ model: "" }, "claude-fable-5-1"), undefined);
  assert.equal(resolveClaudeDefaultTierTarget(undefined, "claude-fable-5-1"), undefined);
});


test("isClaudeDefaultModelListEnabled only accepts an explicit true", () => {
  assert.equal(isClaudeDefaultModelListEnabled(undefined), false);
  assert.equal(isClaudeDefaultModelListEnabled({}), false);
  assert.equal(isClaudeDefaultModelListEnabled({ claudeDefaultModelList: false }), false);
  assert.equal(isClaudeDefaultModelListEnabled({ claudeDefaultModelList: true }), true);
});


test("default model list mode extends the allowlist with tier names and slot targets only", () => {
  const profile = {
    agent: "claude-code",
    availableModels: ["only/this"],
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "prov/default",
    sonnetModel: "prov/sonnet-target"
  };
  const allowed = profileAllowedModels(profile);
  assert.ok(allowed);
  for (const model of [
    "only/this",
    "prov/default",
    "prov/sonnet-target",
    "claude-sonnet-5-5[1m]",
    "claude-fable-5-1",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001"
  ]) {
    assert.ok(allowed.includes(model), `allowlist should include ${model}`);
  }
  assert.equal(isModelAllowedForProfile({ Providers: [] }, profile, "claude-opus-5-5"), true);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, profile, "prov/sonnet-target"), true);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, profile, "claude-sonnet-5[1m]"), true);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, profile, "claude-sonnet-5-5"), true);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, profile, "other/model"), false);

  const disabled = { ...profile, claudeDefaultModelList: false };
  assert.notEqual(profileAllowedModels(disabled), undefined);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, disabled, "claude-opus-5-5"), false);

  const unrestricted = { ...profile, availableModels: [] };
  assert.equal(profileAllowedModels(unrestricted), undefined);
  assert.equal(isModelAllowedForProfile({ Providers: [] }, unrestricted, "anything/else"), true);
});


test("Claude family IDs pass profile allowlists only in default model list mode", () => {
  const config = { Providers: [] };
  const profile = {
    availableModels: ["prov/default"],
    claudeDefaultModelList: true,
    haikuModel: "prov/qwen3.6-plus",
    model: "prov/default"
  };
  for (const model of [
    "claude-fable-99-1",
    "claude-opus-99-1[1m]",
    "claude-sonnet-99-1-preview",
    "claude-haiku-99-1-20990101",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "CLAUDE-HAIKU-4-5-20251001[1M]",
    "claude-haiku-4-5-20251001-extra"
  ]) {
    assert.equal(isModelAllowedForProfile(config, profile, model), true, model);
    assert.equal(isModelAllowedForProfile(config, { ...profile, claudeDefaultModelList: false }, model), false, model);
    assert.equal(isModelAllowedForProfile(config, { ...profile, claudeDefaultModelList: undefined }, model), false, model);
  }
  assert.equal(isModelAllowedForProfile(config, profile, "prov/qwen3.6-plus"), true);
  assert.equal(isModelAllowedForProfile(config, profile, "other/claude-haiku-4-5-20251001"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "claude-unknown-99-1"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "other/model"), false);
});


test("tier requests skip the claude-code discovered-model rewrite", () => {
  const config = {
    Providers: [{
      name: "p",
      models: ["sonnet-5", "haiku-4-5-20251001", "fable-99-1", "opus-99-1", "sonnet-99-1", "haiku-99-1"],
      api_base_url: "https://example.invalid",
      api_key: "k"
    }]
  };
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "p/default",
    sonnetModel: "p/sonnet-target"
  };
  const headers = { "user-agent": "claude-cli/1.0" };
  for (const [model, providerModel] of [
    ["claude-sonnet-5[1m]", "sonnet-5"],
    ["claude-haiku-4-5-20251001", "haiku-4-5-20251001"],
    ["claude-fable-99-1", "fable-99-1"],
    ["claude-opus-99-1[1m]", "opus-99-1"],
    ["claude-sonnet-99-1", "sonnet-99-1"],
    ["claude-haiku-99-1[1m]", "haiku-99-1"]
  ]) {
    const body = Buffer.from(JSON.stringify({ model, messages: [] }));
    assert.equal(prepareClaudeCodeDiscoveredModelRequest(config, headers, "POST", "/v1/messages", body, { profile }), undefined);

    const withoutProfile = prepareClaudeCodeDiscoveredModelRequest(config, headers, "POST", "/v1/messages", body, {});
    assert.ok(withoutProfile, "non-tier mode keeps rewriting claude-<provider-model> names");
    assert.equal(JSON.parse(withoutProfile.body.toString("utf8")).model, providerModel);
  }
});


test("tier requests rewrite through the profile slots on every protocol endpoint", () => {
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "prov/default",
    fableModel: "prov/fable-target",
    opusModel: "prov/opus-target",
    haikuModel: "prov/haiku-target",
    sonnetModel: "prov/sonnet-target"
  };
  const paths = ["/v1/messages", "/v1/chat/completions", "/v1/responses"];
  for (const path of paths) {
    for (const [model, target] of [
      ["claude-fable-99-1", "prov/fable-target"],
      ["claude-opus-99-1[1m]", "prov/opus-target"],
      ["claude-sonnet-99-1-preview", "prov/sonnet-target"],
      ["claude-haiku-99-1-20990101", "prov/haiku-target"]
    ]) {
      const body = Buffer.from(JSON.stringify({ max_tokens: 8, messages: [], model }));
      const result = prepareClaudeDefaultTierModelRequest("POST", path, body, { profile });
      assert.ok(result, `expected a tier rewrite for ${model} on ${path}`);
      assert.equal(JSON.parse(result.body.toString("utf8")).model, target);
      assert.equal(result.routedModel, target);
      assert.match(result.diagnostic, /\(default model list\)$/);
      for (const disabled of [undefined, { ...profile, claudeDefaultModelList: false }]) {
        assert.equal(prepareClaudeDefaultTierModelRequest("POST", path, body, { profile: disabled }), undefined);
      }
    }
  }

  const unadvertised = prepareClaudeDefaultTierModelRequest(
    "POST",
    "/v1/messages/count_tokens",
    Buffer.from(JSON.stringify({ model: "claude-sonnet-5[1m]" })),
    { profile }
  );
  assert.equal(unadvertised, undefined);

  const body = Buffer.from(JSON.stringify({ max_tokens: 8, messages: [], model: "claude-sonnet-5[1m]" }));
  const disabled = prepareClaudeDefaultTierModelRequest("POST", "/v1/messages", body, {
    profile: { ...profile, claudeDefaultModelList: false }
  });
  assert.equal(disabled, undefined);
});


test("bootstrap auto-compact windows follow the slot target context window", () => {
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "prov/default",
    sonnetModel: "prov/sonnet-target"
  };
  const config = {
    Providers: [
      {
        models: ["sonnet-target", "default"],
        name: "prov",
        modelMetadata: { "sonnet-target": { contextWindow: 120_000 } }
      }
    ],
    profile: { enabled: true, profiles: [profile] }
  };
  const apiKey = { id: "profile:p1" };
  const bootstrap = createClaudeCliBootstrapResponse(config, apiKey);
  const windows = bootstrap.auto_compact_windows ?? {};
  assert.equal(windows["claude-sonnet-5-5"], 120_000);
  assert.equal(windows["claude-sonnet-5-5[1m]"], 120_000);
  assert.notEqual(windows["claude-sonnet-5-5"], 1_000_000);
});


test("models response returns the fixed tier list when the switch is on", () => {
  const profile = {
    agent: "claude-code",
    availableModels: ["prov/allowed"],
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "prov/default"
  };
  const config = { Providers: [], profile: { enabled: true, profiles: [profile] } };
  const apiKey = { id: "profile:p1" };
  const headers = { "user-agent": "claude-desktop/1.0" };

  const response = createGatewayModelsResponse(config, headers, apiKey);
  assert.deepEqual(
    response.data.map((entry) => entry.id),
    ["claude-fable-5-1[1m]", "claude-opus-5-5[1m]", "claude-sonnet-5-5[1m]", "claude-haiku-4-5-20251001"]
  );
  assert.deepEqual(
    response.data.map((entry) => entry.display_name),
    ["Fable 5.1", "Opus 5.5", "Sonnet 5.5", "Haiku 4.5"]
  );
  const descriptions = [
    "Fable 5.1 · Most capable for your hardest and longest-running tasks",
    "Opus 5.5 with 1M context · Best for everyday, complex tasks",
    "Sonnet 5.5 for long sessions",
    "Haiku 4.5 · Fastest for quick answers"
  ];
  assert.ok(response.data.every((entry) => !Object.hasOwn(entry, "description")));
  assert.equal(response.has_more, false);
  const cliResponse = createGatewayModelsResponse(config, { "user-agent": "claude-cli/2.1.281" }, apiKey);
  assert.deepEqual(cliResponse.data, response.data.map((entry, index) => ({ ...entry, description: descriptions[index] })));
  const bootstrap = createClaudeCliBootstrapResponse(config, apiKey);
  assert.deepEqual(
    bootstrap.additional_model_options.map((entry) => entry.id),
    response.data.map((entry) => entry.id)
  );
  assert.deepEqual(bootstrap.additional_model_options.map((entry) => entry.description), descriptions);
  const openAiResponse = createGatewayModelsResponse(config, {}, apiKey);
  assert.deepEqual(openAiResponse.data.map((entry) => entry.id), response.data.map((entry) => entry.id));
  assert.deepEqual(openAiResponse.data.map((entry) => entry.description), descriptions);

  const disabledProfile = { ...profile, claudeDefaultModelList: false };
  const disabledConfig = { Providers: [], profile: { enabled: true, profiles: [disabledProfile] } };
  const disabledResponse = createGatewayModelsResponse(disabledConfig, headers, apiKey);
  assert.equal(
    disabledResponse.data.some((entry) => entry.id === "claude-sonnet-5-5[1m]"),
    false
  );

  const emptyTargetProfile = { ...profile, model: "" };
  const emptyTargetConfig = { Providers: [], profile: { enabled: true, profiles: [emptyTargetProfile] } };
  const emptyTargetResponse = createGatewayModelsResponse(emptyTargetConfig, headers, apiKey);
  assert.deepEqual(emptyTargetResponse.data, []);
});


test("default model descriptions distinguish Desktop and CLI with a shared Claude App key", () => {
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    id: "p1",
    model: "prov/default"
  };
  const config = { Providers: [], profile: { enabled: true, profiles: [profile] } };
  const apiKey = { id: "profile:p1", name: "Claude App" };
  const payloads = claudeClientDiscoveryPayloads(config, { profile });

  for (const userAgent of [
    "claude-desktop/2.9939.2",
    "Claude Desktop/2.9939.2",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/2.9939.2 Chrome/138.0.0.0 Electron/37.0.0 Safari/537.36",
    "Claude/2.9939.2 MSIX",
    "claude-cli/2.1.281 (external, claude-desktop)",
    "claude-cli/2.1.281 (external, claude-desktop-3p)"
  ]) {
    const response = createGatewayModelsResponse(config, { "user-agent": userAgent }, apiKey);
    assert.deepEqual(response, payloads.claudeApp, userAgent);
    assert.ok(response.data.every((entry) => !Object.hasOwn(entry, "description")), userAgent);
  }
  assert.deepEqual(createGatewayModelsResponse(config, {}, apiKey), payloads.claudeApp);

  for (const userAgent of ["claude-cli/2.1.281 (external, cli)", "claude-code/2.1.281"]) {
    const response = createGatewayModelsResponse(config, { "user-agent": userAgent }, apiKey);
    assert.deepEqual(response, payloads.claudeCode, userAgent);
    assert.ok(response.data.every((entry) => typeof entry.description === "string"), userAgent);
  }
  assert.deepEqual(
    payloads.bootstrap.additional_model_options.map((entry) => entry.description),
    payloads.claudeCode.data.map((entry) => entry.description)
  );
});


test("default Haiku tier suppresses Desktop's inferred 1M variant while preserving target limits", () => {
  const profile = {
    agent: "claude-code",
    claudeDefaultModelList: true,
    enabled: true,
    haikuModel: "prov/long-context",
    id: "p1",
    model: "prov/default"
  };
  const config = {
    Providers: [{
      models: ["default", "long-context"],
      name: "prov",
      modelMetadata: { "long-context": { contextWindow: 1_000_000 } }
    }],
    profile: { enabled: true, profiles: [profile] }
  };
  const apiKey = { id: "profile:p1" };
  const response = createGatewayModelsResponse(config, { "user-agent": "claude-desktop/2.2553.1" }, apiKey);
  const haiku = response.data.find((entry) => entry.id === "claude-haiku-4-5-20251001");

  assert.equal(response.data.length, 4);
  assert.ok(haiku);
  assert.equal(haiku.supports_1m, false);
  assert.equal(haiku.max_input_tokens, 1_000_000);
  assert.equal(haiku.capabilities.context_window.max_input_tokens, 1_000_000);
  assert.equal(haiku.capabilities.context_window.supports_1m_context, true);

  const bootstrap = createClaudeCliBootstrapResponse(config, apiKey);
  assert.equal(bootstrap.auto_compact_windows[haiku.id], 1_000_000);
  assert.equal(bootstrap.auto_compact_windows["claude-haiku-4-5"], 1_000_000);
});
