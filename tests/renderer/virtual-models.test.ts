import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "../../src/shared/default-config.ts";
import {
  createVirtualModelDraft,
  validateVirtualModelDraft,
  virtualModelProfileFromDraft
} from "../../src/renderer/pages/home/shared/virtual-models.ts";

test("Fusion draft saves multiple selected tools into one profile", () => {
  const config = createDefaultAppConfig({ generatedConfigFile: "/tmp/ccr-generated.json" });
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
    "web_search_fusion_plus",
    "lookup_customer"
  ]);
  assert.equal(profile.execution.matchMultimodal, true);
  assert.equal(profile.execution.matchWebSearch, true);
  assert.equal(profile.execution.maxToolCalls, 8);
  assert.equal(metadataString(profile.metadata, "fusionVision", "toolName"), "vision_understand_fusion_plus");
  assert.equal(metadataString(profile.metadata, "fusionWebSearch", "toolName"), "web_search_fusion_plus");
  assert.equal(metadataString(profile.metadata, "fusionTool", "mcpServerName"), "customer-tools");
});

function metadataString(metadata: Record<string, unknown> | undefined, key: string, field: string): string | undefined {
  const value = metadata?.[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
