import assert from "node:assert/strict";
import test from "node:test";
import { findClaudeDefaultModelTier, resolveClaudeDefaultTierTarget } from "@ccr/core/gateway/features/claude-default-models.ts";
import { createGatewayModelsResponse, createClaudeCliBootstrapResponse, prepareClaudeCodeDiscoveredModelRequest } from "@ccr/core/gateway/features/model-discovery.ts";
import { isModelAllowedForProfile } from "@ccr/core/profiles/model-allowlist.ts";

const ids = ["claude-fable-5-1[1m]", "claude-opus-5-5[1m]", "claude-sonnet-5-5[1m]", "claude-haiku-5-5"];
const key = { id: "profile:p1" };
function fixture() {
  const profile = {
    id: "p1", agent: "claude-code", enabled: true, claudeDefaultModelList: true,
    availableModels: ["prov/default"], model: "prov/default", sonnetModel: "prov/sonnet-target[1m]",
    haikuModel: "prov/haiku-target"
  };
  const config = {
    Providers: [{
      name: "prov", models: ["default", "sonnet-target", "haiku-target", "sonnet-99"],
      modelMetadata: { "sonnet-target": { contextWindow: 120000 }, "haiku-target": { contextWindow: 1000000 } }
    }],
    profile: { enabled: true, profiles: [profile] }
  };
  return { profile, config };
}

test("family routing accepts new versions and snapshots but preserves explicit providers", () => {
  for (const [model, slot] of [
    ["claude-fable-99-preview", "fableModel"], ["claude-opus-5.5[1m]", "opusModel"],
    [" CLAUDE-SONNET-99-LATEST[1M] ", "sonnetModel"], ["claude-haiku-4-5-20251001", "haikuModel"]
  ]) assert.equal(findClaudeDefaultModelTier(model)?.profileSlot, slot);
  for (const model of [undefined, "", "claude-sonnet-", "claude-unknown-1", "prov/claude-sonnet-5", "claude-sonnet-provider/model"])
    assert.equal(findClaudeDefaultModelTier(model), undefined);
  const { profile } = fixture();
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-sonnet-99"), "prov/sonnet-target");
  assert.equal(resolveClaudeDefaultTierTarget(profile, "claude-opus-99"), "prov/default");
  assert.equal(resolveClaudeDefaultTierTarget({ model: "" }, "claude-opus-99"), undefined);
});

test("the switch admits tier aliases and their targets while retaining other allowlist restrictions", () => {
  const { profile, config } = fixture();
  for (const model of [...ids, "claude-sonnet-99", "prov/sonnet-target"]) {
    assert.equal(isModelAllowedForProfile(config, profile, model), true, model);
    assert.equal(isModelAllowedForProfile(config, { ...profile, claudeDefaultModelList: false }, model), false, model);
  }
  assert.equal(isModelAllowedForProfile(config, profile, "other/model"), false);
  assert.equal(isModelAllowedForProfile(config, profile, "other/claude-sonnet-5"), false);
});

test("discovery and bootstrap share tier IDs and use the selected target context limits", () => {
  const { config } = fixture();
  const cli = createGatewayModelsResponse(config, { "user-agent": "claude-cli/2.1.281" }, key);
  const desktop = createGatewayModelsResponse(config, { "user-agent": "Claude/2.9939.2 Electron/37.0.0" }, key);
  const openai = createGatewayModelsResponse(config, {}, key);
  const bootstrap = createClaudeCliBootstrapResponse(config, key);
  for (const entries of [cli.data, desktop.data, openai.data, bootstrap.additional_model_options])
    assert.deepEqual(entries.map(entry => entry.id), ids);
  assert.ok(cli.data.every(entry => entry.description));
  assert.ok(desktop.data.every(entry => !Object.hasOwn(entry, "description")));
  const sonnet = cli.data.find(entry => entry.id === ids[2]);
  assert.equal(sonnet.max_input_tokens, 120000);
  assert.equal(bootstrap.auto_compact_windows[ids[2]], 120000);
  const haiku = desktop.data.find(entry => entry.id === ids[3]);
  assert.equal(haiku.max_input_tokens, 1000000);
  assert.equal(haiku.supports_1m, false, "Desktop must not create an extra Haiku picker entry");
});

test("switch-off and missing targets do not advertise routable default tiers", () => {
  const { profile, config } = fixture();
  profile.claudeDefaultModelList = false;
  assert.ok(createGatewayModelsResponse(config, {}, key).data.every(entry => !ids.includes(entry.id)));
  profile.claudeDefaultModelList = true;
  profile.model = profile.sonnetModel = profile.haikuModel = "";
  for (const headers of [{}, { "user-agent": "claude-cli/2.1.281" }])
    assert.deepEqual(createGatewayModelsResponse(config, headers, key).data, []);
});

test("tier aliases bypass the old discovered-model prefix rewrite only with the switch enabled", () => {
  const { profile, config } = fixture();
  const headers = { "user-agent": "claude-cli/2.1.281" };
  const body = Buffer.from(JSON.stringify({ model: "claude-sonnet-99", messages: [] }));
  assert.equal(prepareClaudeCodeDiscoveredModelRequest(config, headers, "POST", "/v1/messages", body, { profile }), undefined);
  assert.ok(prepareClaudeCodeDiscoveredModelRequest(config, headers, "POST", "/v1/messages", body));
});
