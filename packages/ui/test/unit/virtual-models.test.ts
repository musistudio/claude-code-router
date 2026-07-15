import assert from "node:assert/strict";
import test from "node:test";
import {
  createVirtualModelDraft,
  createVirtualModelDraftFromProfile,
  validateVirtualModelDraft,
  virtualModelProfileFromDraft
} from "@ccr/ui/pages/home/shared/virtual-models.ts";
import { appConfigFixture } from "../fixtures/index.ts";

test("Fusion draft saves multiple selected tools into one profile", () => {
  const config = appConfigFixture();
  const draft = createVirtualModelDraft(config);
  draft.exactAliasesText = "fusion-plus";
  draft.fixedModel = "provider/base-model";
  draft.visionModel = "provider/vision-model";
  draft.toolsText = "vision_understand, web_search, lookup_customer";
  draft.customMcpServer = {
    ...draft.customMcpServer,
    command: "node",
    name: "customer-tools"
  };

  assert.equal(validateVirtualModelDraft(draft), "");

  const profile = virtualModelProfileFromDraft(draft, [], undefined);

  assert.deepEqual(profile.tools.map((tool) => tool.name), [
    "vision_understand_fusion_plus",
    "fusion_plus_web_search",
    "lookup_customer"
  ]);
  assert.equal(profile.execution.matchMultimodal, true);
  assert.equal(profile.execution.matchWebSearch, true);
  assert.equal(profile.execution.maxToolCalls, 8);
  assert.equal(profile.execution.clientToolsPolicy, "allow");
  assert.equal(profile.execution.streamMode, "optimistic");
  assert.equal(metadataString(profile.metadata, "fusionVision", "toolName"), "vision_understand_fusion_plus");
  assert.equal(metadataString(profile.metadata, "fusionWebSearch", "toolName"), "fusion_plus_web_search");
  assert.equal(metadataString(profile.metadata, "fusionTool", "mcpServerName"), "customer-tools");
});

test("Fusion default editing keeps client tools allowed", () => {
  const config = appConfigFixture();
  const draft = createVirtualModelDraft(config);
  draft.exactAliasesText = "fusion-default-tools";
  draft.fixedModel = "provider/base-model";
  draft.visionModel = "provider/vision-model";

  const profile = virtualModelProfileFromDraft(draft, [], undefined);
  profile.execution.clientToolsPolicy = "deny";

  const editDraft = createVirtualModelDraftFromProfile(profile, config);
  assert.equal(editDraft.clientToolsPolicy, "allow");

  const savedProfile = virtualModelProfileFromDraft(editDraft, [], undefined);
  assert.equal(savedProfile.execution.clientToolsPolicy, "allow");
});

function metadataString(metadata: Record<string, unknown> | undefined, key: string, field: string): string | undefined {
  const value = metadata?.[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
