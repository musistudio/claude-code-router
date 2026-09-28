import assert from "node:assert/strict";
import test from "node:test";
import {
  createVirtualModelDraft,
  createVirtualModelDraftFromProfile,
  isBuiltInFusionToolName,
  selectedFusionToolNamesFromProfile,
  validateVirtualModelDraft,
  virtualModelProfileFromDraft,
  virtualModelProfilesUseMediaTools,
  virtualModelToolSummary
} from "@ccr/ui/pages/home/shared/virtual-models.ts";
import { BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME, BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME } from "@ccr/core/contracts/app.ts";
import { fusionToolOptions } from "@ccr/ui/pages/home/shared/options.ts";
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
  assert.equal("maxToolCalls" in profile.execution, false);
  assert.equal("maxTurns" in profile.execution, false);
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

test("Fusion vision fallback and retry settings round trip through profile metadata", () => {
  const config = appConfigFixture();
  const draft = createVirtualModelDraft(config);
  draft.exactAliasesText = "fusion-vision-fallback";
  draft.fixedModel = "provider/base-model";
  draft.visionModel = "provider/vision-primary";
  draft.visionFallbackModels = ["provider/vision-backup", "provider/vision-backup"];
  draft.visionRetryCount = "2";

  const profile = virtualModelProfileFromDraft(draft, [], undefined);

  assert.equal(metadataString(profile.metadata, "fusionVision", "modelSelector"), "provider/vision-primary");
  assert.deepEqual(metadataStringArray(profile.metadata, "fusionVision", "fallbackModels"), ["provider/vision-backup"]);
  assert.equal(metadataNumber(profile.metadata, "fusionVision", "retryCount"), 2);

  const editDraft = createVirtualModelDraftFromProfile(profile, config);
  assert.equal(editDraft.visionModel, "provider/vision-primary");
  assert.deepEqual(editDraft.visionFallbackModels, ["provider/vision-backup"]);
  assert.equal(editDraft.visionRetryCount, "2");
});

test("image and video generation are generic Fusion tools with independent model bindings", () => {
  const config = appConfigFixture();
  const draft = createVirtualModelDraft(config);
  draft.exactAliasesText = "fusion-media";
  draft.fixedModel = "provider/base-model";
  draft.imageGenerationModel = "Media Provider/grok-imagine-image-quality";
  draft.imageGenerationFallbackModels = ["Media Provider/grok-imagine-image-backup", "Media Provider/grok-imagine-image-backup"];
  draft.imageGenerationRetryCount = "2";
  draft.videoGenerationModel = "Media Provider/grok-imagine-video";
  draft.videoGenerationFallbackModels = ["Media Provider/grok-imagine-video-backup"];
  draft.videoGenerationRetryCount = "1";
  draft.toolsText = `${BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME}, ${BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME}`;

  assert.deepEqual(fusionToolOptions.slice(-2).map((option) => option.value), [BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME, BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME]);
  assert.equal(isBuiltInFusionToolName(BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME), true);
  assert.equal(isBuiltInFusionToolName(BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME), true);
  assert.equal(validateVirtualModelDraft(draft), "");

  const profile = virtualModelProfileFromDraft(draft, [], undefined);
  assert.deepEqual(profile.tools.map((tool) => tool.name), [
    "image_generate_fusion_media",
    "image_edit_fusion_media",
    "video_generate_fusion_media",
    "media_job_get_fusion_media",
    "media_job_cancel_fusion_media"
  ]);
  assert.equal(profile.execution.matchMultimodal, false);
  assert.equal(profile.execution.matchWebSearch, false);
  assert.equal(profile.metadata?.fusionTool, undefined);
  assert.equal(metadataString(profile.metadata, "fusionMedia", "imageModelSelector"), "Media Provider/grok-imagine-image-quality");
  assert.deepEqual(metadataStringArray(profile.metadata, "fusionMedia", "imageFallbackModelSelectors"), ["Media Provider/grok-imagine-image-backup"]);
  assert.equal(metadataNumber(profile.metadata, "fusionMedia", "imageRetryCount"), 2);
  assert.equal(metadataString(profile.metadata, "fusionMedia", "videoModelSelector"), "Media Provider/grok-imagine-video");
  assert.deepEqual(metadataStringArray(profile.metadata, "fusionMedia", "videoFallbackModelSelectors"), ["Media Provider/grok-imagine-video-backup"]);
  assert.equal(metadataNumber(profile.metadata, "fusionMedia", "videoRetryCount"), 1);
  const editDraft = createVirtualModelDraftFromProfile(profile, config);
  assert.equal(editDraft.toolsText, `${BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME}, ${BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME}`);
  assert.equal(editDraft.imageGenerationModel, "Media Provider/grok-imagine-image-quality");
  assert.deepEqual(editDraft.imageGenerationFallbackModels, ["Media Provider/grok-imagine-image-backup"]);
  assert.equal(editDraft.imageGenerationRetryCount, "2");
  assert.equal(editDraft.videoGenerationModel, "Media Provider/grok-imagine-video");
  assert.deepEqual(editDraft.videoGenerationFallbackModels, ["Media Provider/grok-imagine-video-backup"]);
  assert.equal(editDraft.videoGenerationRetryCount, "1");
  assert.equal(virtualModelProfilesUseMediaTools([profile]), true);
  assert.equal(virtualModelToolSummary(profile), "Image generation (Media Provider/grok-imagine-image-quality), Video generation (Media Provider/grok-imagine-video)");
  assert.deepEqual(selectedFusionToolNamesFromProfile(editDraft.tools, profile), [BUILTIN_FUSION_IMAGE_GENERATION_TOOL_NAME, BUILTIN_FUSION_VIDEO_GENERATION_TOOL_NAME]);
});

test("an imported Grok Agent supplies default API media models", () => {
  const config = appConfigFixture();
  config.Providers = [{
    apiKey: "ccr-local-agent-login",
    baseUrl: "https://cli-chat-proxy.grok.com/v1",
    models: ["grok-4.5"],
    name: "Imported Grok"
  }];
  const draft = createVirtualModelDraft(config);
  assert.equal(draft.imageGenerationModel, "Imported Grok/grok-imagine-image-quality");
  assert.equal(draft.videoGenerationModel, "Imported Grok/grok-imagine-video");
});

function metadataString(metadata: Record<string, unknown> | undefined, key: string, field: string): string | undefined {
  const value = metadata?.[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function metadataStringArray(metadata: Record<string, unknown> | undefined, key: string, field: string): string[] | undefined {
  const value = metadata?.[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return Array.isArray(fieldValue) ? fieldValue.filter((item): item is string => typeof item === "string") : undefined;
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string, field: string): number | undefined {
  const value = metadata?.[key];
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "number" ? fieldValue : undefined;
}
