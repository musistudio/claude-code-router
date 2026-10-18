import assert from "node:assert/strict";
import test from "node:test";
import { bailianProviderPreset } from "@ccr/core/providers/presets/bailian/index.ts";
import { setProviderPresets } from "@ccr/ui/pages/home/shared/external.tsx";
import {
  createProviderDraft,
  createProviderDraftFromProvider,
  providerPresetDraftDefaults,
  providerProbeCandidates
} from "@ccr/ui/pages/home/shared/providers.ts";

setProviderPresets([bailianProviderPreset]);

function bailianDraft(patch = {}) {
  const draft = createProviderDraft([]);
  draft.presetId = "bailian";
  draft.presetUsesTemplateEndpoints = true;
  Object.assign(draft, patch);
  return draft;
}

test("provider preset draft defaults select the workspace domain mode with an empty workspace ID", () => {
  const defaults = providerPresetDraftDefaults(bailianProviderPreset);
  assert.equal(defaults.presetUsesTemplateEndpoints, true);
  assert.equal(defaults.baseUrl, "");
  assert.deepEqual(defaults.presetEndpointVariables, { Region: "cn-beijing" });
  assert.equal(defaults.protocol, "openai_chat_completions");
  assert.deepEqual(defaults.selectedProtocols, ["openai_chat_completions", "anthropic_messages"]);
});

test("probe candidates follow the selected domain type", () => {
  const staticCandidates = providerProbeCandidates(bailianDraft({ presetUsesTemplateEndpoints: false }));
  assert.deepEqual(
    staticCandidates.map((candidate) => candidate.baseUrl),
    ["https://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/apps/anthropic"]
  );

  const workspaceCandidates = providerProbeCandidates(
    bailianDraft({ presetEndpointVariables: { WorkspaceId: "ws-unit", Region: "cn-hongkong" } })
  );
  assert.deepEqual(
    workspaceCandidates.map((candidate) => candidate.baseUrl),
    ["https://ws-unit.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1", "https://ws-unit.cn-hongkong.maas.aliyuncs.com/apps/anthropic"]
  );
  assert.deepEqual(workspaceCandidates[1].protocols, ["anthropic_messages"]);

  assert.deepEqual(providerProbeCandidates(bailianDraft({ presetEndpointVariables: { Region: "cn-beijing" } })), []);
});

test("editing a saved workspace provider restores the template variables", () => {
  const draft = createProviderDraftFromProvider({
    api_base_url: "https://ws-unit.us-east-1.maas.aliyuncs.com/compatible-mode/v1",
    api_key: "sk-test",
    models: ["qwen3-coder-plus"],
    name: "Bailian"
  });
  assert.equal(draft.presetId, "bailian");
  assert.equal(draft.presetUsesTemplateEndpoints, true);
  assert.deepEqual(draft.presetEndpointVariables, { WorkspaceId: "ws-unit", Region: "us-east-1" });

  const dashscopeDraft = createProviderDraftFromProvider({
    api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key: "sk-test",
    models: ["qwen3-coder-plus"],
    name: "Bailian"
  });
  assert.equal(dashscopeDraft.presetId, "bailian");
  assert.equal(dashscopeDraft.presetUsesTemplateEndpoints, false);
  assert.deepEqual(dashscopeDraft.presetEndpointVariables, {});
});
